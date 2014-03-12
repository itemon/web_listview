/**
 * @project netdisk
 * @file infinite_listview.js
 */
(function(){
	/**
	 * ViewRecycler
	 */
	var ViewRecycler = function() {
		this._mRecycledViews = [];
		
		this._mActiveViews = [];
		
		this._mFirstPosition = 0;
	};
	ViewRecycler.prototype = {
		add : function(view) {
			this._mRecycledViews.push(view);
			view.parentNode.removeChild(view);
		},
		get : function(position) {
			if (this._mRecycledViews.length == 0)
				return null;
			var view = this._mRecycledViews.pop();
			return view;
		},
		scrapActiveViews : function() {
			var localActiveViews = this._mActiveViews;
			var max = localActiveViews.length;
			
			if (max == 0)
				return;
			
			for (var i=0, len=localActiveViews.length; i<len; i++) {
				this._mRecycledViews.push(localActiveViews[i]);
			}
			
			// drop views exceed max limit
			// 0 1 2
			// 0 1 2 3 4 5
			while (this._mRecycledViews.length >= max) {
				var view = this._mRecycledViews.pop();
				if (view) {
					view.parentNode.removeChild(view);
					view = null;
				}
			}
		},
		getActiveView : function(position) {
			var realPosition = position - this._mFirstPosition;
			var localActiveViews = this._mActiveViews;
			
			if (realPosition < 0 || realPosition > localActiveViews.length - 1)
				return null;
				
			var view = localActiveViews[realPosition];
			localActiveViews[realPosition] = null;
			
			return view;
		},
		preseveActiveViews : function(activeViews, firstPosition) {
			var localActiveViews = this._mActiveViews;
			
			// tight up local active view
			localActiveViews.length = activeViews.length;
			
			for (var i=0, len = activeViews.length; i < len; i++) {
				localActiveViews[i] = activeViews[i];
			}
			
			this._mFirstPosition = firstPosition;
		},
		clear : function() {
			this._mRecycledViews.length = 0;
		}
	};
	disk.ui.ViewRecycler = ViewRecycler;
	

	/**
	 * a list view which can recycle unused child
	 * for a later painting
	 */
	var RecycleListView = function(UI, config) {
		this._mUI = UI;
		this._mConfig = config || {};
		
		this._mPrivateFlags = 0;
		
		this._mFirstPosition = 0;
		
		this._mChildrenMarginTop = 0;
		
		this._mChildrenCount = 0;
		this._mElementsData = null;
		this._mItemCount = 0;
		
		this._mItemHeight = 0;
		
		this._mWheelSensor = null;
		
		this._mViewRecycler = null;
		
		this._mMotionSensor = null;
		
		this._mChildren = [];
		
		this._mSmoothScroller = null;
		this._mSmoothScrollDelta = 0;
		this._mSmoothScrollRemaining = 0;
		
		this._mScrollDir = -1;
		
		// normal mode at first
		this._mLayoutMode = RecycleListView.LAYOUT_MODE_NORMAL;
		this._mSpecificPosition = -1;
		
		this._mIScrollbar = null;
		this._mPersistScrollDir = -1;
		
		// keep track of checked item
		// checking API
		// for fast accessing on runtime layout
		// use a indicator copy array
		this._mCheckedChildren = [];
		
		// sync position
		// used to sync the list to previous 
		// status and location
		this._mSyncTop = 0;
		this._mSyncPosition = -1;
		this._mSyncId = null;
		
		// debug name
		this._mDebugAlias = null;
	};
	RecycleListView.CLONE_VIEW_BUILD           = 0x00000001;
	RecycleListView.DATA_CHANGED               = 0x00000002;
	RecycleListView.BUILD                      = 0x00000004;
	RecycleListView.SMOOTH_SCROLLING           = 0x00000008;
	RecycleListView.USING_SCROLLBAR            = 0x00000010;
	RecycleListView.USING_KEYBOARD_DISPATCHER  = 0x00000020;
	RecycleListView.USING_MOUSE_WHEEL_SENSOR   = 0x00000040;
	RecycleListView.CHECKED_ALL                = 0x00000080;
	RecycleListView.PRESERVE_CHECKED_STATE     = 0x00000100;
	RecycleListView.LOCKED                     = 0x00000200;
	RecycleListView.USING_LOW_PIXEL_RATIO      = 0x00000400;
	RecycleListView.USING_TOUCH_SENSOR         = 0x00000800;

	RecycleListView.TOP = 0;
	RecycleListView.BOTTOM = 1;
	
	RecycleListView.NOTIFY_LIST_EMPTY = 0;
	RecycleListView.NOTIFY_LIST_REPAINT = 1;
	RecycleListView.NOTIFY_SYSTEM_LOCK = 2;

	RecycleListView.WHEEL_TO_PIXEL_RATIO = 120 / 2;
	RecycleListView.WHEEL_TO_PIXEL_RATIO_LOW = 120 / 6;

	RecycleListView.SMOOTH_SCROLL_DURATION = 150;
	RecycleListView.SMOOTH_SCROLL_INTERVAL = 5;

	RecycleListView.PIXEL_RATIO_ON_DRAGGING_SCALE = 1;

	// normal mode
	RecycleListView.LAYOUT_MODE_NORMAL = 0;
	// build list from top
	RecycleListView.LAYOUT_MODE_FORCE_TOP = 1;
	// build list from bottom
	RecycleListView.LAYOUT_MODE_FORCE_BOTTOM = 2;
	// build list at specific item
	RecycleListView.LAYOUT_MODE_SPECIFIC = 3;
	// build list from specific item
	RecycleListView.LAYOUT_MODE_FROM_SPECIFIC = 4;

	RecycleListView.prototype = {
		/**
		 * @protected 
		 * subclass or instance of this class should override
		 * this method to return a view
		 */
		getView : function(parentView, convertView, position) {
			return null;
		},
		/**
		 * hide this listview
		 * dispatch a faked empty message to our client
		 * with a extra arg indicating simulating
		 */
		deactivate : function(b) {
			if (b) {
				this._mUI.listContainer.style.display = "none";
				this.onSystemNotify(RecycleListView.NOTIFY_LIST_EMPTY, true, true);
			} else {
				this._mUI.listContainer.style.display = "block";
				this.onSystemNotify(RecycleListView.NOTIFY_LIST_EMPTY, false, true);
			}
		},
		/**
		 * @public
		 */
		setBackedData : function(data) {
			if (this.locked())
				return;
			
			if ((this._mPrivateFlags & RecycleListView.BUILD) != RecycleListView.BUILD) {
				this._build();
				this._mPrivateFlags |= RecycleListView.BUILD;
			}
			
			// clear list state
			this._resetList();
			
			this._mElementsData = data;
			this._mItemCount = data == null ? 0 : data.length;
			
			this._layout();
		},
		setBooleanFlag : function(flag, positive) {
			if (positive) {
				this._mPrivateFlags |= flag;
			} else {
				this._mPrivateFlags &= ~flag;
			}
		},
		setUsingScrollbar : function(b) {
			if (b) {
				this._mPrivateFlags |= RecycleListView.USING_SCROLLBAR;
			} else {
				this._mPrivateFlags &= ~RecycleListView.USING_SCROLLBAR;
			}
		},
		isUsingScrollbar : function() {
			return (this._mPrivateFlags & RecycleListView.USING_SCROLLBAR) == RecycleListView.USING_SCROLLBAR;
		},
		requestLayout : function() {
			if (this.locked())
				return;

			this._mPrivateFlags |= RecycleListView.DATA_CHANGED;
			this._mLayoutMode = RecycleListView.LAYOUT_MODE_SPECIFIC;
			
			// we want to persist check state
			this._mPrivateFlags |= RecycleListView.PRESERVE_CHECKED_STATE;
			this._layout();
			this._mPrivateFlags &= ~RecycleListView.PRESERVE_CHECKED_STATE;
		},
		appendBackedData : function(newData) {
			if (this._mElementsData == null || this._mItemCount == 0) {
				// recognized as newborn
				this.setBackedData(newData);
				return;
			}
			
			if (this.locked())
				return;
			
			// append new data to current dataset
			// current we could at most hold the trailing item
			for (var i = 0, len = newData.length; i < len; i++) {
				this._mElementsData.push(newData[i]);
			}
			
			this._mItemCount = this._mElementsData.length;
			// repainting
			this.requestLayout();
		},
		updateBackedData : function(data, retainSelection) {
			if (this.locked())
				return;
			
			this._mElementsData = data;
			this._mItemCount = data == null ? 0 : data.length;
			
			this._mPrivateFlags |= RecycleListView.DATA_CHANGED;
			this._mLayoutMode = RecycleListView.LAYOUT_MODE_SPECIFIC;
			
			if (this._mSyncId != null) {
				var recurrectPosition = this.lookupPositionForId(this._mSyncId);
				if (recurrectPosition != -1) {
					if (disk && disk.DEBUG)console.log("recover a position at ", recurrectPosition);
					this._mSyncPosition = recurrectPosition;
				}
			}
			
			if (retainSelection === true)
				this._mPrivateFlags |= RecycleListView.PRESERVE_CHECKED_STATE;
			else {
				// clear independent check
				this._mCheckedChildren.length = 0;
			}
			this._layout();
			if (retainSelection === true)
				this._mPrivateFlags &= ~RecycleListView.PRESERVE_CHECKED_STATE;
		},
		/**
		 * @protected 
		 * we want a unique id string across the entire dataset
		 * for recovering the last top visible element even if data dataset has been
		 * update link delete, insert, update or something
		 */
		getIdForPosition : function(position) {
			return null;
		},
		/**
		 * @protected
		 * when we want to recover something info lost
		 * we give your the id last we remember
		 * subclass or instance of this class should look up
		 * in the new dataset with that id and return a position
		 * to the view system in a fast way, we will recover the postion for you
		 */
		lookupPositionForId : function(id) {
			return -1;
		},
		/**
		 * swap the whole backed data
		 * generally, this will cause this instance lose some status
		 * like scrollbar location, selections status
		 */
		changeBackedData : function(data, reboot) {
			if (this.locked())
				return;
			
			if (reboot === true) {
				this._resetList();
			}
			
			this._mElementsData = data;
			this._mItemCount = data == null ? 0 : data.length;
			
			this._mPrivateFlags |= RecycleListView.DATA_CHANGED;
			this._mLayoutMode = RecycleListView.LAYOUT_MODE_FORCE_TOP;
			
			this._layout();
		},
		dispatchDataChanged : function() {
			this._mPrivateFlags |= RecycleListView.DATA_CHANGED;
		},
		getScrollTop : function() {
			// how far did we scroll off the screen on first position item
			return this._mFirstPosition * this._mItemHeight + Math.abs(this._mChildrenMarginTop);
		},
		getFirstCheckedChild : function() {
			if (this.isAllItemChecked())
				return this._mChildren[this._mFirstPosition - this._mFirstPosition];
			
			for (var i=0, len=this._mCheckedChildren.length; i<len; i++) {
				if (this._mCheckedChildren[i] === true) {
					return this._mChildren[i - this._mFirstPosition];
				}
			}
			return null;
		},
		/**
		 * return the recycling children work on and off
		 * it's a valatile child at this position
		 * becareful to use
		 */
		getRenderingChildAt : function(position) {
			if (this._mChildren.length == 0)
				return null;
			if (position < 0 || position > this._mChildren.length - 1)
				return null;
			return this._mChildren[position];
		},
		getRenderingChildByPosition : function(position) {
			var idx = position - this._mFirstPosition;
			return this.getRenderingChildAt(idx);
		},
		/**
		 * @param b  force to build if it's not ready
		 */
		getScrollbar : function(b) {
			var _this = this;
			var scrollbar = this._mIScrollbar;
			if (scrollbar == null && b === true) {
				scrollbar = new disk.ui.IScrollbar(this._mUI);
				scrollbar.onArrowScroll = function(dir) {
					_this.arrowScroll(dir);
					_this._mPersistScrollDir = -1;
				}
				scrollbar.onPersistArrowScrollStart = function(dir) {
					_this._mPersistScrollDir = dir;
					// start persist arrow scrolling
					_this.arrowScroll(dir);
				}
				scrollbar.onPersistArrowScrollEnd = function(dir) {
					_this._mPersistScrollDir = -1;
				}
				scrollbar.onPageScroll = function(dir) {
					_this._mPersistScrollDir = -1;
					_this.pageScroll(dir);
				}
				// faked draging
				scrollbar.setUsingSimulateDraging(true);
				scrollbar.onThumbStateChange = function(newTop, oldTop) {
					// how many pixel did we have ?????            this._mItemHeight * itemCount
					// deltaPixel                                  tracker height
					var delta = RecycleListView.PIXEL_RATIO_ON_DRAGGING_SCALE * Math.abs(newTop - oldTop);
					var pixelToScroll = delta * _this._mItemHeight * _this._mItemCount / scrollbar.getTrackerHeight();
					var dir = newTop - oldTop > 0 ? disk.ui.MouseWheelSensor.FORWARD : disk.ui.MouseWheelSensor.BACKWARD;
					// console.log("[LOG]N_O:", newTop, oldTop, pixelToScroll);
					_this.scrollBy(dir, pixelToScroll);
				}
				this._mIScrollbar = scrollbar;
			}
			return scrollbar;
		},
		/**
		 * @protected
		 */
		onComputeScrollbarState : function(scrollbar, firstVisiblePosition, visibleChildCount) {
			// scrollbar is available right now
			var containerHeight = this._mUI.listContainer.parentNode.offsetHeight;
			var itemHeight = this._mItemHeight;
			var scrollbarTrackerHeight = scrollbar.getTrackerHeight();
			
			// containerHeight     totalHeight
			// thumb height        scrollbar tracker height
			var thumbHeight = (this._mItemCount == 0) ? 0 : (scrollbarTrackerHeight * containerHeight) / (itemHeight * this._mItemCount);
			
			// how many space did we put it on screen already
			// scrollTop        contentHeight
			// top              trackHeight
			var thumbTop = (this._mItemCount == 0) ? 0 : scrollbarTrackerHeight * this.getScrollTop() / (itemHeight * this._mItemCount);
			
			// make sure we are not exceed max range
			thumbTop = Math.min(thumbTop, scrollbarTrackerHeight - thumbHeight);
			// make sure we are not negative
			thumbTop = Math.max(thumbTop, 0);
			
			// set thumb state of scrollbar
			// without notify ourself again
			scrollbar.setThumbState(thumbTop, thumbHeight, true);
		},
		awakeScrollbar : function(b) {
			if (b) {
				var scrollbar = this.getScrollbar(true);
				// wake up scrollbar if it's not visible
				if (!scrollbar.isAwake()) {
					scrollbar.awake(true);
				}
			} else {
				// if we got a scrollbar 
				// we shut it off
				// we do not care even if we hav't got one
				var scrollbar = this.getScrollbar();
				if (scrollbar != null && scrollbar.isAwake()) {
					scrollbar.awake(false);
				}
			}
		},
		/**
		 * @return return true if we can scroll to this position, false otherwise
		 */
		scrollToPosition : function(position) {
			if (this.locked())
				return;
			
			if (position < 0 || position > this._mItemCount - 1)
				return false;
			
			var forward = position > this._mFirstPosition;
			
			this._mPrivateFlags |= RecycleListView.DATA_CHANGED;
			
			this._mLayoutMode = RecycleListView.LAYOUT_MODE_FROM_SPECIFIC;
			this._mSpecificPosition = position;
			
			this._mChildrenMarginTop = 0;
			this._mUI.listContainer.style.marginTop = "0";
			
			this._mPrivateFlags |= RecycleListView.PRESERVE_CHECKED_STATE;
			this._layout();
			this._mPrivateFlags &= ~RecycleListView.PRESERVE_CHECKED_STATE;
			
			//TODO bug 01
			if (forward)
				this._fixTooHigh();
			else
				this._fixTooLow();
			return true;
		},
		/**
		 * scroll this list view by one page
		 */
		pageScroll : function(dir) {
			if (this.locked())
				return;

			var firstPosition = this._mFirstPosition;
			var toPosition = -1;
			if (dir == disk.ui.MouseWheelSensor.FORWARD) {
				// put the last visible item 
				// on the first after we repaint this list
				toPosition = firstPosition + this._mChildren.length;
				// do not exceed bound
				toPosition = Math.min(toPosition, this._mItemCount - 1);
			} else {
				toPosition = firstPosition - this._mChildren.length;
				// do not exceed bound
				toPosition = Math.max(toPosition, 1);
			}
			// console.log("page scroll to>>>>>", toPosition);
			this.scrollToPosition(toPosition);
		},
		arrowScroll : function(dir) {
			if (this.locked())
				return;

			var pixelRatio = RecycleListView.WHEEL_TO_PIXEL_RATIO;
			if ((this._mPrivateFlags & RecycleListView.USING_LOW_PIXEL_RATIO) == 
				RecycleListView.USING_LOW_PIXEL_RATIO) {
				pixelRatio = RecycleListView.WHEEL_TO_PIXEL_RATIO_LOW;
			}
			this.smoothScroll(dir, 1 * pixelRatio);
		},
		_resetList : function() {
			this._mChildren.length = 0;
			this._mChildrenMarginTop = 0;
			this._mUI.listContainer.style.marginTop = "0";

			this._mFirstPosition = 0;
			this._mElementsData = null;
			this._mItemCount = 0;
			
			this._mSyncTop = 0;
			this._mSyncPosition = -1;
			this._mSyncId = null;
			
			this._mPrivateFlags &= ~RecycleListView.CLONE_VIEW_BUILD;
			this._mPrivateFlags &= ~RecycleListView.DATA_CHANGED;
			
			this._mViewRecycler.clear();
			
			// remove all views in the list
			if (this._mUI.listContainer.nodeName.toUpperCase() == "TABLE") {
				// table is a special element in ie
				// we have another approach
				for (var list=this._mUI.listContainer.rows, len = list.length, i=len-1; i>=0; i--) {
					this._mUI.listContainer.deleteRow(i);
				}
			} else {
				this._mUI.listContainer.innerHTML = "";
			}
			
			// reset scrollbar if needed
//			if (this._mIScrollbar != null) {
//				this._mIScrollbar.reset(true);
//			}
		},
		getBackedData : function() {
			return this._mElementsData;
		},
		_handleDataChanged : function() {
			// destory checked item if needed
			if ((this._mPrivateFlags & RecycleListView.PRESERVE_CHECKED_STATE) != RecycleListView.PRESERVE_CHECKED_STATE) {
				this._mCheckedChildren.length = 0;
				this._mPrivateFlags &= ~RecycleListView.CHECKED_ALL;
			}
		},
		setItemChecked : function(position, checked) {
			this._mCheckedChildren[position] = checked;
			
			// cancel one item means canceling all-checked flag
			// on dechecking one item when all items checked already
			var checkedAll = (this._mPrivateFlags & RecycleListView.CHECKED_ALL) == RecycleListView.CHECKED_ALL;
			if (!checked && checkedAll) {
				this._mPrivateFlags &= ~RecycleListView.CHECKED_ALL;
				// de-check all-checked flag and check rest item
				// time-consumed operation
				for (var i=0, len=this._mElementsData.length; i<len; i++) {
					if (i != position) {
						this._mCheckedChildren[i] = true;
					}
				}
			}
		},
		isItemChecked : function(position) {
			var checkedAll = (this._mPrivateFlags & RecycleListView.CHECKED_ALL) == RecycleListView.CHECKED_ALL;
			if (checkedAll)
				return true;
			return this._mCheckedChildren[position] === true;
		},
		setItemsChecked : function(checked) {
			if (checked)
				this._mPrivateFlags |= RecycleListView.CHECKED_ALL;
			else {
				this._mPrivateFlags &= ~RecycleListView.CHECKED_ALL;
				//also clear checked cache
				this._mCheckedChildren.length = 0;
			}
		},
		lock : function(b, suppressEvent) {
			var scrollbar = this.getScrollbar();
			if (b) {
				this._mPrivateFlags |= RecycleListView.LOCKED;
				// also lock plugin driver components
				// such as scrollbar, keyboard dispatcher, touch gesture detector
				if (scrollbar != null)
					scrollbar.lock(true);
			} else {
				this._mPrivateFlags &= ~RecycleListView.LOCKED;
				if (scrollbar != null)
					scrollbar.lock(false);
			}
			if (suppressEvent !== true)
				this.onSystemNotify(disk.ui.RecycleListView.NOTIFY_SYSTEM_LOCK, b);
		},
		/**
		 * @protected
		 * @deprecated
		 * subclass should override this method to response a lock in view system
		 */
		/*onSystemLock : function(b) {
		},*/
		onSystemNotify : function(type, flagArg) {
		},
		locked : function() {
			return (this._mPrivateFlags & RecycleListView.LOCKED) == RecycleListView.LOCKED;
		},
		isAllItemChecked : function() {
			return (this._mPrivateFlags & RecycleListView.CHECKED_ALL) == RecycleListView.CHECKED_ALL;
		},
		getCheckedItems : function() {
			// if we checked all items
			// hand out the whole elements data
			if (this.isAllItemChecked()) {
				if (this._mElementsData == null) {
					return [];
				} else {
					var checked = [];
					for (var i = 0, len = this._mElementsData.length; i < len; i++) {
						checked.push(this._mElementsData[i]);
					}
					return checked;
				}
			}
			
			// some of them checked, but some not
			var checked = [];
			
			if (!this._mElementsData)
				return checked;
			
			for (var i=0, len=this._mCheckedChildren.length; i<len; i++) {
				if (this._mCheckedChildren[i] === true) {
					checked.push(this._mElementsData[i]);
				}
			}
			return checked;
		},
		getElementsData : function() {
            return this._mElementsData;
        },
		getFirstCheckedIndex : function() {
			if (this.isAllItemChecked())
				return 0;
			
			for (var i=0, len=this._mCheckedChildren.length; i<len; i++) {
				if (this._mCheckedChildren[i] === true) {
					return i;
				}
			}
			return -1;
		},
		hitInVisibleRegion : function(position) {
			return position >= this._mFirstPosition && 
					position < this._mFirstPosition + this._mChildren.length;
		},
		_correctSyncPosition : function() {
			if (this._mElementsData.length > 0 && this._mSyncPosition > this._mElementsData.length - 1) {
				this._mSyncPosition = -1;
			}
		},
		_layout : function() {
			if (this._mItemCount == 0) {
				this._resetList();
				this.onPositionChanged(this._mFirstPosition, this._mChildren.length);
				this._turnPluginDriverOnOrOff();
				this.onSystemNotify(disk.ui.RecycleListView.NOTIFY_LIST_EMPTY, true);
				
				// notify our client we are repainting now
				this.onSystemNotify(disk.ui.RecycleListView.NOTIFY_LIST_REPAINT, true);
				return;
			} else {
				this.onSystemNotify(disk.ui.RecycleListView.NOTIFY_LIST_EMPTY, false);
				
				// notify our client we are repainting now
				this.onSystemNotify(disk.ui.RecycleListView.NOTIFY_LIST_REPAINT, true);
			}
			
			// hand data change situation
			// we will try to recover as more things as possible
			// to prevent user awaring anything changed
			if ((this._mPrivateFlags & RecycleListView.DATA_CHANGED) == RecycleListView.DATA_CHANGED)
				this._handleDataChanged();
			
			if ((this._mPrivateFlags & RecycleListView.DATA_CHANGED) == RecycleListView.DATA_CHANGED) {
				for (var i=this._mChildren.length-1; i>=0; i--) {
					this._mViewRecycler.add(this._mChildren.pop());
				}
			} else {
				for (var i=this._mChildren.length-1; i>=0; i--) {
					this._mViewRecycler.addActiveView(this._mChildren.pop());
				}
			}
			
			// clear layout state
			this._mUI.listContainer.style.marginTop = "0";
			this._mChildrenMarginTop = 0;
			
			// detach all view from parent
			switch (this._mLayoutMode) {
				case RecycleListView.LAYOUT_MODE_FROM_SPECIFIC: {
					var position = this._mSpecificPosition - 1;
					this._mFirstPosition = position;
					
					// build it from position
					this._fillFromTop(position);
					
					this._mSyncTop = 0;
					this._mSyncPosition = position;
					this._mSyncId = null;
					break;
				}
				
				case RecycleListView.LAYOUT_MODE_SPECIFIC: {
					this._correctSyncPosition();
					// look into sync state
					// and find a sync position
					this._mFirstPosition = this._mSyncPosition == -1 ? 0 : this._mSyncPosition;
					this._mChildrenMarginTop = -Math.abs(this._mSyncTop);
					this._mUI.listContainer.style.marginTop = this._mChildrenMarginTop + "px";
					
					this._fillFromTop(this._mFirstPosition);
					
					this._fixTooHigh();
					
					this._computeSyncState();
					
					this._mSyncId = null;
					break;
				}
				
				default : {
					this._mFirstPosition = 0;
					this._fillFromTop(0);
					
					this._mSyncTop = 0;
					this._mSyncPosition = -1;
					this._mSyncId = null;
					break;
				}
			}
			
			this._mViewRecycler.scrapActiveViews();
			
			this._mLayoutMode = RecycleListView.LAYOUT_MODE_NORMAL;
			this._mSpecificPosition = -1;
			this._mPrivateFlags &= ~RecycleListView.DATA_CHANGED;
			
			this.onPositionChanged(this._mFirstPosition, this._mChildren.length);
			
			this._turnPluginDriverOnOrOff();
		},
		_turnPluginDriverOnOrOff : function() {
			// awake scrollbar only if scrollbar is avaiable
			var scrollbar = this.getScrollbar();
			if (scrollbar) {
//				if (this._mFirstPosition > 0 || 
//						this._mFirstPosition + this._mChildren.length < this._mItemCount) {
//					// the first visible item is not the 0
//					// or if we are not display all items right now
//					// even if the first item is 0
//					scrollbar.awake(true);
//				} else {
//					scrollbar.awake(false);
//				}
				
				var needToWakeupScrollbar = false;
				// there are 3 cases we need to handle to wake up 
				// scrollbar system
				// a) the position at the first rendering item is great than zero
				//    indicating we are rendering more than one page items
				// b) the position at first rendering item == 0, but last rendering item did not pass by the total count
				// c) 1 page rendering, the last rendering item laied below the bottom of the list container
				var lastIndex = this._mFirstPosition + this._mChildren.length;
				if (this._mFirstPosition > 0 || lastIndex < this._mItemCount) {
					needToWakeupScrollbar = true;
				} else if (lastIndex == this._mItemCount) {
					var childMarginTop = this._mChildrenMarginTop;
					var lastBottom = (this._mChildren.length * this._mItemHeight) + childMarginTop;
					var containerHeight = this._mUI.listContainer.parentNode.offsetHeight;
					if (lastBottom > containerHeight) {
						needToWakeupScrollbar = true;
					}
				}
				scrollbar.awake(needToWakeupScrollbar);
			}
		},
		_makeAndAddView : function(position) {
			var view = this._mViewRecycler.getActiveView(position);
			
			if (view == null) {
				var recycledView = this._mViewRecycler.get(position);
				var view = null;
				
				if (recycledView != null) {
					view = this.getView(this._mUI.listContainer, recycledView, position);
					// if (view != null && view != recycledView) {
						// this._mViewRecycler.add(view);
					// }
				} else {
					view = this.getView(this._mUI.listContainer, null, position);
				}
			}
			
			if (view == null) {
				throw new Error("can not obtain a view to build list item");
			}
			
			this.insertView(view, position);
			
			return view;
		},
		/**
		 * @protected
		 * insert a child into listview
		 * according to list view hierachy, subclass imple
		 * could override this method to insert view on their own manner
		 */
		insertView : function(view, position) {
			var realPosition = position - this._mFirstPosition;
			var middle = (0 + this._mChildren.length - 1) >> 1;
			if (realPosition > middle)
				this._mUI.listContainer.appendChild(view);
			else
				this._mUI.listContainer.insertBefore(view, this._mChildren[0]);
		},
		/**
		 * @protected
		 * remove a rendering child view from list
		 * due to the view hierachy, subclass and instance of this
		 * class could implement their own remove approach
		 */
		removeView : function(view) {
			return this._mUI.listContainer.removeChild(view);
		},
		_fillFromTop : function(position) {
			if (!this._mUI)
				return;
			
			var listBottom = this._mUI.listContainer.parentNode.offsetHeight;
			var listMarginTop = this._mChildrenMarginTop;
			// real position
			var childrenPosition = position - this._mFirstPosition;
			var itemHeight = this._mItemHeight;
			var top = 0;
			
			// first we build a view and mesure it's dimension
			if ((this._mPrivateFlags & RecycleListView.CLONE_VIEW_BUILD) != RecycleListView.CLONE_VIEW_BUILD) {
				var firstView = this.getView(this._mUI.listContainer, null, 0);
				this.insertView(firstView, 0);
				
				this._mChildren[0] = firstView;
				
				this._mItemHeight = firstView.offsetHeight;
				itemHeight = this._mItemHeight;
				
				top = itemHeight;
				position++;
				childrenPosition++;
				
				this._mPrivateFlags |= RecycleListView.CLONE_VIEW_BUILD;
			} else {
				top = childrenPosition * itemHeight + listMarginTop;
			}
			
			var currentView = null;
			while (top < listBottom && position < this._mItemCount) {
				currentView = this._makeAndAddView(position);
				this._mChildren[childrenPosition] = currentView;
				top += itemHeight;
				position++;
				childrenPosition++;
			}
			
		},
		importCheckedState : function(listview) {
			if (listview instanceof RecycleListView) {
				// regardless of checking state of target view
				// we reset ourself first
				// to prevent not working on empty view
				this._mCheckedChildren.length = 0;
				for (var i = 0, 
						items = listview._mCheckedChildren, 
						len = items.length; 
						i < len; i++) {
					this._mCheckedChildren[i] = items[i];
				}
				if ( this.isAllItemChecked()==true && listview.isAllItemChecked()==false ) {
				    this._mPrivateFlags &= ~RecycleListView.CHECKED_ALL;//全选的时候，view之间的全选位也要重置
				}
			}
		},
		_fillFromBottom : function(position) {
			if (!this._mUI)
				return;
			
			var listBottom = this._mUI.listContainer.parentNode.offsetHeight;
			var listMarginTop = this._mChildrenMarginTop;
			// real position
			
			var itemHeight = this._mItemHeight;
			var bottom = listMarginTop;
			
			var currentView = null;
			
			while (position >=0 && bottom >= 0) {
				currentView = this._makeAndAddView(position);
				// correct margin
				listMarginTop -= itemHeight;
				this._mUI.listContainer.style.marginTop = listMarginTop + "px";
				
				// insert at the top of list
				this._mChildren.unshift(currentView);
				
				bottom -= itemHeight;
				position--;
			}
			
			this._mChildrenMarginTop = listMarginTop;
			this._mFirstPosition = position + 1;
		},
		fillGap : function(dir) {
			var childCount = this._mChildren.length;
			
			if (dir == disk.ui.MouseWheelSensor.FORWARD) {
				this._fillFromTop(this._mFirstPosition + childCount);
				// fix overscrolled state
				this._fixTooHigh();
			} else {
				this._fillFromBottom(this._mFirstPosition - 1);
				// fix overscrolled state
				this._fixTooLow();
			}
		},
		_fixTooLow : function() {
			var childCount = this._mChildren.length;
			// no children yet, reject this request
			if (childCount <= 0)
				return;
			
			var childMarginTop = this._mChildrenMarginTop;
			var lastBottom = (this._mChildren.length * this._mItemHeight) + childMarginTop;
			var containerHeight = this._mUI.listContainer.parentNode.offsetHeight;
			var firstTop = childMarginTop;
			var space = firstTop;
			var firstPosition = this._mFirstPosition;
			
			if (firstPosition == 0) {
				if (space > 0) {
					if (firstPosition + childCount == this._mItemCount || lastBottom > containerHeight) {
						if (firstPosition + childCount == this._mItemCount) {
							space = Math.min(space, lastBottom - containerHeight);
						}
						
						// move up listview items by space
						childMarginTop -= space;
						this._mUI.listContainer.style.marginTop = childMarginTop + "px";
						this._mChildrenMarginTop = childMarginTop;
						
						// if there are more item below
						// and we are overscrolled
						// we spring it back a little again
						// and fill the bottom gap if required
						if (firstPosition + childCount < this._mItemCount) {
							this._fillFromTop(firstPosition + childCount);
						}
						
						// notify our client if we hit edge of the container
						this.onScrollToEdge(RecycleListView.TOP);
					}
				}
			}
		},
		/**
		 * if list view reach end , we correct
		 * the location of list view by spring it back
		 * according to both sides of container
		 */
		_fixTooHigh : function() {
			var childCount = this._mChildren.length;
			// no children yet, reject this request
			if (childCount <= 0)
				return;
			
			var childMarginTop = this._mChildrenMarginTop;
			var lastBottom = (this._mChildren.length * this._mItemHeight) + childMarginTop;
			var containerHeight = this._mUI.listContainer.parentNode.offsetHeight;
			var firstTop = childMarginTop;
			var space = containerHeight - lastBottom;
			var firstPosition = this._mFirstPosition;
			
			//
			// spring it back if we overscrolled
			//
			if ((firstPosition > 0 || firstTop < 0) && space > 0) {
				if (firstPosition == 0) {
					// if the top item is the first list
					// we should spring back less or equal to the 
					// distance behind the scene of the first item
					space = Math.min(space, Math.abs(firstTop));
				}
				
				childMarginTop += space;
					
				this._mChildrenMarginTop = childMarginTop;
				this._mUI.listContainer.style.marginTop = childMarginTop + "px";
				
				// there are more item on the top
				// we spring back a little over
				if (firstPosition > 0) {
					this._fillFromBottom(firstPosition - 1);
					this._adjustViewUpOrDown();
				}
				
				// notify our client we reach to bottom
				this.onScrollToEdge(RecycleListView.BOTTOM);
			} else {
				if (this._mFirstPosition + childCount == this._mItemCount && lastBottom == containerHeight) {
					// notify our client we reach to bottom
					this.onScrollToEdge(RecycleListView.BOTTOM);
				}
			}
		},
		_adjustViewUpOrDown : function() {
			var childCount = this._mChildren.length;
			if (childCount > 0) {
				if (this._mChildrenMarginTop > 0) {
					this._mChildrenMarginTop = 0;
					this._mUI.listContainer.style.marginTop = this._mChildrenMarginTop + "px";
				}
			}
		},
		/**
		 * @protected
		 * subclass or instance of this class
		 * should override this method to return
		 * a new view
		 */
		buildView : function(parentView, convertView, position) {
			return null;
		},
		/**
		 * @protected
		 * notify our client if we reach to the edge of list view
		 */
		onScrollToEdge : function(edge) {
			// do nothing here
		},
		/**
		 * @protected
		 */
		onPositionChanged : function(firstVisiblePosition, visibleChildCount) {
			// console.log("[LOG]first visible position changing ", firstVisiblePosition);
			if ((this._mPrivateFlags & RecycleListView.USING_SCROLLBAR) == 
					RecycleListView.USING_SCROLLBAR) {
				this.awakeScrollbar(true);	
				this.onComputeScrollbarState(this.getScrollbar(true), firstVisiblePosition, visibleChildCount);
			}
			
			// bind keyboard dispatch to this instance
//			if ((this._mPrivateFlags & RecycleListView.USING_KEYBOARD_DISPATCHER) == 
//					RecycleListView.USING_KEYBOARD_DISPATCHER) {
//				disk.ui.IKeyboardDispatcher.getKeyboardDispatcher().bind(this);
//			}
		},
		// *****************************************************
		// keyboard dispatcher related method
		//
		onKeyboardArrowDown : function() {
			this.arrowScroll(disk.ui.MouseWheelSensor.FORWARD);
		},
		onKeyboardArrowUp : function() {
			this.arrowScroll(disk.ui.MouseWheelSensor.BACKWARD);
		},
		onKeyboardPageUp : function() {
			this.pageScroll(disk.ui.MouseWheelSensor.BACKWARD);
		},
		onKeyboardPageDown : function() {
			this.pageScroll(disk.ui.MouseWheelSensor.FORWARD);
		},
		//
		// keyboard dispatcher related method
		// *******************************************************
		getCount : function() {
			return this._mItemCount;
		},
		/**
		 * @protected
		 */
		onScroll : function(dir, pixelDelta) {
			// console.log("up? ", dir == disk.ui.MouseWheelSensor.FORWARD);
			var firstPosition = this._mFirstPosition;
			var childCount = this._mChildren.length;
			var childMarginTop = this._mChildrenMarginTop;
			
			var firstTop = childMarginTop;
			// 0 1 2
			var lastBottom = (this._mChildren.length * this._mItemHeight) + childMarginTop;
			var containerHeight = this._mUI.listContainer.parentNode.offsetHeight;
			
			// do not pass though a whole height
			pixelDelta = Math.min(pixelDelta, containerHeight - 1);
			
			// we are scrolling down to move up 
			if (dir == disk.ui.MouseWheelSensor.FORWARD && 
				firstPosition + childCount == this._mItemCount && 
				lastBottom <= containerHeight && pixelDelta >= 0) {
				return pixelDelta != 0;
			}
			
			// we are scrolling up to move down
			if (dir == disk.ui.MouseWheelSensor.BACKWARD && 
				firstPosition == 0 && firstTop >= 0 && 
				pixelDelta >= 0) {
				return pixelDelta != 0;
			}
			
			var count = 0;
			if (dir == disk.ui.MouseWheelSensor.FORWARD) {
				for (var i=0, len=this._mChildren.length; i<len; i++) {
					if ((i+1) * this._mItemHeight - Math.abs(childMarginTop) < 0) {
						// increase margin to prevent shrink
						childMarginTop += this._mItemHeight;
						this._mUI.listContainer.style.marginTop = childMarginTop + "px";
						
						this._mViewRecycler.add(this._mChildren.shift());
						count++;
					} else {
						break;
					}
				}
			} else {
				for (var i=this._mChildren.length-1; i>=0; i--) {
					if (this._mItemHeight * i + childMarginTop > containerHeight) {
						// we are obsured, recycle me
						this._mViewRecycler.add(this._mChildren.pop());
						count++;
					} else {
						break;
					}
				}
			}
			
			if (dir == disk.ui.MouseWheelSensor.FORWARD)
				childMarginTop -= pixelDelta;
			else
				childMarginTop += pixelDelta;// release space on the top
			
			this._mUI.listContainer.style.marginTop = childMarginTop + "px";
			this._mChildrenMarginTop = childMarginTop;
			
			if (dir == disk.ui.MouseWheelSensor.FORWARD) {
				this._mFirstPosition += count;
			}
			
			lastBottom = (this._mChildren.length * this._mItemHeight) + childMarginTop;
			if (childMarginTop > 0 || lastBottom < containerHeight) {
				this.fillGap(dir);
			}
			
			// save current status
			this._computeSyncState();
			
			this.onPositionChanged(this._mFirstPosition, this._mChildren.length);
		},
		_computeSyncState : function() {
			//this._mSyncTop = childMarginTop;
			this._mSyncTop = this._mChildrenMarginTop;
			this._mSyncPosition = this._mFirstPosition;
			var idAtPosition = this.getIdForPosition(this._mFirstPosition);
			if (idAtPosition != null)
				this._mSyncId = idAtPosition;
		},
		_computeSmoothScrollArgs : function(pixelDelta) {
			var duration = RecycleListView.SMOOTH_SCROLL_DURATION;
			this._mSmoothScrollDelta = Math.ceil(pixelDelta / (duration / RecycleListView.SMOOTH_SCROLL_INTERVAL));
			
			// most of time, we do not need
			// to execute the code below
			if (this._mSmoothScrollDelta >= this._mItemHeight) {
				var maxSplitCount = 10;
				var i = 0;
				while (this._mSmoothScrollDelta >= this._mItemHeight) {
					if (i >= maxSplitCount) {
						throw new Error("pixelDelta arg is not considered as legal");
						break;
					}
					
					// we expand the animation time period
					// 2 times than previous one
					duration *= 2;
					
					this._mSmoothScrollDelta = Math.ceil(pixelDelta / (duration / RecycleListView.SMOOTH_SCROLL_INTERVAL));
					i++;
				}
			}
		},
		_clearSmoothScrollArgs : function() {
			this._mPrivateFlags &= ~RecycleListView.SMOOTH_SCROLLING;
			this._mSmoothScrollRemaining = this._mSmoothScrollDelta = 0;
			this._mScrollDir = -1;
		},
		stopSmoothScroll : function() {
			if (this._mSmoothScroller != null) {
				// do not scroll anymore
				this._mSmoothScroller.interrupt();
				// clear scroll config
				this._clearSmoothScrollArgs();
			}
		},
		_setupSmoothScrollArgs : function(pixelDelta) {
			var _this = this;
			
			if (_this._mSmoothScroller == null) {
				_this._mSmoothScroller = new disk.util.TimerService(RecycleListView.SMOOTH_SCROLL_INTERVAL, function() {
					// console.log(">>>>>>count down ", _this._mSmoothScrollRemaining);
					var hitEnd = false;
					if (Math.abs(_this._mSmoothScrollRemaining) <= Math.abs(_this._mSmoothScrollDelta)) {
						hitEnd = _this.onScroll(_this._mScrollDir, _this._mSmoothScrollRemaining);
						
						_this._clearSmoothScrollArgs();
						
						// did we in persist scrolling state?
						if (!hitEnd && _this._mPersistScrollDir != -1) {
							_this.arrowScroll(_this._mPersistScrollDir);
						} else {
							_this._mPersistScrollDir == -1;
						}
					} else {
						_this._mSmoothScrollRemaining -= _this._mSmoothScrollDelta;
						hitEnd = _this.onScroll(_this._mScrollDir, _this._mSmoothScrollDelta);
						this.start();
					}
				});
			}
			
			// config smooth scroll args
			_this._computeSmoothScrollArgs(pixelDelta);
			_this._mSmoothScrollRemaining = pixelDelta - _this._mSmoothScrollDelta;
			_this._mSmoothScroller.start();
			
			var hitEnd = _this.onScroll(_this._mScrollDir, _this._mSmoothScrollDelta);
			
			_this._mPrivateFlags |= RecycleListView.SMOOTH_SCROLLING;
		},
		smoothScroll : function(dir, pixelDelta) {
			if (this.locked())
				return;

			this._mScrollDir = dir;
			this._setupSmoothScrollArgs(pixelDelta);
		},
		scrollBy : function(dir, pixelDelta) {
			if (this.locked())
				return;

			this.onScroll(dir, pixelDelta);
		},
		setUsingKeyboardDispatcher : function(b) {
			if (b) {
				this._mPrivateFlags |= RecycleListView.USING_KEYBOARD_DISPATCHER;
			} else {
				this._mPrivateFlags &= ~RecycleListView.USING_KEYBOARD_DISPATCHER;
			}
		},
		activateKeyguard : function(b, exclusive) {
			var state = this._mConfig.flags | this._mPrivateFlags;
			if ((state & RecycleListView.USING_KEYBOARD_DISPATCHER) == RecycleListView.USING_KEYBOARD_DISPATCHER) {
				if (b) {
					if (!this._mKeyguard) {
						var _this = this;
						this._mKeyguardListener = {
							onMount : function(inOut) {
								if (disk.DEBUG)console.log("###we are mounted = ", inOut);
							},
							onConnectivity : function(isConnect) {
								if (disk.DEBUG)console.log("###connectivity=", isConnect);
							},
							onKeyAction : function(evtType) {
								if (disk.DEBUG)console.log("###key action=", evtType);
								if (_this._mItemCount == 0)
									return false;
								
								switch (evtType) {
								case disk.ui.Keyguard.EVENT_PAGE_UP:
									_this.onKeyboardPageUp();
									return true;
								case disk.ui.Keyguard.EVENT_PAGE_DOWN:
									_this.onKeyboardPageDown();
									return true;
								case disk.ui.Keyguard.EVENT_ARROW_UP:
									_this.onKeyboardArrowUp();
									return true;
								case disk.ui.Keyguard.EVENT_ARROW_DOWN:
									_this.onKeyboardArrowDown();
									return true;
								default:
									return false;
								}
							},
							onKeyEvent : function(keyCode, meta) {
								if (disk.DEBUG)console.log("###key event=", keyCode, meta);
							}
						};
						this._mKeyguard = disk.Context.getService(disk.Context.SERVICE_KEYGUARD);
					}
					this._mKeyguard.acquire(this._mKeyguardListener, exclusive);
				} else {
					this._mKeyguard.release(this._mKeyguardListener);
				}
			}
		},
		isUsingKeyboardDispatcher : function() {
			return (this._mPrivateFlags & RecycleListView.USING_KEYBOARD_DISPATCHER) == 
					RecycleListView.USING_KEYBOARD_DISPATCHER;
		},
		setUsingMouseWheelSensor : function(b) {
			if (b) {
				this._mPrivateFlags |= RecycleListView.USING_MOUSE_WHEEL_SENSOR;
				var _this = this;
				var sensor = new disk.ui.MouseWheelSensor(this._mUI.listContainer.parentNode);
				sensor.onWheelChanged = function(dir, delta) {
					if (_this.locked())
						return;
					
					var pixelRatio = RecycleListView.WHEEL_TO_PIXEL_RATIO;
					if ((_this._mPrivateFlags & RecycleListView.USING_LOW_PIXEL_RATIO) == 
						RecycleListView.USING_LOW_PIXEL_RATIO) {
						pixelRatio = RecycleListView.WHEEL_TO_PIXEL_RATIO_LOW;
					}
					
					var pixelDelta = delta * pixelRatio;
					// shut down the smooth scrolling
					// smooth scrolling is a bad idea
					// on working with scrollbar
					if ((_this._mPrivateFlags & RecycleListView.SMOOTH_SCROLLING) == RecycleListView.SMOOTH_SCROLLING) {
						_this.stopSmoothScroll();
					}
					
					_this._mScrollDir = dir;
					
					// not ready
					if (_this._mItemHeight == 0)
						return;
					
					// scroll forward
					var hitEnd = _this.onScroll(_this._mScrollDir, pixelDelta);	
				}
				sensor.sense();
				this._mWheelSensor = sensor;
			} else {
				this._mPrivateFlags &= ~RecycleListView.USING_MOUSE_WHEEL_SENSOR;
			}
		},
		_build : function() {
			var _this = this;
			this._mViewRecycler = new ViewRecycler();
			
			var flags = this._mConfig.flags;
			if (typeof flags != "undefined") {
				// using mouse wheel sensor ????
				if ((flags & RecycleListView.USING_MOUSE_WHEEL_SENSOR) == RecycleListView.USING_MOUSE_WHEEL_SENSOR) {
					this.setUsingMouseWheelSensor(true);
				}
				// using scrollbar???
				if ((flags & RecycleListView.USING_SCROLLBAR) == RecycleListView.USING_SCROLLBAR) {
					this.setUsingScrollbar(true);
				}
				// using keyboard dispatcher ???
				if ((flags & RecycleListView.USING_KEYBOARD_DISPATCHER) == RecycleListView.USING_KEYBOARD_DISPATCHER) {
					this.setUsingKeyboardDispatcher(true);
				}
				// using touch gesture detector ???
				// TODO fix this by adding a touch gesture detector
				if ((flags & RecycleListView.USING_TOUCH_SENSOR) == RecycleListView.USING_TOUCH_SENSOR) {
					if (disk.ui.MotionSensor.hasMotionCampatibility()) {
						if (disk.DEBUG) console.log("Motion Tracker Installed");
						this.setUsingMotionSensor(true);
					}
				}
			}
		},
		setUsingMotionSensor : function(b) {
			if (b) {
				this._mPrivateFlags |= RecycleListView.USING_TOUCH_SENSOR;
				var sensor = new disk.ui.MotionSensor(this._mUI.listContainer, disk.ui.MotionSensor.VERTICAL), 
					_this = this;
				
				sensor.onMotion = function(canvasView, touchPoint, deltaX, deltaY, orientation) {
					if (_this.locked())
						return;
					
					// shut down the smooth scrolling
					// smooth scrolling is a bad idea
					// on working with scrollbar
					if ((_this._mPrivateFlags & RecycleListView.SMOOTH_SCROLLING) == RecycleListView.SMOOTH_SCROLLING) {
						_this.stopSmoothScroll();
					}
					
					_this._mScrollDir = deltaY > 0 ? disk.ui.MouseWheelSensor.BACKWARD : disk.ui.MouseWheelSensor.FORWARD;
					
					// not ready
					if (_this._mItemHeight == 0)
						return;
					
					// scroll forward
					var hitEnd = _this.onScroll(_this._mScrollDir, Math.abs(deltaY));	
				}
				sensor.install();
				this._mMotionSensor = sensor;
			} else {
				this._mPrivateFlags &= ~RecycleListView.USING_TOUCH_SENSOR;
			}
		},
		setDebugAlias : function(name) {
			this._mDebugAlias = name;
		},
		toString : function() {
			return this._mDebugAlias;
		}
	};
	disk.ui.RecycleListView = RecycleListView;
})();
