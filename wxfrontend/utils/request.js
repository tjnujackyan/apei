/**
 * API 请求封装 - 支持本地开发和微信云托管
 * 包含自动刷新 token 机制
 */

// 环境配置
const ENV_CONFIG = {
  // 本地开发环境
  dev: {
    baseUrl: 'http://localhost:3000',
    useCloudContainer: false,
  },
  // 微信云托管环境
  prod: {
    env: 'prod-7gi6km8h2021af85', // 云环境ID
    serviceName: 'express-wjgp', // 云托管服务名
    publicDomain: 'https://ugwbcmcv.express-wjgp.ct4ysxhi.r9slacz9.com', // 内网域名
    useCloudContainer: true,
  },
};

// 当前环境：'dev' 或 'prod'
const CURRENT_ENV = 'dev'; 

const config = ENV_CONFIG[CURRENT_ENV];

// Token 刷新状态管理
let isRefreshing = false;
let refreshSubscribers = [];
let isRedirecting = false;

/**
 * 添加等待刷新的请求到队列
 */
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

/**
 * 刷新完成后，执行所有等待的请求
 */
const onTokenRefreshed = (newToken) => {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
};

/**
 * 刷新失败，拒绝所有等待的请求
 */
const onRefreshFailed = (error) => {
  refreshSubscribers.forEach((callback) => callback(null, error));
  refreshSubscribers = [];
};

/**
 * 刷新 token
 */
const refreshToken = () => {
  return new Promise((resolve, reject) => {
    const refreshTokenValue = wx.getStorageSync('refreshToken');
    
    if (!refreshTokenValue) {
      reject(new Error('NO_REFRESH_TOKEN'));
      return;
    }

    const doRefresh = (url, method, data, header) => {
      if (config.useCloudContainer) {
        wx.cloud.callContainer({
          config: { env: config.env },
          path: url,
          method: method,
          data: data,
          header: header,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(res);
            }
          },
          fail: reject,
        });
      } else {
        wx.request({
          url: `${config.baseUrl}${url}`,
          method: method,
          data: data,
          header: header,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(res);
            }
          },
          fail: reject,
        });
      }
    };

    doRefresh('/auth/refresh', 'POST', { refreshToken: refreshTokenValue }, {
      'Content-Type': 'application/json',
      'X-WX-SERVICE': config.serviceName || '',
    });
  });
};

/**
 * 处理 token 过期，尝试刷新
 */
const handleTokenExpired = () => {
  return new Promise((resolve, reject) => {
    // 如果已经在刷新中，加入等待队列
    if (isRefreshing) {
      subscribeTokenRefresh((newToken, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(newToken);
        }
      });
      return;
    }

    isRefreshing = true;

    refreshToken()
      .then((res) => {
        // 刷新成功，保存新 token
        wx.setStorageSync('token', res.accessToken);
        wx.setStorageSync('refreshToken', res.refreshToken);
        if (res.user) {
          wx.setStorageSync('user', res.user);
        }
        
        console.log('[Request] Token refreshed successfully');
        
        isRefreshing = false;
        onTokenRefreshed(res.accessToken);
        resolve(res.accessToken);
      })
      .catch((err) => {
        console.error('[Request] Token refresh failed:', err);
        
        isRefreshing = false;
        onRefreshFailed(err);
        
        // 刷新失败，需要重新登录
        forceLogout();
        reject(err);
      });
  });
};

/**
 * 强制登出并跳转到登录页
 */
const forceLogout = () => {
  if (isRedirecting) return;
  
  isRedirecting = true;
  
  // 清除所有认证信息
  wx.removeStorageSync('token');
  wx.removeStorageSync('refreshToken');
  wx.removeStorageSync('user');
  
  wx.showToast({
    title: '登录已过期，请重新登录',
    icon: 'none',
    duration: 2000
  });
  
  setTimeout(() => {
    wx.reLaunch({
      url: '/pages/splash/index',
      complete: () => {
        isRedirecting = false;
      }
    });
  }, 500);
};

/**
 * 本地环境请求（wx.request）
 */
const localRequest = (url, method, data, retryCount = 0) => {
  const token = wx.getStorageSync('token');
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}${url}`,
      method: method,
      data: data,
      timeout: 300000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401 && retryCount === 0) {
          // Token 过期，尝试刷新
          console.log('[Request] 401 received, attempting token refresh...');
          
          handleTokenExpired()
            .then((newToken) => {
              // 用新 token 重试请求
              console.log('[Request] Retrying request with new token...');
              localRequest(url, method, data, 1)
                .then(resolve)
                .catch(reject);
            })
            .catch((err) => {
              reject(new Error('TOKEN_REFRESH_FAILED'));
            });
        } else if (res.statusCode === 401) {
          // 重试后仍然 401，强制登出
          forceLogout();
          reject(new Error('UNAUTHORIZED'));
        } else {
          reject(res);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

/**
 * 云托管环境请求（wx.cloud.callContainer）
 */
const cloudRequest = (url, method, data, retryCount = 0) => {
  const token = wx.getStorageSync('token');
  
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: {
        env: config.env,
      },
      path: url,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'X-WX-SERVICE': config.serviceName,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401 && retryCount === 0) {
          // Token 过期，尝试刷新
          console.log('[Request] 401 received, attempting token refresh...');
          
          handleTokenExpired()
            .then((newToken) => {
              // 用新 token 重试请求
              console.log('[Request] Retrying request with new token...');
              cloudRequest(url, method, data, 1)
                .then(resolve)
                .catch(reject);
            })
            .catch((err) => {
              reject(new Error('TOKEN_REFRESH_FAILED'));
            });
        } else if (res.statusCode === 401) {
          // 重试后仍然 401，强制登出
          forceLogout();
          reject(new Error('UNAUTHORIZED'));
        } else {
          reject(res);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

/**
 * 统一请求入口，根据环境自动选择
 */
const request = (url, method, data) => {
  if (config.useCloudContainer) {
    return cloudRequest(url, method, data);
  }
  return localRequest(url, method, data);
};

module.exports = {
  baseURL: config.baseUrl || '',
  get: (url, params) => {
    // 处理 GET 请求的查询参数
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.entries(params)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      url = queryString ? `${url}?${queryString}` : url;
    }
    return request(url, 'GET');
  },
  post: (url, data) => request(url, 'POST', data),
  put: (url, data) => request(url, 'PUT', data),
  patch: (url, data) => request(url, 'PATCH', data),
  delete: (url) => request(url, 'DELETE'),
  // 获取文件上传的基础URL（云托管用公网域名，本地用baseUrl）
  getUploadBaseUrl: () => {
    if (config.useCloudContainer && config.publicDomain) {
      return config.publicDomain;
    }
    return config.baseUrl || '';
  },
  // 导出环境配置，方便其他地方使用
  ENV_CONFIG,
  CURRENT_ENV,
  config,
  // 导出工具方法
  forceLogout,
  handleTokenExpired,
};
