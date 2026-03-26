const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    currentPhone: '', // 当前手机号（脱敏）
    newPhone: '',
    smsCode: '',
    countdown: 0,
    timer: null,
    canSendCode: false,
    canSubmit: false
  },

  onLoad(options) {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    
    // 获取当前手机号
    if (options.phone) {
      this.setData({ currentPhone: options.phone });
    }
  },

  onUnload() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
    }
  },

  handleBack() {
    wx.navigateBack();
  },

  onPhoneInput(e) {
    const newPhone = e.detail.value;
    this.setData({ newPhone }, () => this.validateForm());
  },

  onCodeInput(e) {
    const smsCode = e.detail.value;
    this.setData({ smsCode }, () => this.validateForm());
  },

  validateForm() {
    const { newPhone, smsCode, countdown } = this.data;
    const phoneValid = /^1\d{10}$/.test(newPhone);
    const codeValid = /^\d{6}$/.test(smsCode);
    
    this.setData({
      canSendCode: phoneValid && countdown === 0,
      canSubmit: phoneValid && codeValid
    });
  },

  async sendCode() {
    if (!this.data.canSendCode) return;

    try {
      wx.showLoading({ title: '发送中...' });
      await api.sendSms(this.data.newPhone);
      wx.hideLoading();
      wx.showToast({ title: '验证码已发送', icon: 'success' });

      this.setData({ countdown: 60 });
      
      const timer = setInterval(() => {
        if (this.data.countdown <= 1) {
          clearInterval(timer);
          this.setData({ countdown: 0, timer: null }, () => this.validateForm());
        } else {
          this.setData({ countdown: this.data.countdown - 1 });
        }
      }, 1000);
      
      this.setData({ timer });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '发送失败', icon: 'none' });
    }
  },

  async submit() {
    if (!this.data.canSubmit) return;

    try {
      wx.showLoading({ title: '验证中...' });
      
      // 调用更新手机号API
      await api.updatePhone(this.data.newPhone, this.data.smsCode);

      wx.hideLoading();
      wx.showToast({ title: '修改成功', icon: 'success' });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '修改失败', icon: 'none' });
    }
  }
});
