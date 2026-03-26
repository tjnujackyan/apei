const api = require('../../services/api');

Page({
  data: {
    user: null,
    paddingTop: 0,
    phoneDisplay: '' // 脱敏显示的手机号
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  onShow() {
    this.getTabBar().init();
    this.loadProfile();
  },

  async loadProfile() {
    try {
      // 检查 token 是否存在
      const token = wx.getStorageSync('token');
      if (!token) {
        wx.reLaunch({ url: '/pages/splash/index' });
        return;
      }

      const user = await api.getProfile();
      // 手机号脱敏显示: 138****1234
      let phoneDisplay = '';
      if (user.phoneNumber) {
        const phone = user.phoneNumber;
        phoneDisplay = phone.slice(0, 3) + '****' + phone.slice(-4);
      }
      this.setData({ user, phoneDisplay });
    } catch (err) {
      console.error('Load profile failed:', err);
      // 如果是认证错误，request.js 已经处理了跳转
    }
  },

  handleBindPhone() {
    if (this.data.user && this.data.user.externalId) {
      wx.setStorageSync('pending_external_id', this.data.user.externalId);
      wx.navigateTo({ url: '/pages/bind-phone/index?from=profile' });
    }
  },

  handleChangePhone() {
    // 修改手机号，跳转到专门页面
    const phone = this.data.phoneDisplay;
    wx.navigateTo({ url: `/pages/change-phone/index?phone=${phone}` });
  },

  handleEditProfile() {
    wx.navigateTo({ url: '/pages/edit-profile/index' });
  },

  handleMyPlans() {
    wx.navigateTo({ url: '/pages/my-plans/index' });
  },

  handleSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  handleAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  }
})
