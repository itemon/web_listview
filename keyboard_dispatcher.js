/**
 * @project netdisk
 * @file keyboard_dispatcher.js
 */
(function(){
	/**
	 * IKeyboardDispatcher
	 */
	var IKeyboardDispatcher = function() {
		this._mInstalled = false;
	};
	IKeyboardDispatcher.UP = 0;
	IKeyboardDispatcher.DOWN = 1;
	IKeyboardDispatcher.LEFT = 2;
	IKeyboardDispatcher.RIGHT = 3;
	IKeyboardDispatcher._dispatchKeyEvent = function(e) {
		var evt = e ? e : window.event;
		var target = evt.target ? evt.target : evt.srcElement;
		// gecko based brower report target as HTML element
		var tag = target.nodeName.toUpperCase();
		if (tag == "HTML" || tag == "BODY") {
			if (IKeyboardDispatcher._lastHost != null) {
				switch (evt.keyCode) {
					case 40: {
						//arrow down
						if (typeof IKeyboardDispatcher._lastHost.onKeyboardArrowDown == "function") {
							IKeyboardDispatcher._lastHost.onKeyboardArrowDown();
						}
						break;
					}
					
					case 38: {
						// 38 arrow up
						if (typeof IKeyboardDispatcher._lastHost.onKeyboardArrowUp == "function") {
							IKeyboardDispatcher._lastHost.onKeyboardArrowUp();
						}
						break;
					}
						
					case 34:
					case 32: {
						// 34 PageDown
						// 32 Space
						if (typeof IKeyboardDispatcher._lastHost.onKeyboardPageDown == "function") {
							IKeyboardDispatcher._lastHost.onKeyboardPageDown();
						}
						break;
					}
					
					case 33: {
						//33 Page Up
						if (typeof IKeyboardDispatcher._lastHost.onKeyboardPageUp == "function") {
							IKeyboardDispatcher._lastHost.onKeyboardPageUp();
						}
						break;
					}
				}
			}
		}
	};
	IKeyboardDispatcher._lastHost = null;
	IKeyboardDispatcher._instance = null;
	IKeyboardDispatcher.getKeyboardDispatcher = function() {
		return IKeyboardDispatcher._instance != null ? IKeyboardDispatcher._instance : 
				(IKeyboardDispatcher._instance = new IKeyboardDispatcher());
	};
	IKeyboardDispatcher.prototype = {
		bind : function(host) {
			if (!this._mInstalled)
				this._install();
			IKeyboardDispatcher._lastHost = host;
			// console.log("[LOG]KeyboardDispatch start bind to host ", host);
		},
		destory : function() {
			if (!this._mInstalled)
				return;
			if (typeof window.addEventListener != "undefined")
				document.removeEventListener("keyup", IKeyboardDispatcher._dispatchKeyEvent, false);
			else if (typeof window.attachEvent != "undefined")
				document.detachEvent("onkeyup", IKeyboardDispatcher._dispatchKeyEvent);
			else
				document.onkeyup = null;
			this._mInstalled = false;
		},
		_install : function() {
			if (this._mInstalled)
				return;
			if (typeof window.addEventListener != "undefined")
				document.addEventListener("keyup", IKeyboardDispatcher._dispatchKeyEvent, false);
			else if (typeof window.attachEvent != "undefined")
				document.attachEvent("onkeyup", IKeyboardDispatcher._dispatchKeyEvent);
			else
				document.onkeyup = IKeyboardDispatcher._dispatchKeyEvent;
			this._mInstalled = true;
		}
	};
	disk.ui.IKeyboardDispatcher = IKeyboardDispatcher;
})();
