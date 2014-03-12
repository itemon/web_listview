/**
 * @project netdisk
 * @file scrollbar.js
 */
(function(){
	/**
	 * emulate system scrollbar
	 */
	var IScrollbar = function(UI, config) {
		this._mUI = UI;
		this._mConfig = config || {};
		
		this._mThumbTop = 0;
		this._mClickTimer = null;
		
		this._mPrivateFlags = 0;
		
		this._mCoorX = -1;
		this._mCoorY = -1;
		this._mCoorWidth = 0;
		this._mCoorHeight = 0;
		
		this._mArrowScrollDir = -1;
		
		// for dragging status
		this._mDX = -1;
		this._mDY = -1;
		
		this._init();
	};
	/**
	 * flags to mange scrollbar status
	 */
	IScrollbar.FORWARD             = 0x00000001;
	IScrollbar.BACKWARD            = 0x00000002;
	IScrollbar.AWAKE               = 0x00000004;
	IScrollbar.THUMB_AWAKE         = 0x00000008;
	IScrollbar.COUNTING            = 0x00000010;
	IScrollbar.USING_SIMULATE_DRAG = 0x00000020;
	IScrollbar.START_DRAGGING      = 0x00000040;
	IScrollbar.LOCKED              = 0x00000080;
	IScrollbar.HAS_BORDER          = 0x00000100;

	IScrollbar.CLICK_TIMEOUT = 300;

	IScrollbar.prototype = {
		_init : function() {
			this._mPrivateFlags |= IScrollbar.AWAKE;
			this._mPrivateFlags |= IScrollbar.THUMB_AWAKE;
			this._mPrivateFlags |= IScrollbar.HAS_BORDER;
			var _this = this;
			
			if (this._mUI.tracker) {
				this._mUI.tracker.onclick = function(e) {
					if (_this.locked())
						return;
					
					var evt = e ? e : window.event;
					var target = evt.target || evt.srcElement;
					if (target == _this._mUI.thumb)
						return;
					//how far from left-top
					var t = parseInt(evt.offsetY || evt.layerY);
					if (t < _this._mThumbTop || t > _this._mThumbTop + _this._mUI.thumb.offsetHeight) {
						if (t > _this._mThumbTop)
							_this.onPageScroll(disk.ui.MouseWheelSensor.FORWARD);
						else if (t < _this._mThumbTop) {
							_this.onPageScroll(disk.ui.MouseWheelSensor.BACKWARD);
						}
					}
				}
			}
			
			var arrowKeyMoveHandler = function(e) {
				// if user put the mouse beyond our detecting
				// range we will lose control of it
				// so if we detect mouse move movement event outside of our
				// surrounding region
				// we shut down the timer immediately
				if ((_this._mPrivateFlags & IScrollbar.COUNTING) == IScrollbar.COUNTING) {
					var evt = e ? e : window.event;
					var x = evt.clientX;
					var y = evt.clientY;
					
					if (x < _this._mCoorX || 
						x > _this._mCoorX + _this._mCoorWidth || 
						y < _this._mCoorY || 
						y > _this._mCoorY + _this._mCoorHeight) {
						
						// abrupt this counting thread suddenly
						_this.abruptPersistArrowScroll();
						_this.onPersistArrowScrollEnd();
						
						// release listener
						_this._unlisten(document, "mousemove", arrowKeyMoveHandler);
						_this._unlisten(document, "mouseup", arrowKeyupHandler);
						
						// shutdown counting all of a sudden
						// console.log("[LOG]sorry, shutdown counting all of a sudden");
					}
					//console.log("new x and y>>>", x, ":", y, "======>", _this._mClientX, ":", _this._mClientY);
				}
//				console.log("move move move????");
			}
			
			var arrowKeyupHandler = function() {
				// reject this event if we are not in the
				// middle of persist event process
				if ((_this._mPrivateFlags & IScrollbar.COUNTING) != IScrollbar.COUNTING) {
					return;
				}
				var dir = _this._mArrowScrollDir;
				if (_this._mClickTimer != null && _this._mClickTimer.isAlive()) {
					// shutdown the timer
					_this._mClickTimer.interrupt();
					// timer is up, we are here 
					// because timer is counting right now
					// but user release the mouse
					_this.onArrowScroll(dir);
				} else {
					// we are time out already
					// and some persist arrow scroll event is fired already
					// we cut the event process immediately
					_this.onPersistArrowScrollEnd(dir);
				}
				
				// stop counting state
				_this._mPrivateFlags &= ~IScrollbar.COUNTING;
				
				_this._unlisten(document, "mousemove", arrowKeyMoveHandler);
				_this._unlisten(document, "mouseup", arrowKeyupHandler);
			}
			
			var arrowKeydownHandler = function(e) {
				if (_this.locked())
					return;
				
				if ((_this._mPrivateFlags & IScrollbar.COUNTING) == IScrollbar.COUNTING) {
					return;
				}
				var dir = this.getAttribute("dir") == "up" ? IScrollbar.BACKWARD : IScrollbar.FORWARD;
				_this._mArrowScrollDir = dir;
				
				var evt = e ? e : window.event;
				_this._mCoorX = evt.clientX - parseInt(evt.offsetX || evt.layerX);
				_this._mCoorY = evt.clientY - parseInt(evt.offsetY || evt.layerY);
				_this._mCoorWidth = this.offsetWidth;
				_this._mCoorHeight = this.offsetHeight;

				if (_this._mClickTimer == null) {
					_this._mClickTimer = new disk.util.TimerService(IScrollbar.CLICK_TIMEOUT, null);
				} else {
					_this._mClickTimer.interrupt();
				}
				_this._mClickTimer.setActionListener(function() {
					_this.onPersistArrowScrollStart(dir);
				});
				_this._mClickTimer.start();
				_this._mPrivateFlags |= IScrollbar.COUNTING;
				
				_this._listen(document, "mousemove", arrowKeyMoveHandler);
				_this._listen(document, "mouseup", arrowKeyupHandler);
			}
			if (this._mUI.upArrow) {
				this._mUI.upArrow.setAttribute("dir", "up");
				this._mUI.upArrow.onmousedown = arrowKeydownHandler;
			}
			if (this._mUI.downArrow) {
				this._mUI.downArrow.setAttribute("dir", "down");
				this._mUI.downArrow.onmousedown = arrowKeydownHandler;
			} 
			
			//
			// install thumb draging listener
			//
			if (this._mUI.thumb && this._mUI.tracker) {
				var onMouseMoveHandler = function(e) {
					if ((_this._mPrivateFlags & IScrollbar.START_DRAGGING) == IScrollbar.START_DRAGGING) {
						// we are in the middle process of dragging
						var evt = e ? e : window.event;
						var newDX = evt.clientX;
						var newDY = evt.clientY;
						_this._onDragging(newDX, newDY);
					}
//					console.log("whoa!!!! move move move");
					if (evt.preventDefault)
						evt.preventDefault();
				}
				
				var onMouseUpHandler = function() {
					if ((_this._mPrivateFlags & IScrollbar.COUNTING) != IScrollbar.COUNTING) {
//						console.log("reject mouse up");
						return;
					}
					if ((_this._mPrivateFlags & IScrollbar.START_DRAGGING) == IScrollbar.START_DRAGGING) {
						_this._endDrag();
					}
					_this._mPrivateFlags &= ~IScrollbar.COUNTING;
					// end listening
					_this._unlisten(document, "mousemove", onMouseMoveHandler);
					_this._unlisten(document, "mouseup", onMouseUpHandler);
					
//					console.log(">>>>>end drag");
				}
				this._mUI.thumb.onmousedown = function(e) {
					if (_this.locked())
						return;
					
					// reject this request if we are in the middle of 
					// dragging process
					if ((_this._mPrivateFlags & IScrollbar.COUNTING) == IScrollbar.COUNTING) {
						return;
					}
					
					// remember our initial location
					var evt = e ? e : window.event;
					_this._mDX = evt.clientX;
					_this._mDY = evt.clientY;
					
					// if time out and user still put 
					// the mouse on the thumbnail of scrollbar
					// we start sending dragging-start message to our client
					_this._startDrag();
					// start listening cancel dragging trigger
					_this._listen(document, "mouseup", onMouseUpHandler);
					// listen mouse move event in the track
					_this._listen(document, "mousemove", onMouseMoveHandler);
					
					_this._mPrivateFlags |= IScrollbar.COUNTING;
//					console.log(">>>start counting to dragging");
					
					// XXX webkit has a bug on setting mouse cursor on dragging
					// fix this by prevent default behavior
					if (evt.preventDefault)
						evt.preventDefault();
				}
			}
		},
		lock : function(b) {
			if (b) {
				this._mPrivateFlags |= IScrollbar.LOCKED;
				if (this._mUI.scrollbar.className.indexOf("locked") == -1)
					this._mUI.scrollbar.className += " locked";
			} else {
				this._mPrivateFlags &= ~IScrollbar.LOCKED;
				this._mUI.scrollbar.className = this._mUI.scrollbar.className.replace(" locked", "");
			}
		},
		locked : function() {
			return (this._mPrivateFlags & IScrollbar.LOCKED) == IScrollbar.LOCKED;
		},
		_startDrag : function() {
			this._mPrivateFlags |= IScrollbar.START_DRAGGING;
		},
		_endDrag : function() {
			this._mPrivateFlags &= ~IScrollbar.START_DRAGGING;
		},
		onPageScroll : function(dir) {
		},
		inSimulateDragging : function() {
			return (this._mPrivateFlags & IScrollbar.USING_SIMULATE_DRAG) == IScrollbar.USING_SIMULATE_DRAG;
		},
		_onDragging : function(newDX, newDY) {
			if (this._mDX != -1 && this._mDY != -1) {
				var yMoved = newDY - this._mDY;
				// change thumbnail state
				var newTop = this._mThumbTop + yMoved;
				newTop = Math.max(0, newTop);
				newTop = Math.min(newTop, this._mUI.tracker.offsetHeight - this._mUI.thumb.offsetHeight);
				
				if (!this.inSimulateDragging()) {
					this.setThumbState(newTop, null, false);
				} else {
					// send message directly to our client
					this.onThumbStateChange(newTop, this._mThumbTop);
				}
			}
			
			this._mDX = newDX;
			this._mDY = newDY;
		},
		_listen : function(view, type, fn) {
			if (typeof view.addEventListener != "undefined") {
				view.addEventListener(type, fn, false);
			} else if (typeof view.attachEvent != "undefined") {
				view.attachEvent("on" + type, fn);
			} else {
				view["on" + type] = fn;
			}
		},
		_unlisten : function(view, type, fn) {
			if (typeof view.removeEventListener != "undefined") {
				view.removeEventListener(type, fn, false);
			} else if (typeof view.detachEvent != "undefined") {
				view.detachEvent("on" + type, fn);
			} else {
				view["on" + type] = null;
			}
		},
		abruptPersistArrowScroll : function() {
			this._mPrivateFlags &= ~IScrollbar.COUNTING;
			if (this._mClickTimer != null && this._mClickTimer.isAlive()) {
				this._mClickTimer.interrupt();
				return true;
			}
			return false;
		},
		// user press the key down
		// and hold a long while
		// we start sending persist arrow scroll event
		onPersistArrowScrollStart : function(dir) {
			// subclass or instance should override this
		},
		onPersistArrowScrollEnd : function(dir) {
			// subclass or instance should override this
		},
		onArrowScroll : function(dir) {
			// subclass or instance should override this to respond arrow scroll
		},
		onScroll : function(dir, pixelDelta) {
			// process our scrolling
		},
		awakeThumb : function(b) {
			if (b) {
				this._mPrivateFlags |= IScrollbar.THUMB_AWAKE;
				this._mUI.thumb.style.display = "block";
			} else {
				this._mPrivateFlags &= ~IScrollbar.THUMB_AWAKE;
				this._mUI.thumb.style.display = "none";
			}
		},
		isThumbAwake : function() {
			return (this._mPrivateFlags & IScrollbar.THUMB_AWAKE) == IScrollbar.THUMB_AWAKE;
		},
		setThumbState : function(top, height, suppressEvent) {
			if (this.locked())
				return;
			
			if (!this.isThumbAwake())
				return;
			
			var oldTop = this._mThumbTop;
			if (height != null) {
				// we have borders on both sides
				if ((this._mPrivateFlags & IScrollbar.HAS_BORDER) == IScrollbar.HAS_BORDER) {
					height -= 1 * 2;
					height = Math.max(0, height);
				}
				try {
					this._mUI.thumb.style.height = height + "px";	
				} catch (e) {}
			}
			
			try {
				this._mUI.thumb.style.top = top + "px";	
			} catch (e) {}
			
			this._mThumbTop = top;
			
			// send message to our client
			if (suppressEvent !== true)
				this.onThumbStateChange(top, oldTop);
		},
		/**
		 * @protected listen thumb state change
		 */
		onThumbStateChange : function(newTop, oldTop) {
		},
		getTrackerHeight : function() {
			return this._mUI.tracker.offsetHeight;
		},
		isAwake : function() {
			return (this._mPrivateFlags & IScrollbar.AWAKE) == IScrollbar.AWAKE;
		},
		awake : function(b) {
			if (b) {
				this._mPrivateFlags |= IScrollbar.AWAKE;
				this._mUI.scrollbar.style.display = "block";
			} else {
				this._mPrivateFlags &= ~IScrollbar.AWAKE;
				this._mUI.scrollbar.style.display = "none";
			}
			
			// send awake message to our client
			this.onAwake(b);
		},
		onAwake : function(awake) {
			// indicate scrollbar is wake up or not
		},
		reset : function() {
			this.setThumbState(0, 0, false);
		},
		/**
		 * if we are in sumulte dragging status
		 * we just send thumb delta to our client
		 * we did not change thumb location ourself
		 */
		setUsingSimulateDraging : function(b) {
			if (b) {
				this._mPrivateFlags |= IScrollbar.USING_SIMULATE_DRAG;
			} else {
				this._mPrivateFlags &= ~IScrollbar.USING_SIMULATE_DRAG;
			}
		},
		setBooleanFlags : function(flag, positive) {
			if (positive)
				this._mPrivateFlags |= flag;
			else
				this._mPrivateFlags &= ~flag;
		},
		setScrollPosition : function (){
			var scroll = $("#scrollbar");
			var header = $(".all-files-headers");
			var scroll_top = header.offset().top+header.height()-1;
			scroll.css("top",scroll_top+"px");
		}
	};
	disk.ui.IScrollbar = IScrollbar;
})();
