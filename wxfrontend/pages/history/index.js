const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    historyGroups: [],
    loading: true
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    this.loadHistory();
  },

  async loadHistory() {
    try {
      wx.showLoading({ title: '加载中...' });
      const tasks = await api.getTaskHistory();
      
      // Group tasks by date
      const groups = {};
      tasks.forEach(task => {
        // Use completedAt if available, otherwise taskDate
        const dateObj = task.completedAt ? new Date(task.completedAt) : new Date(task.taskDate);
        const dateStr = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
        
        if (!groups[dateStr]) {
          groups[dateStr] = [];
        }
        
        let statusText = '已完成';
        if (task.status === 'pending') statusText = '待办';
        else if (task.status === 'in_progress') statusText = '进行中';
        else if (task.status === 'skipped') statusText = '已跳过';
        
        let timeText = '';
        if (task.status === 'completed') {
           timeText = `计划 ${task.estimatedMinutes || 30}分钟 · 实际 ${task.actualMinutes || (task.estimatedMinutes || 30)}分钟`;
        } else {
           timeText = `计划 ${task.estimatedMinutes || 30}分钟`;
        }

        groups[dateStr].push({
          id: task.id,
          title: task.title,
          time: timeText,
          status: statusText,
          isCompleted: task.status === 'completed'
        });
      });

      // Convert to array
      const historyGroups = Object.keys(groups).map(date => ({
        date,
        tasks: groups[date]
      }));

      this.setData({ historyGroups, loading: false });
      wx.hideLoading();
    } catch (err) {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});