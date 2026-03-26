const api = require('../../../services/api');
import Message from 'tdesign-miniprogram/message/index';

Page({
  data: {
    paddingTop: 0,
    setId: '',
    stats: {
      set: {},
      lastSession: null,
      history: []
    },
    icon: 'books',
    avgAccuracy: 0,
    loading: true
  },

  onLoad(options) {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });

    if (options.id) {
      this.setData({ setId: options.id });
      this.loadStats(options.id);
    }
  },

  onShow() {
    // Reload stats when returning from practice
    if (this.data.setId) {
      this.loadStats(this.data.setId);
    }
  },

  async loadStats(setId) {
    this.setData({ loading: true });
    try {
      const res = await api.getQuestionSetStats(setId);
      
      // Calculate Average Accuracy
      let avg = 0;
      if (res.history && res.history.length > 0) {
        const total = res.history.reduce((sum, item) => sum + item.accuracy, 0);
        avg = Math.round(total / res.history.length);
      }

      // Format Dates
      if (res.lastSession) {
        res.lastSession.formattedDate = this.formatDate(res.lastSession.updatedAt);
      }
      if (res.history) {
        res.history.forEach(item => {
          item.formattedDate = this.formatDate(item.date);
        });
      }

      this.setData({
        stats: res,
        avgAccuracy: avg,
        icon: this.getIconForSubject(res.set.subject)
      });
    } catch (err) {
      console.error('Failed to load stats', err);
      Message.error({
        context: this,
        offset: [20, 32],
        duration: 3000,
        content: '加载详情失败',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRestart() {
    // Start new session
    wx.navigateTo({
      url: `/pages/practice/index?mode=set&id=${this.data.setId}&title=${encodeURIComponent(this.data.stats.set.title)}`
    });
  },

  onContinue() {
    if (this.data.stats.lastSession && this.data.stats.lastSession.status === 'active') {
      // Pass sessionId to resume
      wx.navigateTo({
        url: `/pages/practice/index?mode=resume&sessionId=${this.data.stats.lastSession.id}&title=${encodeURIComponent(this.data.stats.set.title)}`
      });
    } else {
      this.onRestart();
    }
  },

  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  getIconForSubject(subject) {
    if (!subject) return 'books';
    if (subject.includes('政治')) return 'city';
    if (subject.includes('英语')) return 'earth';
    if (subject.includes('数学')) return 'calculation';
    if (subject.includes('数据结构')) return 'laptop';
    if (subject.includes('操作系统')) return 'desktop';
    if (subject.includes('网络')) return 'internet';
    return 'books';
  }
});