/**
 * @project netdisk
 * @file mousewheel_sensor.js
 */
(function(){
	/**
	 * a mouse wheel sensor to detect mouse wheel movement
	 * on device like PC or something driven by mouse input equipment
	 */
	var MouseWheelSensor = function(view) {
		this._mPrivateFlags = 0;
		this._mView = view;
		// wheel change callback
		this.onWheelChanged = null;
	};
	MouseWheelSensor.FORWARD = 0x00000001;
	MouseWheelSensor.BACKWARD = 0x00000002;
	
	//标识是否阻止滚轮事件的默认行为
	MouseWheelSensor.FLAG_PREVENT_DEFAULT = true;
	
	MouseWheelSensor.BUILD = 0x00000004;
	MouseWheelSensor.prototype = {
		_init : function() {
			if ((this._mPrivateFlags & MouseWheelSensor.BUILD) == MouseWheelSensor.BUILD)
				return;
			var _this = this;
			
			var handler = function() {
				var e = window.event ? window.event : arguments[0];
				//TODO a mouse wheel scroll 
				// trigger 7 wheel event in ie
				// trigger 6 wheel event in webkit browser
				// trigger 4 wheel event in gecko browser
				// fix this later
				// console.log("[LOG]wheel event");
				var delta = 0;
				if (e.wheelDelta) {
					delta = e.wheelDelta / 120;
//					if (window.opera)
//						delta = -delta;
				} else if (e.detail) {
					delta = -e.detail / 3;
				}
				
				if (delta) {
					_this._sendWheelChangedMessage(delta > 0 ? MouseWheelSensor.BACKWARD : MouseWheelSensor.FORWARD, 
						Math.abs(delta));
				}
				if (MouseWheelSensor.FLAG_PREVENT_DEFAULT) {
					if (e.preventDefault)
						e.preventDefault();
					else
						e.returnValue = false;
				}
			};
			// install mouse wheel listener to DOM
			if (typeof window.attachEvent != "undefined") {
				this._mView.attachEvent("onmousewheel", handler);
			} else if ("onmousewheel" in window) {// webkit approach
//				this._mView["onmousewheel"] = handler;
				//FIX BUG
				this._mView.addEventListener("mousewheel", handler, false);
			} else if (typeof window.addEventListener != "undefined") {
				this._mView.addEventListener("DOMMouseScroll", handler, false);
			} else {
			}
			this._mPrivateFlags |= MouseWheelSensor.BUILD;
		},
		sense : function() {
			this._init();
			// mouse wheel detector is standby
		},
		
//		destory : function() {
//		},
		_sendWheelChangedMessage : function(dir, delta) {
			if (typeof this.onWheelChanged == "function")
				this.onWheelChanged.call(this, dir, delta);
		}
	};

	disk.ui.MouseWheelSensor = MouseWheelSensor;
})();
