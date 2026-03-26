const api = require('../../services/api');
import Message from 'tdesign-miniprogram/message/index';

Page({
  data: {
    title: '',
    subject: '',
    file: null,
    loading: false,
    paddingTop: 0,
    currentTab: 1, // Default to Smart Generate
    questionCount: 20, // Default to 20 as in design
    questionTypes: ['single', 'multiple', 'true_false'],
    difficulty: 2, // Default to Medium (2) as in design
    
    // 进度相关
    showProgress: false,
    progressStage: '',
    progressCurrentStep: 0,
    progressTotalSteps: 2,
    progressStepName: '',
    progressMessage: '',
    jobId: null,
  },
  
  pollingTimer: null,

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },
  
  onUnload() {
    this.stopPolling();
  },
  
  /**
   * 开始轮询任务状态
   */
  startPolling(jobId) {
    this.stopPolling(); // 先清除旧的定时器
    
    const poll = async () => {
      if (!this.data.jobId) {
        this.stopPolling();
        return;
      }
      
      try {
        const status = await api.getImportJobStatus(this.data.jobId);
        this.handleProgressUpdate(status);
        
        // 如果任务完成或失败，停止轮询
        if (status.status === 'completed' || status.status === 'failed') {
          this.stopPolling();
        }
      } catch (err) {
        console.error('Polling error:', err);
        // 继续轮询
      }
    };
    
    // 立即执行一次
    poll();
    
    // 每2秒轮询一次
    this.pollingTimer = setInterval(poll, 2000);
    
    console.log('Started polling for job:', jobId);
  },
  
  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('Stopped polling');
    }
  },
  
  /**
   * 处理进度更新
   */
  handleProgressUpdate(status) {
    console.log('Status update:', status);
    
    // 步骤图标已在 wxml 中通过 t-icon 组件渲染
    const stepIcons = {
      1: '',  // 导入识别
      2: '',  // 生题处理
    };
    
    // 构建步骤显示文本
    let stepDisplay = '';
    if (status.currentStep && status.totalSteps) {
      stepDisplay = `步骤 ${status.currentStep}/${status.totalSteps}: ${status.stepName || '处理中'}`;
    }
    
    this.setData({
      progressStage: stepDisplay || status.message,
      progressCurrentStep: status.currentStep || 0,
      progressTotalSteps: status.totalSteps || 2,
      progressStepName: status.stepName || '',
      progressMessage: status.message || '处理中...',
      // 不再使用 progressPercent
    });
    
    // 如果完成或失败，关闭loading
    if (status.status === 'completed') {
      this.setData({ 
        loading: false,
        showProgress: false 
      });
      
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 2000,
        content: `导入成功！共 ${status.succeededQuestions || 0} 道题目`,
      });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    } else if (status.status === 'failed') {
      this.setData({ 
        loading: false,
        showProgress: false 
      });
      
      Message.error({
        context: this,
        offset: [20, 32],
        duration: 3000,
        content: '导入失败：' + (status.message || '未知错误'),
      });
    }
  },

  switchTab(e) {
    this.setData({ currentTab: parseInt(e.currentTarget.dataset.tab) });
  },

  toggleType(e) {
    const type = e.currentTarget.dataset.type;
    const { questionTypes } = this.data;
    const index = questionTypes.indexOf(type);
    if (index > -1) {
      questionTypes.splice(index, 1);
    } else {
      questionTypes.push(type);
    }
    this.setData({ questionTypes });
  },

  onCountChange(e) {
    this.setData({ questionCount: e.detail.value });
  },

  onTypesChange(e) {
    this.setData({ questionTypes: e.detail.value });
  },

  onDifficultyChange(e) {
    this.setData({ difficulty: e.detail.value });
  },

  onTitleChange(e) {
    this.setData({ title: e.detail.value });
  },

  onSubjectChange(e) {
    this.setData({ subject: e.detail.value });
  },

  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['docx', 'pdf'],
      success: (res) => {
        const file = res.tempFiles[0];
        // Validate extension
        if (!file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
            Message.error({
                context: this,
                offset: [20, 32],
                duration: 3000,
                content: '仅支持 docx 或 pdf 文件',
            });
            return;
        }
        this.setData({ file: file });
      },
      fail: (err) => {
          console.error('Choose file failed', err);
      }
    });
  },

  onRemoveFile() {
      this.setData({ file: null });
  },

  async onSubmit() {
    if (!this.data.title || !this.data.subject || !this.data.file) {
      Message.error({
        context: this,
        offset: [20, 32],
        duration: 3000,
        content: '请填写完整信息并上传文件',
      });
      return;
    }

    if (this.data.currentTab == 1 && this.data.questionTypes.length === 0) {
        Message.error({
            context: this,
            offset: [20, 32],
            duration: 3000,
            content: '请至少选择一种题目类型',
        });
        return;
    }

    this.setData({ 
      loading: true,
      showProgress: true,
      progressStage: '准备中',
      progressPercent: 0,
      progressMessage: '正在提交任务...'
    });
    
    try {
      let result;
      
      if (this.data.currentTab == 0) {
        const formData = {
          questionSetTitle: this.data.title,
          subject: this.data.subject,
          filename: this.data.file.name
        };
        result = await api.uploadImportFile(this.data.file.path, formData);
      } else {
        const formData = {
          questionSetTitle: this.data.title,
          subject: this.data.subject,
          filename: this.data.file.name,
          count: this.data.questionCount,
          types: this.data.questionTypes.join(','),
          difficulty: this.data.difficulty
        };
        result = await api.generateSmartQuestions(this.data.file.path, formData);
      }
      
      // 保存job ID并开始轮询
      if (result && result.id) {
        this.setData({ jobId: result.id });
        
        Message.success({
          context: this,
          offset: [20, 32],
          duration: 2000,
          content: '任务已提交，正在处理...',
        });
        
        // 开始轮询任务状态
        this.startPolling(result.id);
      }
      
      // 如果3分钟后还没完成，提示用户可以离开
      setTimeout(() => {
        if (this.data.loading && this.data.showProgress) {
          Message.info({
            context: this,
            offset: [20, 32],
            duration: 5000,
            content: '处理时间较长，您可以先返回，完成后会在历史记录中显示',
          });
        }
      }, 180000);
      
    } catch (err) {
      console.error(err);
      this.setData({ 
        loading: false,
        showProgress: false 
      });
      
      Message.error({
        context: this,
        offset: [20, 32],
        duration: 3000,
        content: (this.data.currentTab == 0 ? '导入失败：' : '生成失败：') + (err.message || '未知错误'),
      });
    }
  }
});