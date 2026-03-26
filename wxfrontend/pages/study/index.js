const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    questionSets: [] // List of imported question sets
  },

  onLoad() {
    this.startX = 0; // Touch start X coordinate
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init();
    }
    this.loadQuestionSets();
  },

  async loadQuestionSets() {
    try {
      // 检查 token 是否存在
      const token = wx.getStorageSync('token');
      if (!token) {
        wx.reLaunch({ url: '/pages/splash/index' });
        return;
      }

      // Fetch question sets from backend
      const res = await api.getQuestionSets();
      
      // Initialize swipe properties for each item
      const questionSets = res.map(item => ({
        ...item,
        txtStyle: 'left:0px',
        showDelete: false
      }));

      this.setData({ questionSets });
    } catch (err) {
      console.error('Failed to load question sets', err);
      // Mock data for fallback/demo if API fails or not ready
      const mockData = [
        { id: 1, title: '2024考研政治真题', subject: '考研政治', count: 35, icon: 'city' },
        { id: 2, title: '英语一阅读理解专项', subject: '考研英语', count: 20, icon: 'earth' }
      ];
      
      const questionSets = mockData.map(item => ({
        ...item,
        txtStyle: 'left:0px',
        showDelete: false
      }));

      this.setData({ questionSets });
    }
  },

  onGoToWrongBook() {
    wx.navigateTo({ url: '/pages/wrong-book/index' });
  },

  onGoToImport() {
    wx.navigateTo({ url: '/pages/import/index' });
  },

  onGoToQuestionSet(e) {
    // If user swipes, do not navigate (handled by touch events, but tap might still fire)
    // Actually, bindtap is on the card, which moves. 
    // If the card is swiped open, maybe we should close it instead of navigating?
    // For now, let's allow navigation unless it's a swipe action.
    // However, usually tapping an open swipe cell should close it or navigate.
    // Let's check if any item is open.
    const openItem = this.data.questionSets.find(item => item.showDelete);
    if (openItem) {
      this.resetSwipe();
      return;
    }

    const { id, title } = e.currentTarget.dataset;
    // Navigate to question set detail page
    wx.navigateTo({ 
      url: `/pages/question-set/detail/index?id=${id}&title=${encodeURIComponent(title)}` 
    });
  },

  // Swipe Logic
  touchStart(e) {
    if (e.touches.length === 1) {
      this.setData({ startX: e.touches[0].clientX });
    }
  },

  touchMove(e) {
    if (e.touches.length === 1) {
      const index = e.currentTarget.dataset.index;
      const moveX = e.touches[0].clientX;
      const disX = this.data.startX - moveX;
      let txtStyle = '';
      let showDelete = false;

      if (disX <= 0) {
        txtStyle = 'left:0px';
        showDelete = false;
      } else if (disX > 0) {
        txtStyle = `left:-${disX}px`;
        showDelete = true;
        if (disX >= 70) { // Only delete button, so max width is smaller (e.g., 70px)
          txtStyle = 'left:-70px';
        }
      }
      
      const questionSets = this.data.questionSets;
      questionSets[index].txtStyle = txtStyle;
      questionSets[index].showDelete = showDelete;
      this.setData({ questionSets });
    }
  },

  touchEnd(e) {
    if (e.changedTouches.length === 1) {
      const index = e.currentTarget.dataset.index;
      const endX = e.changedTouches[0].clientX;
      const disX = this.data.startX - endX;
      const questionSets = this.data.questionSets;
      
      const delBtnWidth = 70; // Width of delete button
      let txtStyle = disX > delBtnWidth / 2 ? `left:-${delBtnWidth}px` : 'left:0px';
      let showDelete = disX > delBtnWidth / 2;
      
      // Close other open items
      questionSets.forEach((item, idx) => {
        if (idx !== index) {
          item.txtStyle = 'left:0px';
          item.showDelete = false;
        }
      });
      
      questionSets[index].txtStyle = txtStyle;
      questionSets[index].showDelete = showDelete;
      this.setData({ questionSets });
    }
  },
  
  resetSwipe() {
    const questionSets = this.data.questionSets.map(item => ({ 
      ...item, 
      txtStyle: 'left:0px', 
      showDelete: false 
    }));
    this.setData({ questionSets });
  },

  onDeleteQuestionSet(e) {
    const { id } = e.currentTarget.dataset;
    const _this = this;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个题库吗？删除后无法恢复。',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            // Call API to delete
            await api.deleteQuestionSet(id);
            
            wx.showToast({ title: '已删除', icon: 'success' });
            
            // Remove from local list
            const questionSets = _this.data.questionSets.filter(item => item.id !== id);
            _this.setData({ questionSets });
            
          } catch (err) {
            console.error(err);
            wx.hideLoading();
            // Handle mock data deletion if API fails (for demo purposes)
            if (err.statusCode === 404 || err.message.includes('404')) {
                 // Mock delete
                 wx.showToast({ title: '已删除(本地)', icon: 'success' });
                 const questionSets = _this.data.questionSets.filter(item => item.id !== id);
                 _this.setData({ questionSets });
            } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
            }
          }
        }
      }
    });
  }
});
