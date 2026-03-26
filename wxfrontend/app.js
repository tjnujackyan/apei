import gulpError from './utils/gulpError';
const api = require('./services/api');
const { config, CURRENT_ENV } = require('./utils/request');

App({
    globalData: {
      chatDiyConfig: null,
    },

    onLaunch() {
      // 初始化云开发环境（仅在云托管模式下）
      // 注意：文件上传现在统一使用后端接口 + 腾讯云 COS，不再使用 wx.cloud.uploadFile
      if (CURRENT_ENV === 'prod' && config.useCloudContainer) {
        wx.cloud.init({
          env: config.env,
          traceUser: true,
        });
      }

      // Check login status and load DIY config
      const token = wx.getStorageSync('token');
      if (token) {
        // 异步加载用户配置（不阻塞启动）
        // token 验证由 splash 页面处理，这里只加载配置
        this.loadDiyConfigSilently();
      }
    },

    /**
     * 静默加载 DIY 配置（不处理错误，由 request.js 自动处理 token 刷新）
     */
    async loadDiyConfigSilently() {
      try {
        await this.loadDiyConfig();
      } catch (err) {
        // 错误由 request.js 的 401 拦截器处理
        // 这里不需要额外操作
        console.log('[App] loadDiyConfig failed, will be handled by request interceptor');
      }
    },

    async loadDiyConfig() {
      try {
        const user = await api.getProfile();
        if (user && user.chatDiyConfig) {
          let config;
          if (typeof user.chatDiyConfig === 'string') {
            config = JSON.parse(user.chatDiyConfig);
          } else {
            config = user.chatDiyConfig;
          }
          this.globalData.chatDiyConfig = config;
        }
      } catch (err) {
        console.error('Load DIY config failed:', err);
        throw err;
      }
    },

    onShow() {
        if (gulpError !== 'gulpErrorPlaceHolder') {
            wx.redirectTo({
                url: `/pages/gulp-error/index?gulpError=${gulpError}`,
            });
        }
    },
});
