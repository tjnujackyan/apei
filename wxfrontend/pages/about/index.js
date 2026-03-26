Page({
  data: {
    paddingTop: 0,
    version: '1.0.0'
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  handleBack() {
    wx.navigateBack();
  },

  handlePrivacy() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  handleTerms() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  handleCheckUpdate() {
    wx.showToast({ title: '已是最新版本', icon: 'success' });
  }
});
