const api = require('../../services/api');

Page({
  data: {
    paddingTop: 44,
    phoneNumber: '',
    smsCode: '',
    countdown: 0,
    timer: null,
    canSendCode: false,
    canSubmit: false,
    externalId: '',
    from: '' // 来源页面: 'profile' 或空
  },

  onLoad(options) {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    
    // 记录来源页面
    if (options.from) {
      this.setData({ from: options.from });
    }
    
    // 获取待绑定的openid
    const externalId = wx.getStorageSync('pending_external_id');
    if (!externalId) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    this.setData({ externalId });
  },

  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  /**
   * 返回登录页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/login/index' });
      }
    });
  },

  /**
   * 跳过绑定
   */
  skipBinding() {
    // 从个人页面来的，直接返回
    if (this.data.from === 'profile') {
      wx.navigateBack();
      return;
    }
    
    // 新用户注册流程，确认后创建匿名账号
    wx.showModal({
      title: '确认跳过？',
      content: '跳过后将创建匿名账号，后续可在个人中心绑定手机号',
      confirmText: '确认跳过',
      cancelText: '再想想',
      success: async (res) => {
        if (res.confirm) {
          await this.createAnonymousUser();
        }
      }
    });
  },

  /**
   * 创建匿名用户
   */
  async createAnonymousUser() {
    try {
      wx.showLoading({ title: '创建账号中...' });

      const res = await api.login({
        externalId: this.data.externalId,
        phoneNumber: '', // 空手机号表示匿名用户
        smsCode: ''
      });

      wx.hideLoading();

      if (res && res.accessToken) {
        wx.setStorageSync('token', res.accessToken);
        wx.setStorageSync('refreshToken', res.refreshToken);
        wx.setStorageSync('user', res.user);
        wx.removeStorageSync('pending_external_id');
        
        wx.showToast({ 
          title: '欢迎使用阿陪', 
          icon: 'success' 
        });
        
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/onboarding/index' });
        }, 800);
      } else {
        wx.showToast({ title: '创建账号失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('Create anonymous user failed:', err);
      wx.showToast({ 
        title: err.message || '创建账号失败，请重试', 
        icon: 'none' 
      });
    }
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    const phoneNumber = e.detail.value;
    this.setData({ phoneNumber }, () => {
      this.validateForm();
    });
  },

  /**
   * 验证码输入
   */
  onCodeInput(e) {
    const smsCode = e.detail.value;
    this.setData({ smsCode }, () => {
      this.validateForm();
    });
  },

  /**
   * 表单验证
   */
  validateForm() {
    const { phoneNumber, smsCode, countdown } = this.data;
    
    // 验证手机号格式
    const phoneValid = /^1\d{10}$/.test(phoneNumber);
    
    // 验证验证码格式
    const codeValid = /^\d{6}$/.test(smsCode);
    
    this.setData({
      canSendCode: phoneValid && countdown === 0,
      canSubmit: phoneValid && codeValid
    });
  },

  /**
   * 发送验证码
   */
  async sendCode() {
    if (!this.data.canSendCode) return;

    try {
      wx.showLoading({ title: '发送中...' });
      
      await api.sendSms(this.data.phoneNumber);
      
      wx.hideLoading();
      wx.showToast({ 
        title: '验证码已发送', 
        icon: 'success' 
      });

      // 开始倒计时
      this.setData({ countdown: 60 });
      
      const timer = setInterval(() => {
        if (this.data.countdown <= 1) {
          clearInterval(timer);
          this.setData({ 
            countdown: 0, 
            timer: null 
          }, () => {
            this.validateForm();
          });
        } else {
          this.setData({ 
            countdown: this.data.countdown - 1 
          });
        }
      }, 1000);
      
      this.setData({ timer });

    } catch (err) {
      wx.hideLoading();
      console.error('Send SMS failed:', err);
      wx.showToast({ 
        title: err.message || '发送失败，请重试', 
        icon: 'none' 
      });
    }
  },

  /**
   * 提交绑定
   */
  async submit() {
    if (!this.data.canSubmit) return;

    try {
      wx.showLoading({ title: '验证中...' });

      const res = await api.login({
        externalId: this.data.externalId,
        phoneNumber: this.data.phoneNumber,
        smsCode: this.data.smsCode
      });

      wx.hideLoading();

      if (res && res.accessToken) {
        wx.setStorageSync('token', res.accessToken);
        wx.setStorageSync('refreshToken', res.refreshToken);
        wx.setStorageSync('user', res.user);
        wx.removeStorageSync('pending_external_id');
        
        wx.showToast({ 
          title: '绑定成功', 
          icon: 'success' 
        });
        
        setTimeout(() => {
          // 根据来源决定跳转目标
          if (this.data.from === 'profile') {
            // 从个人页面来，返回个人页面
            wx.navigateBack();
          } else {
            // 新用户注册流程，跳转到引导页
            wx.reLaunch({ url: '/pages/onboarding/index' });
          }
        }, 800);
      } else {
        wx.showToast({ 
          title: '验证码错误', 
          icon: 'none' 
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('Bind phone failed:', err);
      wx.showToast({ 
        title: err.message || '绑定失败，请重试', 
        icon: 'none' 
      });
    }
  }
});
