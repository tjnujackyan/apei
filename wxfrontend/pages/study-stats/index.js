const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    loading: true,
    
    // 统计数据
    weeklyStats: null,
    taskStats: null,
    wrongStats: null,
    
    // 时间范围
    dateRange: 'week', // week, month, all
    
    // 历史记录
    history: []
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [weeklyStats, wrongStats, history] = await Promise.all([
        api.getWeeklyStats().catch(() => null),
        api.getWrongStats().catch(() => null),
        api.getTaskHistory().catch(() => [])
      ]);
      
      this.setData({
        weeklyStats,
        wrongStats,
        history: history || [],
        loading: false
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
    }
  },

  handleBack() {
    wx.navigateBack();
  },

  switchRange(e) {
    const { range } = e.currentTarget.dataset;
    this.setData({ dateRange: range });
    // TODO: 根据范围重新加载数据
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
});
