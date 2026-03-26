const api = require('../../services/api');

Page({
  data: {
    showLogin: false,
    isLoading: false
  },

  async onLoad() {
    // 检查是否已登录
    const token = wx.getStorageSync('token');
    const refreshToken = wx.getStorageSync('refreshToken');
    const user = wx.getStorageSync('user');
    
    if (token && user) {
      try {
        // 验证 token 有效性
        await api.getProfile();
        
        // token 有效，正常跳转
        if (user.targetSchool) {
          wx.reLaunch({ url: '/pages/home/index' });
        } else {
          wx.reLaunch({ url: '/pages/onboarding/index' });
        }
        return;
      } catch (err) {
        console.log('[Splash] Token validation failed, trying refresh...');
        
        // token 无效，尝试用 refreshToken 刷新
        if (refreshToken) {
          try {
            const res = await api.refreshToken(refreshToken);
            
            // 刷新成功，保存新 token
            wx.setStorageSync('token', res.accessToken);
            wx.setStorageSync('refreshToken', res.refreshToken);
            if (res.user) {
              wx.setStorageSync('user', res.user);
            }
            
            console.log('[Splash] Token refreshed successfully');
            
            // 跳转
            const updatedUser = res.user || user;
            if (updatedUser.targetSchool) {
              wx.reLaunch({ url: '/pages/home/index' });
            } else {
              wx.reLaunch({ url: '/pages/onboarding/index' });
            }
            return;
          } catch (refreshErr) {
            console.log('[Splash] Refresh token also failed, need re-login');
          }
        }
        
        // 刷新也失败，清除所有认证信息
        wx.removeStorageSync('token');
        wx.removeStorageSync('refreshToken');
        wx.removeStorageSync('user');
      }
    }

    // 2秒后显示登录按钮
    setTimeout(() => {
      this.setData({ showLogin: true });
    }, 2000);
  },

  /**
   * 微信一键登录（不需要手机号）
   */
  async onWeChatLogin() {
    try {
      this.setData({ isLoading: true });

      // 1. 获取微信登录code
      const { code } = await wx.login();
      if (!code) {
        wx.showToast({ title: '获取登录凭证失败', icon: 'none' });
        this.setData({ isLoading: false });
        return;
      }

      // 2. 调用后端登录接口
      const res = await api.wechatLogin(code);
      
      this.setData({ isLoading: false });

      // 3. 处理登录结果
      if (res.accessToken) {
        // 登录成功：用户已存在
        wx.setStorageSync('token', res.accessToken);
        wx.setStorageSync('refreshToken', res.refreshToken);
        wx.setStorageSync('user', res.user);
        
        wx.showToast({ title: '登录成功', icon: 'success' });
        
        setTimeout(() => {
          if (res.user.targetSchool) {
            wx.reLaunch({ url: '/pages/home/index' });
          } else {
            wx.reLaunch({ url: '/pages/onboarding/index' });
          }
        }, 800);
      } else if (res.needBinding) {
        // 新用户：可选择绑定手机号或跳过
        wx.setStorageSync('pending_external_id', res.openid);
        
        wx.showModal({
          title: '欢迎使用阿陪',
          content: '检测到您是新用户，是否绑定手机号？（可跳过）',
          confirmText: '绑定',
          cancelText: '跳过',
          success: (modalRes) => {
            if (modalRes.confirm) {
              // 用户选择绑定手机号
              wx.redirectTo({ url: '/pages/bind-phone/index' });
            } else {
              // 用户选择跳过，直接创建匿名账号
              this.createAnonymousUser(res.openid);
            }
          }
        });
      }
    } catch (err) {
      this.setData({ isLoading: false });
      console.error('WeChat login failed:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  },

  /**
   * 创建匿名用户（不绑定手机号）
   */
  async createAnonymousUser(openid) {
    try {
      wx.showLoading({ title: '创建账号中...' });

      // 调用后端创建匿名用户
      const res = await api.login({
        externalId: openid,
        phoneNumber: '', // 空手机号
        smsCode: '' // 空验证码
      });

      wx.hideLoading();

      if (res && res.accessToken) {
        wx.setStorageSync('token', res.accessToken);
        wx.setStorageSync('refreshToken', res.refreshToken);
        wx.setStorageSync('user', res.user);
        wx.removeStorageSync('pending_external_id');
        
        wx.showToast({ title: '欢迎使用阿陪', icon: 'success' });
        
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/onboarding/index' });
        }, 800);
      } else {
        wx.showToast({ title: '创建账号失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('Create anonymous user failed:', err);
      wx.showToast({ title: '创建账号失败，请重试', icon: 'none' });
    }
  },

  /**
   * 显示协议
   */
  showAgreement(e) {
    const { type } = e.currentTarget.dataset;
    const title = type === 'user' ? '用户协议' : '隐私政策';
    
    wx.showModal({
      title: title,
      content: '协议内容开发中...',
      showCancel: false
    });
  }
});
