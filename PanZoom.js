//##############################################################################
//# HELPER FUNCTIONS
//##############################################################################

// TODO: add mobile touch events
var moveEventList   = ["mousemove"];
var downEventList   = ["mousedown"];
var upEventList     = ["mouseup"];

function arrayContains(arr, item) {
    return (arr.indexOf(item) > -1);
}

function moveEvent(event) {
    if (arrayContains(moveEventList, event.type)) 
        return true;
    return false;
}

function downEvent(event) {
    if (arrayContains(downEventList, event.type)) 
        return true;
    return false;
}

function upEvent(event) {
    if (arrayContains(upEventList, event.type)) 
        return true;
    return false;
}



//##############################################################################
//# Mouse class 
//##############################################################################
class Mouse {
    constructor() {
        this.pos = { x: 0, y: 0 };
        this.worldPos = { x: 0, y: 0 };
        this.posLast  = { x: 0, y: 0 };
        
        this.button = false;
        this.overId = "";
        this.dragging = false;
        this.whichWheel = -1;
        this.wheel = 0;
    }
}



//##############################################################################
//# Rectangle class 
//##############################################################################
class Rectangle {
    constructor(left, right, top, bot) {
        this.left  = left  || 0;
        this.right = right || 0;
        this.top   = top   || 0;
        this.bot   = bot   || 0;
    }
}



//##############################################################################
//# Quadratic Out Tween 
//##############################################################################
function easeQuadraticOut(t, b, c, d) {
    t = t / d;
    return -c * t * (t - 2) + b;
}

class Tween {
    constructor(from, to, duration, updateFn, finishFn, tweenFn) {
        this.duration = duration;
        this.updateFn = updateFn;
        this.finishFn = finishFn;
        this.tweenFn  = tweenFn;
        this.t = 0;
        this.from = {...from};
        this.to   = {...to};
        this.curr = {...from};
        this.started = false; 
        this.startTime = -1;   
        this.ended = false; 
        this.change = {...to};
        for (var key in to) {
            if (!this.from.hasOwnProperty(key)) continue;
            this.change[key] = to[key] - from[key];
        }
    }

    start(startTime) {
        this.started = true;
        this.startTime = startTime;
    }

    update(currentTime) {
        // If tween has ended then return
        if (this.ended || !this.started) 
            return;

        this.t = currentTime - this.startTime;
        this.t = (this.t > this.duration) ? this.duration : this.t;

        for (var key in this.curr) {
            if (!this.from.hasOwnProperty(key)) continue;
            // Can use any tween function here
            this.curr[key] = this.tweenFn(this.t, 
                                          this.from[key], 
                                          this.change[key], 
                                          this.duration);
        }

        this.updateFn(this.curr);

        if (this.t === this.duration) {
            this.ended = true;
            this.finishFn();
        } 
    }
}



//##############################################################################
//# PanZoom class 
//##############################################################################
class PanZoom {
    constructor(canvas, canvas_id, imgSrc) {
        // Set canvas and context
        this.canvas = canvas;
        this.canvas_id = canvas_id;
        this.ctx = canvas.getContext('2d');

        // Mouse
        this.mouse = new Mouse();

        // Scale
        this.scale = 1;
        this.maxScale = 70;
        this.minScale =  1;

        // Navigational tweens to make canvas feel more responsive
        this.boundsTween = undefined;
        this.scrollTween = undefined;
        this.panTween    = undefined;
        this.panVector = this.zeroPos();

        // Pan momentum
        this.momentum = 1;

        // If true, disallow panning outside of specified bounds
        this.useConstraint = true;

        // If true, ease back into bounds instead of instantaneously snapping
        this.easeOutOfBounds = true;

        // Transform and inverse transform
        this.m  = [1, 0, 0, 1, 0, 0];
        this.im = [1, 0, 0, 1, 0, 0];

        // Set to true on first frame
        this.started = false;

        // Keeps track of how long the canvas has been running
        this.currentTime = 0;

        // Load image onto the canvas and begin rendering
        this.loadImageAndStart(imgSrc);
    }

    loadImageAndStart(imgSrc) {
        // Set canvas image
		this.img = new Image();
		this.img.onload = () => {
            // Get pixel width and height of image
            this.width  = this.img.width;
            this.height = this.img.height;

            // Add event listeners
            window.addEventListener('resize', this.resizeCanvas.bind(this), false);

            // Bounds to contstrain canvas. Can create an inner or outer border
            this.bounds = new Rectangle(0, this.width, 0, this.height);

            // Enable mouse and touch listeners
            this.initializeMouseListener();

            // Initial draw
            this.resizeCanvas();
            this.minScale = this.scale;
		}
        // Set image source, img.onLoad is called once loaded
		this.img.src = imgSrc;
    }

    initializeMouseListener() {
        // List of events that we want to handle
        var events = "touchmove,"   +
                     "touchstart,"  + 
                     "touchend,"    + 
                     "touchcancel," +
                     "mousemove,"   + 
                     "mousedown,"   + 
                     "mouseup,"     + 
                     "mousewheel,"  + 
                     "wheel,"       + 
                     "DOMMouseScroll";

        // Event handler function
        var eHandler = this.eventHandler.bind(this);
            
        // Bind each event to the event handler function
        events.split(",").forEach(e=>document.addEventListener(e, eHandler));
    }

    update() {
        // TODO: reafactor this if statement away
        if (this.momentum !== 1)
            this.scaleIt(this.momentum);

        // Set transformation matrix
        // TODO: refactor this away
        this.setScale(this.m, this.scale, this.scale);

        if (this.scrollTween || this.panTween)
            this.hardBound();

        // Constrain to bounds
        // TODO: Fix if statement
        if(this.outOfBounds() && this.useConstraint && this.momentum === 1 && this.easeOutOfBounds) 
            this.constrain();

        // Compute inverse transformation matrix
        var cross = this.m[0] * this.m[3] - this.m[1] * this.m[2];
        this.setSkew(this.im, -this.m[1] / cross, -this.m[2] / cross);
        this.setScale(this.im, this.m[3] / cross,  this.m[0] / cross);
        
        this.ctx.setTransform(this.m[0], this.m[1], this.m[2], this.m[3], 
                        this.m[4], this.m[5]);
    }
  
    constrain() {
        if (this.boundsTween || this.mouse.dragging)
            return;
        this.startBoundsTween();
    }

    worldPosTopLeft() {
        return { x : this.bounds.left, y : this.bounds.top };
    }

    worldPosBotRight() {
        return { x : this.bounds.right, y : this.bounds.bot };
    }
    
    screenPosTopLeft() {
        return this.toScreen(this.worldPosTopLeft());
    }

    screenPosBotRight() {
        return this.toScreen(this.worldPosBotRight());
    }

    zeroPos() {
        return { x:0, y:0 };
    }

    pos() {
        return { x:this.m[4], y:this.m[5] };
    }

    setSkew(matrix, xSkew, ySkew) {
        matrix[1] = xSkew;
        matrix[2] = ySkew;
    }

    setScale(matrix, xScale, yScale) {
        matrix[0] = xScale;
        matrix[3] = yScale;
    }

    setTranslation(matrix, xPos, yPos) {
        matrix[4] = xPos;
        matrix[5] = yPos;
    }

    toWorld(from) {  
        // convert screen to world coords
        var xx, yy;
        var point = this.zeroPos();
        xx = from.x - this.m[4];     
        yy = from.y - this.m[5];     
        point.x = xx * this.im[0] + yy * this.im[2]; 
        point.y = xx * this.im[1] + yy * this.im[3];
        return point;
    }

    toScreen(from) {  
        // convert world coords to screen coords
        var point = this.zeroPos();
        point.x = from.x * this.m[0] + from.y * this.m[2] + this.m[4]; 
        point.y = from.x * this.m[1] + from.y * this.m[3] + this.m[5];
        return point;
    }

    scaleIt(amount) {
        var maxScale = Math.max(
	        window.innerWidth  / (this.bounds.right - this.bounds.left),
	        window.innerHeight / (this.bounds.bot   - this.bounds.top)
        );

        this.scale *= amount;
        
        var oldScale = Math.round(this.scale/amount * 100) / 100;
        if (this.scale < maxScale) {
	        amount = maxScale/oldScale;
	        this.scale = maxScale;
	        if(Math.abs(1 - amount) < 0.01) {
		        amount = 1;
	        }
        }

        if (this.scale > this.maxScale) {
	        amount = this.maxScale/oldScale;
	        this.scale = this.maxScale;	
        }

        this.m[4] = this.mouse.pos.x - (this.mouse.pos.x - this.m[4]) * amount;
        this.m[5] = this.mouse.pos.y - (this.mouse.pos.y - this.m[5]) * amount;
    }

    move(x, y) {  
        // move in screen coords
        this.m[4] += x;
        this.m[5] += y;
    }

    setBounds(top, left, right, bot) {
        this.bounds.top   = top;
        this.bounds.left  = left;
        this.bounds.right = right;
        this.bounds.bot   = bot;
    }

    resizeCanvas() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width  = this.canvas.width  + "px"; 
        this.canvas.style.height = this.canvas.height + "px"; 
        this.viewportCenter = {
            x : window.innerWidth  / 2, 
            y : window.innerHeight / 2 
        };	

        //
        this.scaleIt(1);

        if (!this.started) {
            this.started = true;
            requestAnimationFrame(this.draw.bind(this));
        }
	}

    // TODO: refactor with dest() and hardbound()
    outOfBounds() {
        // Handle movement out of top and left side of bounds
        var screenPosTopLeft = this.screenPosTopLeft();
        if (screenPosTopLeft.x > 0)
            return true;
        if (screenPosTopLeft.y > 0)
            return true;

        // Handle movement out of bottom and right side of bounds
        var screenPosBotRight = this.screenPosBotRight();
        if (screenPosBotRight.x < this.canvas.width)
            return true;
        if (screenPosBotRight.y < this.canvas.height)
            return true;

        return false;
    }

    // TODO: refactor with hardbound() and outOfBounds()
    dest() {
        var d = this.pos();
        // Handle movement out of top and left side of bounds
        var screenPosTopLeft = this.screenPosTopLeft();
        if (screenPosTopLeft.x > 0)
            d.x -= screenPosTopLeft.x;
        if (screenPosTopLeft.y > 0)
            d.y -= screenPosTopLeft.y;

        // Handle movement out of bottom and right side of bounds
        var screenPosBotRight = this.screenPosBotRight();
        if (screenPosBotRight.x < this.canvas.width)
            d.x -= (screenPosBotRight.x - this.canvas.width);
        if (screenPosBotRight.y < this.canvas.height)
            d.y -= (screenPosBotRight.y - this.canvas.height);
        return d;
    }

    // TODO: refactor with dest() and outOfBounds()
    hardBound() {
        // Handle movement out of top and left side of bounds
        var screenPosTopLeft = this.screenPosTopLeft();
        if (screenPosTopLeft.x > 0)
            this.m[4] -= screenPosTopLeft.x;
        if (screenPosTopLeft.y > 0)
            this.m[5] -= screenPosTopLeft.y;

        // Handle movement out of bottom and right side of bounds
        var screenPosBotRight = this.screenPosBotRight();
        if (screenPosBotRight.x < this.canvas.width)
            this.m[4] -= screenPosBotRight.x - this.canvas.width;
        if (screenPosBotRight.y < this.canvas.height)
            this.m[5] -= screenPosBotRight.y - this.canvas.height;
    }

    clearCanvas() {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw(currentTime) {
        // Store reference to total passed time
        this.currentTime = currentTime;

	    // Clear canvas with white
        this.ctx.imageSmoothingEnabled = false;
        this.clearCanvas();

        // Update image transformation matrix and draw image
        this.update();
        this.ctx.drawImage(this.img, 0,0);

        // Draw HUD elements after resetting transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Draw HUD elements here in screen coordinates
        // ex: this.ctx.draw(some HUD element);

        requestAnimationFrame(this.draw.bind(this));

        // Handle tweens
        if (this.panTween)
            this.panTween.update(currentTime);

        if (this.boundsTween)
            this.boundsTween.update(currentTime);

        if (this.scrollTween)
            this.scrollTween.update(currentTime);
    }

    startBoundsTween() {
        // Tween back into bounds
        var updateFn = function (object) {
            this.setTranslation(this.m, object.x, object.y);
	    }.bind(this);
        var completeFn = function () {
            this.boundsTween = undefined;
	    }.bind(this);

        this.boundsTween = new Tween(this.pos(), 
                                     this.dest(), 
                                     166, 
                                     updateFn, 
                                     completeFn,
                                     easeQuadraticOut);
        this.boundsTween.start(this.currentTime);
    }

    startPanTween() {
        // Tween pan so user can 'throw' canvas
        if (this.panTween || this.outOfBounds()) 
            return;

        var updateFn = function (velocity) {
            this.move(velocity.x, velocity.y);
        }.bind(this);
        var completeFn = function () {
            this.panTween = undefined;
        }.bind(this);

        this.panTween = new Tween({...this.panVector},
                                  this.zeroPos(),
                                  833,
                                  updateFn,
                                  completeFn,
                                  easeQuadraticOut);
        this.panVector = this.zeroPos();
        this.panTween.start(this.currentTime);
    }

    startScrollTween() {
        // Tween scroll events for fluidity
        var power = 0.035;
        this.momentum = (this.mouse.wheel < 0) ? 1-power : 1+power;

        var updateFn = function (object) {
            this.setScale(this.m, object.scale, object.scale);
        }.bind(this);
        var completeFn = function () {
            this.momentum = 1;
            this.scrollTween = undefined;
        }.bind(this);

        this.scrollTween = new Tween({scale: this.momentum}, 
                                     {scale: 1}, 
                                     166, 
                                     updateFn, 
                                     completeFn,
                                     easeQuadraticOut);
        this.scrollTween.start(this.currentTime);
    }

    eventHandler(event) {
        // Get ID of html element under mouse
        this.mouse.overId = event.target.id;

        if(event.target.id === this.canvas_id || this.mouse.dragging) { 
            this.mouse.posLast.x = this.mouse.pos.x;
            this.mouse.posLast.y = this.mouse.pos.y;    
            this.mouse.pos.x = event.clientX - this.canvas.offsetLeft;
            this.mouse.pos.y = event.clientY - this.canvas.offsetTop;
            this.mouse.worldPos = this.toWorld(this.mouse.pos);

            // MOVE EVENT
            if (moveEvent(event)) {
                if(this.mouse.button) {
                    var newX = this.mouse.pos.x - this.mouse.posLast.x;
                    var newY = this.mouse.pos.y - this.mouse.posLast.y;
                    this.move(newX, newY)
                    if (!this.panTween)
                        this.panVector = { x: newX, y: newY };
                }
            } 

            // DOWN EVENT
            else if (downEvent(event)) { 
                this.panTween = undefined;
                this.boundsTween = undefined;
                this.mouse.button = true; 
                this.mouse.dragging = true; 
            }    

            // UP EVENT    
            else if (upEvent(event)) {
                this.mouse.button = false; 
                this.mouse.dragging = false;
                this.startPanTween();
            }

            // SCROLL EVENT
            else if(event.type === "mousewheel" && (this.mouse.whichWheel === 1 || this.mouse.whichWheel === -1) && !this.mouse.dragging) {
                this.mouse.whichWheel = 1;
                this.mouse.wheel = event.wheelDelta;
            }
            else if(event.type === "wheel" && (this.mouse.whichWheel === 2 || this.mouse.whichWheel === -1) && !this.mouse.dragging) {
                this.mouse.whichWheel = 2;
                this.mouse.wheel = -event.deltaY;
            }
            else if(event.type === "DOMMouseScroll" && (this.mouse.whichWheel === 3 || this.mouse.whichWheel === -1)) {
                this.mouse.whichWheel = 3;
                this.mouse.wheel = -event.detail;
            }
            if(this.mouse.wheel !== 0) {
                event.preventDefault();
                this.startScrollTween();
                this.mouse.wheel = 0;
            }
        }
    }
}



export {PanZoom as default};
