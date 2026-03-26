const api = require('../../services/api');

Page({
  data: {
    questionSets: [],
    loading: true,
    paddingTop: 0,
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init();
    }
    this.loadData();
  },

  async loadData() {
    try {
      this.setData({ loading: true });
      const questionSets = await api.getWrongQuestionSets();
      this.setData({ 
        questionSets, 
        loading: false 
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
    }
  },

  onGoToDetail(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    
    wx.navigateTo({
      url: `/pages/wrong-book/detail/index?questionSetId=${id}&name=${encodeURIComponent(title || '错题详情')}`
    });
  }
})