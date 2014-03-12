(function() {
	var MotionSensor = function(canvasView, orientation) {
		this._mPrivateFlags = 0;
		this._mCanvasView = canvasView;
		this._mOrientation = orientation;
		
		// initial point
		this._mMotionPoint = [-1, -1];
		// working point
		this._mLastMotionPoint = [-1, -1];
		
		// native sensor holder
		this._mNativeSensors = [];
	};
	// listening touching event right now
	MotionSensor.MOTION_LISTENING = 0x00000001;
	// installed
	MotionSensor.INSTALLED = 0x00000002;
	// touch move accept
	MotionSensor.MOTION_ACCEPT = 0x00000004;
	// orientation horizontal
	MotionSensor.HORIZONTAL = 0;
	// orientation vertical 
	MotionSensor.VERTICAL = 1;
	
	// touch accepting threshold
	MotionSensor.TOUCH_THRESHOLD = 5;
	/**
	 * report current working env has touch campatibility
	 */
	MotionSensor.hasMotionCampatibility = function() {
		return "ontouchstart" in document;
	};
	MotionSensor.prototype = {
		/**
		 * @protected 
		 * @param canvasView
		 * @param touchPoint
		 */
		onMotionStart : function(canvasView, touchPoint) {
			// notify our client motion started
		},
		/**
		 * @protected
		 * @param canvasView
		 * @param touchPoint
		 */
		onMotionEnd : function(canvasView, touchPoint) {
			// notify our client motion end
		},
		/**
		 * @protected
		 * @param canvasView
		 * @param touchPoint
		 * @param deltaX
		 * @param deltaY
		 * @param orientation
		 */
		onMotion : function(canvasView, touchPoint, deltaX, deltaY, orientation) {
			// notify our client motion moving
		},
		dispatchMotionStart : function(x, y) {
			this._mMotionPoint[0] = x;
			this._mMotionPoint[1] = y;
			if (disk.DEBUG)console.log("Motion Start " + x + ":" + y);
			this._mPrivateFlags |= MotionSensor.MOTION_LISTENING;
			// notify touch started
			this.onMotionStart(this._mCanvasView, this._mMotionPoint);
		},
		dispatchMotionMove : function(x, y) {
			var listenFlag = MotionSensor.MOTION_LISTENING,
				acceptFlag = MotionSensor.MOTION_ACCEPT;
			
			if ((this._mPrivateFlags & listenFlag) != listenFlag) {
				return;
			}
			
			// save last motion point
			var initialX = this._mMotionPoint[0];
			var initialY = this._mMotionPoint[1];
			var oldX = this._mLastMotionPoint[0] == -1 ? initialX : this._mLastMotionPoint[0];
			var oldY = this._mLastMotionPoint[1] == -1 ? initialY : this._mLastMotionPoint[1];
			
			this._mLastMotionPoint[0] = x;
			this._mLastMotionPoint[1] = y;
			
			var deltaX = x - oldX;
			var deltaY = y - oldY;
			if (disk.DEBUG)console.log("Motion Delta: " + deltaX + "-" + deltaY);
			
			// fast way to notify our client
			if ((this._mPrivateFlags & acceptFlag) == acceptFlag) {
				this.onMotion(this._mCanvasView, this._mLastMotionPoint, 
						deltaX, deltaY, this._mOrientation);
				return;
			}
			
			// testing touch accept
			if (this._motionAccept(initialX, initialY, x, y)) {
				if (disk.DEBUG)console.log("touch accept");
				this._mPrivateFlags |= MotionSensor.MOTION_ACCEPT;
				this.onMotion(this._mCanvasView, this._mLastMotionPoint, 
						deltaX, deltaY, this._mOrientation);
			}
		},
		dispatchMotionEnd : function() {
			if (disk.DEBUG)console.log("Touch End");
			var listenFlag = MotionSensor.MOTION_LISTENING;
			// spoofing call
			if ((this._mPrivateFlags & listenFlag) != listenFlag) {
				return;
			}
			// clear flags
			this._mPrivateFlags &= ~(MotionSensor.MOTION_LISTENING | MotionSensor.MOTION_ACCEPT);
			
			this._mMotionPoint[0] = -1;
			this._mMotionPoint[1] = -1;
			
			this._mLastMotionPoint[0] = -1;
			this._mLastMotionPoint[1] = -1;
		},
		getOrientation : function() {
			return this._mOrientation;
		},
		setOrientation : function(orientation) {
			this._mOrientation = orientation;
		},
		getInitialMotionPoint : function() {
			return this._mInitialPoint;
		},
		_motionAccept : function(ox, oy, nx, ny) {
			var deltaX = nx - ox,
				deltaY = ny - oy,
				absX = Math.abs(deltaX),
				absY = Math.abs(deltaY);
			
			if (this._mOrientation == MotionSensor.HORIZONTAL) {
				if (absY > absX)
					return false;
				// not reach threshold
				if (absX < MotionSensor.TOUCH_THRESHOLD)
					return false;
				// it's ok
				return true;
			} else {
				// VERTICAL
				if (absX >  absY)
					return false;
				// not reach threshold
				if (absY < MotionSensor.TOUCH_THRESHOLD)
					return false;
				// it's ok
				return true;
			}
		},
		uninstall : function() {
			var installFlag = MotionSensor.INSTALLED;
			if ((this._mPrivateFlags & installFlag) != installFlag)
				return;
			// clear all flags
			this._mPrivateFlags &= ~(MotionSensor.MOTION_LISTENING | MotionSensor.MOTION_ACCEPT | MotionSensor.INSTALLED);
			// detach listeners
			this._mCanvasView.removeEventListener("touchstart", this._mNativeSensors[0], false);
			this._mCanvasView.removeEventListener("touchmove", this._mNativeSensors[1], false);
			document.removeEventListener("touchend", this._mNativeSensors[2], false);
			document.removeEventListener("touchcancel", this._mNativeSensors[2], false);
		},
		install : function() {
			var flag = MotionSensor.INSTALLED,
				_this = this;
			
			if ((this._mPrivateFlags & flag) != flag) {
				this._mPrivateFlags |= flag;
				// motion start
				var touchStart = function(evt) {
					var touch = evt.touches[0];
					_this.dispatchMotionStart(touch.clientX, touch.clientY);
//					evt.preventDefault();
//					evt.stopPropagation();
					return false;
				};
				this._mCanvasView.addEventListener("touchstart", touchStart, false);
				this._mNativeSensors[0] = touchStart;
				
				// motion moving
				var touch = function(evt) {
					var touch = evt.touches[0];
					_this.dispatchMotionMove(touch.clientX, touch.clientY);
					evt.preventDefault();
					evt.stopPropagation();
					return false;
				};
				this._mCanvasView.addEventListener("touchmove", touch, false);
				this._mNativeSensors[1] = touch;
				
				// motion end
				var touchEnd = function(evt) {
					_this.dispatchMotionEnd();
//					evt.preventDefault();
//					evt.stopPropagation();
				};
				document.addEventListener("touchend", touchEnd, false);
				document.addEventListener("touchcancel", touchEnd, false);
				this._mNativeSensors[2] = touchEnd;
			}
		}
	};
	
	disk.ui.MotionSensor = MotionSensor;
})();