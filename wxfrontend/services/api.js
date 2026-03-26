const request = require('../utils/request');

// Service API Definitions
// Auth
const login = (payload) => {
  return request.post('/auth/login', payload);
};

const wechatLogin = (code) => {
  return request.post('/auth/wechat/login', { code });
};

const wechatMobileLogin = (code, mobileCode) => {
  return request.post('/auth/wechat/mobile-login', { code, mobileCode });
};

const sendSms = (phoneNumber) => {
  return request.post('/auth/sms', { phoneNumber });
};

// 刷新 token
const refreshToken = (refreshTokenValue) => {
  return request.post('/auth/refresh', { refreshToken: refreshTokenValue });
};

// 登出
const logout = () => {
  return request.post('/auth/logout');
};

// AI Brain
const chat = (messages) => {
  return request.post('/ai-brain/chat', { messages });
};

// AI Agent模式（智能对话 + 工具调用）
const agentChat = (message, history = []) => {
  return request.post('/ai-brain/agent', { message, history });
};

// 获取对话历史记录
const getChatHistory = (limit = 50) => {
  return request.get(`/ai-brain/history?limit=${limit}`);
};

const transcribeAudio = (filePath) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    const uploadBaseUrl = request.getUploadBaseUrl();
    
    wx.uploadFile({
      url: uploadBaseUrl + '/asr/transcribe',
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve(res.data);
          }
        } else {
          reject(new Error(res.data || 'Transcription failed'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

// Wrong Notebook
const getWrongStats = () => {
  return request.get('/wrong-notebook/stats');
};

const getWrongList = () => {
  return request.get('/wrong-notebook');
};

// Users
const getProfile = () => {
  return request.get('/users/me');
};

const updateProfile = (data) => {
  return request.patch('/users/me', data);
};

const updatePhone = (phoneNumber, smsCode) => {
  return request.patch('/users/me/phone', { phoneNumber, smsCode });
};

// Plan
const generatePlan = (days, subject) => {
  return request.post('/ai-brain/plan', { days, subject });
};

// Import & Question Sets

/**
 * 上传文件到云托管对象存储
 * @deprecated 已废弃 - 现在统一使用后端接口上传到腾讯云 COS
 * @param {string} filePath 本地文件路径
 * @param {string} cloudPath 云存储路径
 * @param {function} onProgress 进度回调
 * @returns {Promise<string>} fileID
 */
// const uploadToCloudStorage = (filePath, cloudPath, onProgress = () => {}) => {
//   return new Promise((resolve, reject) => {
//     // 检查是否在云托管环境
//     if (request.CURRENT_ENV !== 'prod' || !request.config.useCloudContainer) {
//       // 本地开发环境，返回本地路径作为标识
//       resolve(filePath);
//       return;
//     }
//     
//     const task = wx.cloud.uploadFile({
//       cloudPath: cloudPath,
//       filePath: filePath,
//       config: {
//         env: request.config.env
//       },
//       success: res => resolve(res.fileID),
//       fail: err => {
//         const info = err.toString();
//         if (info.indexOf('abort') !== -1) {
//           reject(new Error('文件上传已中断'));
//         } else {
//           reject(new Error('文件上传失败：' + (err.errMsg || '网络错误')));
//         }
//       }
//     });
//     
//     if (task && task.onProgressUpdate) {
//       task.onProgressUpdate((res) => {
//         if (onProgress(res) === false) {
//           task.abort();
//         }
//       });
//     }
//   });
// };

/**
 * 上传导入文件
 * 云托管环境：读取文件为 base64，通过 callContainer 发送
 * 本地环境：使用 wx.uploadFile
 */
const uploadImportFile = async (filePath, formData) => {
  console.log('[uploadImportFile] 环境检查:', {
    CURRENT_ENV: request.CURRENT_ENV,
    useCloudContainer: request.config.useCloudContainer,
    filePath: filePath,
    formData: formData
  });
  
  // 云托管环境：先上传文件到云存储，再调用 callContainer
  if (request.CURRENT_ENV === 'prod' && request.config.useCloudContainer) {
    console.log('[uploadImportFile] 使用云存储 + callContainer 方式');
    try {
      // 1. 先上传文件到微信云托管对象存储
      const cloudPath = `imports/${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${formData.filename}`;
      console.log('[uploadImportFile] 开始上传到云存储:', cloudPath);
      
      const uploadResult = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath,
          config: {
            env: request.config.env
          },
          success: res => {
            console.log('[uploadImportFile] 云存储上传成功:', res.fileID);
            resolve(res);
          },
          fail: err => {
            console.error('[uploadImportFile] 云存储上传失败:', err);
            reject(err);
          }
        });
      });
      
      // 2. 调用后端接口，传递 fileID
      console.log('[uploadImportFile] 开始调用 callContainer...');
      const result = await request.post('/imports', {
        fileID: uploadResult.fileID,
        filename: formData.filename,
        questionSetTitle: formData.questionSetTitle,
        subject: formData.subject
      });
      console.log('[uploadImportFile] callContainer 调用成功:', result);
      return result;
    } catch (error) {
      console.error('[uploadImportFile] 上传失败:', error);
      console.error('[uploadImportFile] 错误详情:', JSON.stringify(error));
      throw new Error('文件上传失败：' + (error.message || error.errMsg || '未知错误'));
    }
  }
  
  // 本地环境：使用 wx.uploadFile
  const token = wx.getStorageSync('token');
  const uploadBaseUrl = request.getUploadBaseUrl();
  
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: uploadBaseUrl + '/imports',
      filePath: filePath,
      name: 'file',
      timeout: 300000,
      header: {
        'Authorization': `Bearer ${token}`
      },
      formData: formData,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve(res.data);
          }
        } else {
          console.error('Upload failed:', res);
          reject(new Error(res.data || 'Upload failed'));
        }
      },
      fail: (err) => {
        console.error('Upload file failed:', err);
        reject(new Error('文件上传失败：' + (err.errMsg || '网络错误')));
      }
    });
  });
};

/**
 * 智能生成题目
 * 云托管环境：读取文件为 base64，通过 callContainer 发送
 * 本地环境：使用 wx.uploadFile
 */
const generateSmartQuestions = async (filePath, formData) => {
  console.log('[generateSmartQuestions] 环境检查:', {
    CURRENT_ENV: request.CURRENT_ENV,
    useCloudContainer: request.config.useCloudContainer,
    filePath: filePath,
    formData: formData
  });
  
  // 云托管环境：先上传文件到云存储，再调用 callContainer
  if (request.CURRENT_ENV === 'prod' && request.config.useCloudContainer) {
    console.log('[generateSmartQuestions] 使用云存储 + callContainer 方式');
    try {
      // 1. 先上传文件到微信云托管对象存储
      const cloudPath = `imports/${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${formData.filename}`;
      console.log('[generateSmartQuestions] 开始上传到云存储:', cloudPath);
      
      const uploadResult = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath,
          config: {
            env: request.config.env
          },
          success: res => {
            console.log('[generateSmartQuestions] 云存储上传成功:', res.fileID);
            resolve(res);
          },
          fail: err => {
            console.error('[generateSmartQuestions] 云存储上传失败:', err);
            reject(err);
          }
        });
      });
      
      // 2. 调用后端接口，传递 fileID
      console.log('[generateSmartQuestions] 开始调用 callContainer...');
      const result = await request.post('/imports/generate-smart', {
        fileID: uploadResult.fileID,
        filename: formData.filename,
        questionSetTitle: formData.questionSetTitle,
        subject: formData.subject,
        count: formData.count,
        types: formData.types,
        difficulty: formData.difficulty
      });
      console.log('[generateSmartQuestions] callContainer 调用成功:', result);
      return result;
    } catch (error) {
      console.error('[generateSmartQuestions] 生成失败:', error);
      console.error('[generateSmartQuestions] 错误详情:', JSON.stringify(error));
      throw new Error('生成失败：' + (error.message || error.errMsg || '未知错误'));
    }
  }
  
  // 本地环境：使用 wx.uploadFile
  const token = wx.getStorageSync('token');
  const uploadBaseUrl = request.getUploadBaseUrl();
  
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: uploadBaseUrl + '/imports/generate-smart',
      filePath: filePath,
      name: 'file',
      timeout: 300000,
      header: {
        'Authorization': `Bearer ${token}`
      },
      formData: formData,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve(res.data);
          }
        } else {
          console.error('Generation failed:', res);
          reject(new Error(res.data || 'Generation failed'));
        }
      },
      fail: (err) => {
        console.error('Upload file failed:', err);
        reject(new Error('文件上传失败：' + (err.errMsg || '网络错误')));
      }
    });
  });
};

const getImportJobs = () => request.get('/imports');
const getImportJobStatus = (jobId) => request.get(`/imports/${jobId}/status`);
const getQuestionSets = () => request.get('/question-sets');
const deleteQuestionSet = (id) => request.delete(`/question-sets/${id}`);
const getQuestionSetStats = (setId) => request.get(`/question-sets/${setId}/stats`);
const getQuestions = (setId) => request.get(`/question-sets/${setId}/questions`);

// Practice
const createPracticeSession = (questionSetId, questionIds) => {
  return request.post('/practice/sessions', { questionSetId, questionIds });
};

const getSession = (sessionId) => {
  return request.get(`/practice/sessions/${sessionId}`);
};

const submitAnswer = (sessionId, questionId, isCorrect, timeSpentSeconds, answerPayload) => {
  return request.post(`/practice/sessions/${sessionId}/answers`, {
    questionId,
    isCorrect,
    timeSpentSeconds,
    answerPayload
  });
};

const completeSession = (sessionId) => {
  return request.post(`/practice/sessions/${sessionId}/complete`);
};

// TTS
const synthesize = (text, referenceText = '', emotion = '') => {
  return request.post('/tts/synthesize', { text, referenceText, emotion });
};

// Knowledge Points
const getKnowledgePointTree = (subjectCode) => {
  return request.get('/knowledge-points/tree', { subjectCode });
};

const getKnowledgePoints = (params) => {
  return request.get('/knowledge-points', params);
};

const createKnowledgePoint = (data) => {
  return request.post('/knowledge-points', data);
};

const initKnowledgePointsSeed = () => {
  return request.post('/knowledge-points/seed');
};

const getWrongQuestionTree = () => {
  return request.get('/wrong-notebook/tree');
};

const getWrongsByKnowledgePoint = (kpId) => {
  return request.get(`/wrong-notebook/by-knowledge-point/${kpId}`);
};

// Study Plans
const getTodayTasks = () => {
  return request.get('/study-plans/tasks/today');
};

const updateTaskStatus = (taskId, status, actualMinutes, metadata) => {
  return request.put(`/study-plans/tasks/${taskId}/status`, {
    status,
    actualMinutes,
    metadata
  });
};

const createTask = (title, estimatedMinutes) => {
  return request.post('/study-plans/tasks', { title, estimatedMinutes });
};

const deleteTask = (taskId) => {
  return request.delete(`/study-plans/tasks/${taskId}`);
};

const getStudyPlans = () => {
  return request.get('/study-plans');
};

const createStudyPlan = (data) => {
  return request.post('/study-plans', data);
};

const getTaskStats = (startDate, endDate) => {
  return request.get('/study-plans/stats/summary', { startDate, endDate });
};

const getWeeklyStats = () => {
  return request.get('/study-plans/stats/weekly');
};

const getTaskHistory = () => {
  return request.get('/study-plans/history');
};

// 更新语音消息状态（TTS成功后调用）
const updateVoiceStatus = (audioUrl, duration) => {
  return request.post('/ai-brain/voice-status', { audioUrl, duration });
};

// Smart Review (智能复习)
const getSmartReviewStatus = () => {
  return request.get('/smart-review/status');
};

const generateSmartReviewQuiz = (options = {}) => {
  return request.post('/smart-review/generate', options);
};

const transformQuestion = (questionId) => {
  return request.post('/smart-review/transform', { questionId });
};

const getKnowledgeState = (level) => {
  const params = level ? { level } : {};
  return request.get('/smart-review/knowledge-state', params);
};

// 迁移知识点（将 knowledgeTags 转换为 knowledgePointIds）
const migrateKnowledgePoints = () => {
  return request.post('/question-sets/migrate-knowledge-points');
};

module.exports = {
  login,
  wechatLogin,
  wechatMobileLogin,
  sendSms,
  refreshToken,
  logout,
  chat,
  agentChat,
  getChatHistory,
  updateVoiceStatus,
  getWrongStats,
  getWrongList,
  getProfile,
  updateProfile,
  updatePhone,
  generatePlan,
  synthesize,
  uploadImportFile,
  generateSmartQuestions,
  getImportJobs,
  getImportJobStatus,
  getQuestionSets,
  deleteQuestionSet,
  getQuestionSetStats,
  getQuestions,
  createPracticeSession,
  getSession,
  submitAnswer,
  completeSession,
  getKnowledgePointTree,
  getKnowledgePoints,
  createKnowledgePoint,
  initKnowledgePointsSeed,
  getWrongQuestionTree,
  getWrongsByKnowledgePoint,
  getWrongQuestionSets: () => request.get('/wrong-notebook/sets'),
  getWrongsByQuestionSet: (id) => request.get(`/wrong-notebook/by-set/${id}`),
  getTodayWrongs: () => request.get('/wrong-notebook/today'),
  getTodayTasks,
  updateTaskStatus,
  createTask,
  deleteTask,
  getStudyPlans,
  createStudyPlan,
  getTaskStats,
  getWeeklyStats,
  getTaskHistory,
  transcribeAudio,
  // Smart Review (智能复习)
  getSmartReviewStatus,
  generateSmartReviewQuiz,
  transformQuestion,
  getKnowledgeState,
  migrateKnowledgePoints,
  // 辅助方法
  getBaseUrl: () => request.getUploadBaseUrl ? request.getUploadBaseUrl() : (request.baseURL || 'http://localhost:3000'),
  CURRENT_ENV: request.CURRENT_ENV,
  config: request.config,
};
