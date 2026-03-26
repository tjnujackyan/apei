const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  handleBack() {
    wx.navigateBack();
  },

  handleClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除本地缓存吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            // 保留登录信息
            const token = wx.getStorageSync('token');
            const refreshToken = wx.getStorageSync('refreshToken');
            const user = wx.getStorageSync('user');
            
            wx.clearStorageSync();
            
            // 恢复登录信息
            if (token) wx.setStorageSync('token', token);
            if (refreshToken) wx.setStorageSync('refreshToken', refreshToken);
            if (user) wx.setStorageSync('user', user);
            
            wx.showToast({ title: '缓存已清除', icon: 'success' });
          } catch (err) {
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      }
    });
  },

  handleFeedback() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  /**
   * 退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 调用后端登出接口（撤销 refresh token）
            await api.logout().catch(() => {
              // 即使后端调用失败也继续清除本地数据
              console.log('[Settings] Logout API failed, but continue to clear local data');
            });
          } finally {
            // 清除本地存储的认证信息
            wx.removeStorageSync('token');
            wx.removeStorageSync('refreshToken');
            wx.removeStorageSync('user');
            wx.removeStorageSync('pending_external_id');
            
            wx.showToast({ 
              title: '已退出登录', 
              icon: 'success' 
            });
            
            setTimeout(() => {
              wx.reLaunch({ url: '/pages/splash/index' });
            }, 800);
          }
        }
      }
    });
  }
});
