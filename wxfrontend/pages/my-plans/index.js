const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    loading: true,
    plans: [],
    todayTasks: [],
    stats: null
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
      const [plans, todayTasks, stats] = await Promise.all([
        api.getStudyPlans(),
        api.getTodayTasks(),
        api.getWeeklyStats().catch(() => null)
      ]);
      
      this.setData({
        plans: plans || [],
        todayTasks: todayTasks || [],
        stats,
        loading: false
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  handleBack() {
    wx.navigateBack();
  },

  handleCreatePlan() {
    // TODO: 导航到创建计划页面
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  async handleCompleteTask(e) {
    const { taskId } = e.currentTarget.dataset;
    try {
      await api.updateTaskStatus(taskId, 'completed');
      wx.showToast({ title: '完成', icon: 'success' });
      this.loadData();
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  getStatusText(status) {
    const map = {
      pending: '待开始',
      in_progress: '进行中',
      completed: '已完成',
      skipped: '已跳过'
    };
    return map[status] || status;
  }
});
