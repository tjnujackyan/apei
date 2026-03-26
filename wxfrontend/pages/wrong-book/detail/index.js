const api = require('../../../services/api');

Page({
  data: {
    kpId: '',
    questionSetId: '',
    titleName: '',
    questions: [],
    loading: true,
    paddingTop: 0
  },

  onLoad(options) {
    // 获取状态栏高度
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });

    const { id, questionSetId, name, mode } = options;
    const decodedName = decodeURIComponent(name || '');
    
    this.setData({
      kpId: id || '',
      questionSetId: questionSetId || '',
      titleName: decodedName
    });
    
    if (decodedName) {
      wx.setNavigationBarTitle({
        title: decodedName
      });
    }

    if (mode === 'today') {
      this.loadTodayWrongs();
    } else if (questionSetId) {
      this.loadQuestionsBySet(questionSetId);
    } else if (id) {
      this.loadQuestionsByKp(id);
    }
  },

  async loadTodayWrongs() {
    try {
      this.setData({ loading: true });
      const res = await api.getTodayWrongs();
      const formattedQuestions = this.processQuestions(res);
      this.setData({ 
        questions: formattedQuestions,
        loading: false 
      });
    } catch (err) {
      console.error(err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  async loadQuestionsBySet(setId) {
    try {
      this.setData({ loading: true });
      const res = await api.getWrongsByQuestionSet(setId);
      const formattedQuestions = this.processQuestions(res);
      this.setData({ 
        questions: formattedQuestions,
        loading: false 
      });
    } catch (err) {
      console.error(err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  async loadQuestionsByKp(kpId) {
    try {
      this.setData({ loading: true });
      const res = await api.getWrongsByKnowledgePoint(kpId);
      const formattedQuestions = this.processQuestions(res);
      this.setData({ 
        questions: formattedQuestions,
        loading: false 
      });
    } catch (err) {
      console.error(err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  processQuestions(res) {
    console.log('processQuestions input:', res);
    return res.map(item => {
      let lastAnswer = null;
      if (item.lastAnswer) {
        try {
          lastAnswer = JSON.parse(item.lastAnswer);
        } catch (e) {
          lastAnswer = item.lastAnswer;
        }
      }

      // Ensure options is an array if it's not already
      let options = [];
      if (item.question && item.question.options) {
        options = item.question.options;
        if (typeof options === 'string') {
          try {
            options = JSON.parse(options);
          } catch (e) {
            options = [];
          }
        }
      }

      // Handle missing question data gracefully
      const questionData = item.question ? {
        ...item.question,
        options: options || []
      } : {
        stem: '题目数据丢失或已被删除 (ID: ' + (item.questionId || '未知') + ')',
        options: [],
        type: 'single', // default to prevent layout errors
        answerExplanation: '无解析'
      };

      const processedItem = {
        ...item,
        question: questionData,
        lastAnswer,
        updatedAtFormatted: this.formatDate(item.updatedAt)
      };
      
      console.log('Processed item:', processedItem);
      return processedItem;
    });
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours();
    const min = date.getMinutes();
    return `${m}月${d}日 ${h}:${min < 10 ? '0' + min : min}`;
  }
});