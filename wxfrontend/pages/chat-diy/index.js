const api = require('../../services/api');

// 气泡样式列表（使用 CSS class）
const BUBBLE_OPTIONS = [
  { label: '经典白', className: 'bubble-style-0', preview: 'background: #FFFFFF; border: 1px solid rgba(0,0,0,0.08);' },
  { label: '薄荷绿', className: 'bubble-style-3', preview: 'background: linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%);' },
  { label: '奶茶色', className: 'bubble-style-4', preview: 'background: linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%);' },
  { label: '梦幻紫', className: 'bubble-style-5', preview: 'background: linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%);' },
];

// 字体样式列表
const FONT_OPTIONS = [
  { label: '默认', style: 'font-family: -apple-system, BlinkMacSystemFont, sans-serif;' },
  { label: '圆体', style: 'font-family: "PingFang SC", "Hiragino Sans GB", sans-serif; font-weight: 300;' },
  { label: '楷体', style: 'font-family: "Kaiti SC", "STKaiti", serif;' },
  { label: '黑体', style: 'font-family: "Heiti SC", "Microsoft YaHei", sans-serif; font-weight: 600;' },
];

Page({
  data: {
    paddingTop: 0,
    saving: false,
    
    // 配置选项
    bubbleOptions: BUBBLE_OPTIONS,
    fontOptions: FONT_OPTIONS,
    
    // 当前配置
    config: {
      customAvatarUrl: '',
      customBackgroundUrl: '',
      bubbleStyle: 0,
      fontStyle: 0,
    },
    
    // 预览样式
    currentAvatarUrl: '/assets/icon.png',
    previewBgStyle: 'background: #F5F5F7;',
    bubbleClassName: 'bubble-style-0',
    fontStyle: '',
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    this.loadConfig();
  },

  handleBack() {
    wx.navigateBack();
  },

  async loadConfig() {
    try {
      const user = await api.getProfile();
      if (user && user.chatDiyConfig) {
        let config;
        if (typeof user.chatDiyConfig === 'string') {
          config = JSON.parse(user.chatDiyConfig);
        } else {
          config = user.chatDiyConfig;
        }
        
        this.setData({
          config: {
            customAvatarUrl: config.customAvatarUrl || '',
            customBackgroundUrl: config.customBackgroundUrl || '',
            avatarStorageKey: config.avatarStorageKey || '',
            bgStorageKey: config.bgStorageKey || '',
            bubbleStyle: config.bubbleStyle || 0,
            fontStyle: config.fontStyle || 0,
          }
        });
        this.updatePreview();
      }
    } catch (err) {
      console.error('Load config failed:', err);
    }
  },

  updatePreview() {
    const { config, bubbleOptions, fontOptions } = this.data;
    
    this.setData({
      currentAvatarUrl: config.customAvatarUrl || '/assets/icon.png',
      previewBgStyle: config.customBackgroundUrl 
        ? `background-image: url(${config.customBackgroundUrl}); background-size: cover; background-position: center;` 
        : 'background: #F5F5F7;',
      bubbleClassName: bubbleOptions[config.bubbleStyle]?.className || 'bubble-style-0',
      fontStyle: fontOptions[config.fontStyle]?.style || '',
    });
  },

  // 上传头像
  onUploadAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ 'config.customAvatarUrl': tempFilePath }, () => {
          this.updatePreview();
        });
      }
    });
  },

  // 重置头像
  onResetAvatar() {
    this.setData({ 'config.customAvatarUrl': '' }, () => {
      this.updatePreview();
    });
  },

  // 上传背景
  onUploadBackground() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ 'config.customBackgroundUrl': tempFilePath }, () => {
          this.updatePreview();
        });
      }
    });
  },

  // 重置背景
  onResetBackground() {
    this.setData({ 'config.customBackgroundUrl': '' }, () => {
      this.updatePreview();
    });
  },

  onBubbleSelect(e) {
    const index = e.currentTarget.dataset.index;
    const bubbleClassName = this.data.bubbleOptions[index]?.className || 'bubble-style-0';
    
    // 一次性更新配置和预览，避免多次渲染
    this.setData({
      'config.bubbleStyle': index,
      bubbleClassName: bubbleClassName
    });
  },

  onFontSelect(e) {
    const index = e.currentTarget.dataset.index;
    const fontStyle = this.data.fontOptions[index]?.style || '';
    
    // 一次性更新配置和预览，避免多次渲染
    this.setData({
      'config.fontStyle': index,
      fontStyle: fontStyle
    });
  },

  isLocalTempFile(url) {
    if (!url) return false;
    return url.startsWith('wxfile://') || 
           url.startsWith('http://tmp') ||
           url.startsWith('http://usr');
  },

  async handleSave() {
    if (this.data.saving) return;
    
    this.setData({ saving: true });
    
    try {
      const { config } = this.data;
      let avatarUrl = config.customAvatarUrl;
      let backgroundUrl = config.customBackgroundUrl;
      let avatarStorageKey = config.avatarStorageKey || '';
      let bgStorageKey = config.bgStorageKey || '';
      
      if (avatarUrl && this.isLocalTempFile(avatarUrl)) {
        wx.showLoading({ title: '上传头像中...', mask: true });
        const result = await this.uploadToCloud(avatarUrl, 'avatar');
        avatarUrl = result.url;
        avatarStorageKey = result.storageKey;
      }
      
      if (backgroundUrl && this.isLocalTempFile(backgroundUrl)) {
        wx.showLoading({ title: '上传背景中...', mask: true });
        const result = await this.uploadToCloud(backgroundUrl, 'background');
        backgroundUrl = result.url;
        bgStorageKey = result.storageKey;
      }
      
      wx.hideLoading();
      
      const saveConfig = {
        customAvatarUrl: avatarUrl || '',
        customBackgroundUrl: backgroundUrl || '',
        avatarStorageKey: avatarStorageKey,
        bgStorageKey: bgStorageKey,
        bubbleStyle: config.bubbleStyle,
        fontStyle: config.fontStyle,
      };
      
      await api.updateProfile({ chatDiyConfig: saveConfig });
      
      const app = getApp();
      app.globalData.chatDiyConfig = saveConfig;
      
      this.setData({ config: saveConfig }, () => {
        this.updatePreview();
      });
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      wx.hideLoading();
      console.error('Save failed:', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async uploadToCloud(filePath, type) {
    const request = require('../../utils/request');
    
    console.log('[uploadToCloud] 环境:', request.CURRENT_ENV, '文件:', filePath, '类型:', type);
    
    // 云托管环境：先传云存储，再调 callContainer 获取 URL
    if (request.CURRENT_ENV === 'prod' && request.config.useCloudContainer) {
      try {
        const ext = filePath.split('.').pop() || 'jpg';
        const cloudPath = `diy-${type}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;
        
        const uploadResult = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath,
            config: { env: request.config.env },
            success: res => resolve(res),
            fail: err => reject(err)
          });
        });
        
        const res = await request.post('/users/upload-diy-image', {
          fileID: uploadResult.fileID,
          type: type
        });
        
        if (!res || !res.url) {
          throw new Error(res?.message || '服务端未返回有效 URL');
        }
        
        return { url: res.url, storageKey: res.storageKey || '' };
      } catch (error) {
        console.error('[uploadToCloud] 云上传失败:', error);
        throw new Error('上传失败：' + (error.message || error.errMsg || '未知错误'));
      }
    }
    
    // 本地开发环境：使用 wx.uploadFile (multipart)
    const token = wx.getStorageSync('token');
    const uploadBaseUrl = request.getUploadBaseUrl();
    
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: uploadBaseUrl + '/users/upload-diy-image',
        filePath: filePath,
        name: 'file',
        timeout: 60000,
        header: {
          'Authorization': `Bearer ${token}`
        },
        formData: {
          type: type
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(res.data);
              if (!data.url) {
                reject(new Error(data.message || '服务端未返回有效 URL'));
                return;
              }
              resolve({ url: data.url, storageKey: data.storageKey || '' });
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            let errMsg = '上传失败';
            try {
              const errData = JSON.parse(res.data);
              errMsg = errData.message || errMsg;
            } catch (_) {}
            reject(new Error(errMsg));
          }
        },
        fail: (err) => {
          reject(new Error('文件上传失败：' + (err.errMsg || '网络错误')));
        }
      });
    });
  }
});
