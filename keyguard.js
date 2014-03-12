/**
 * @project netdisk
 * @file keyguard.js
 */
(function(){
	/**
	 * a keyguard listener
	 */
	var KeyguardListener = function() {
		this._mPrivateFlags = 0;
	};
	
	KeyguardListener.prototype = {
		onMount : function(inOut) {
		},
		onConnectivity : function(isConnect) {
		},
		onKeyAction : function(evtType) {
		},
		onKeyEvent : function(keyCode, meta) {
		}
	};
	disk.ui.KeyguardListener = KeyguardListener;
	
	/**
	 * Keyguard Service
	 */
	var Keyguard = function() {
		this._mPrivateFlags = 0;
		this._mListeners = [];
		
		// hijack key event
		this._mHijacker = null;
		this._mHijackContext = null;
	};
	// behavior key event
	Keyguard.EVENT_ARROW_UP = 38;
	Keyguard.EVENT_ARROW_DOWN = 40;
	Keyguard.EVENT_ARROW_LEFT = 37;
	Keyguard.EVENT_ARROW_RIGHT = 39;
	Keyguard.EVENT_PAGE_UP = 33;
	Keyguard.EVENT_PAGE_DOWN = 34;
	Keyguard.EVENT_ENTER = 13;
	Keyguard.EVENT_ESCAPE = 27;
	
	Keyguard.INSTALL = 0x00000001;
	Keyguard.EXCLUSIVE_LOCK = 0x00000002;
	
	Keyguard.prototype = {
		acquire : function(listener, exclusive) {
			if ((this._mPrivateFlags & Keyguard.EXCLUSIVE_LOCK) == Keyguard.EXCLUSIVE_LOCK) {
				throw new Error("exclusive lock must be relase before anybody else try to acqiure keyguard service");
			}
			if (disk.DEBUG)console.log("execusive acquire ", exclusive);
			this._install();
			if (exclusive) {
				this._mPrivateFlags |= Keyguard.EXCLUSIVE_LOCK;
				for (var i=0, len=this._mListeners.length; i<len; i++) {
					this._mListeners[i].onConnectivity(false);
				}
			}
			this._mListeners.push(listener);
			listener.onMount(true);
		},
		release : function(listener) {
			var exclusive = (this._mPrivateFlags & Keyguard.EXCLUSIVE_LOCK) == Keyguard.EXCLUSIVE_LOCK,
				notify = false;
			for (var i = 0, len = this._mListeners.length; i < len; i++) {
				if (listener == this._mListeners[i]) {
					this._mListeners[i].onMount(false);
					this._mListeners.splice(i, 1);
					if (!exclusive)
						break;
				} else {
					if (notify) {
						this._mListners[i].onConnectivity(true);
					}
				}
			}
			if (exclusive) {
				this._mPrivateFlags &= ~Keyguard.EXCLUSIVE_LOCK;
			}
			this._mHijacker = null;
			this._mHijackContext = null;
			if (disk.DEBUG)console.log("relase keyguard and hijacker");
			// nobody watching key events
			if (this._mListeners.length == 0) {
				this._uninstall();
			}
		},
		hijackKeyEvent : function(handle, context) {
			var exclusive = (this._mPrivateFlags & Keyguard.EXCLUSIVE_LOCK) == Keyguard.EXCLUSIVE_LOCK;
			if (exclusive) {
				this._mHijacker = handle;
				this._mHijackContext = context;
				if (disk.DEBUG)console.log("hijack keyevent now");
				return true;
			}
			return false;
		},
		dispatchKeyEvent : function(evt) {
			var exclusive = (this._mPrivateFlags & Keyguard.EXCLUSIVE_LOCK) == Keyguard.EXCLUSIVE_LOCK,
				l = null;
			
			for (var len = this._mListeners.length, i = len-1; i>=0; i--) {
				l = this._mListeners[i];
				var hasMeta = true;
				hasMeta = hasMeta & evt.shiftKey;
				hasMeta = hasMeta & evt.ctrlKey;
				hasMeta = hasMeta & evt.altKey;
				
				var handle = false;
				if (!hasMeta) {
					switch (evt.keyCode) {
					case Keyguard.EVENT_ARROW_UP:
					case Keyguard.EVENT_ARROW_DOWN:
					case Keyguard.EVENT_ARROW_LEFT:
					case Keyguard.EVENT_ARROW_RIGHT:
					case Keyguard.EVENT_PAGE_UP:
					case Keyguard.EVENT_PAGE_DOWN:
					case Keyguard.EVENT_ENTER:
					case Keyguard.EVENT_ESCAPE:
						handle = l.onKeyAction(evt.keyCode);
						break;
					default:
					}
				}
				
				if (!handle) {
					if (this._mHijacker) {
						this._mHijacker.call(this._mHijackContext?this._mHijackContext:this, evt.keyCode, {
							shift : evt.shiftKey,
							ctrl : evt.ctrlKey,
							alt : evt.altKey
						});
					} else {
						l.onKeyEvent(evt.keyCode, {
							shift : evt.shiftKey,
							ctrl : evt.ctrlKey,
							alt : evt.altKey
						});
					}
				}
				// break up if exclusive notification
				if (i == len-1 && exclusive) {
					break;
				}
			}
		},
		_install : function() {
			if ((this._mPrivateFlags & Keyguard.INSTALL) != Keyguard.INSTALL) {
				var _this = this;
				$(document).bind("keyup", function(evt) {
					_this.dispatchKeyEvent(evt);
				});
				if (disk.DEBUG)console.log("Keyguard service installed");
				this._mPrivateFlags |= Keyguard.INSTALL;
			}
		},
		_uninstall : function() {
			if ((this._mPrivateFlags & Keyguard.INSTALL) == Keyguard.INSTALL) {
				$(document).unbind("keyup");
				if (disk.DEBUG)console.log("Keyguard service uninstalled");
				this._mPrivateFlags &= ~Keyguard.INSTALL;
			}
		}
	};
	disk.ui.Keyguard = Keyguard;
})();
