const api = require('../../services/api');

Page({
  data: {
    greeting: '你好',
    currentDate: '',
    todayProgress: 0,
    todayProgressPercent: 0,
    tasks: [],
    loading: true,
    paddingTop: 0,
    daysLeft: 186,
    targetSchool: '清华大学',
    targetMajor: '计算机科学',
    // 智能复习相关
    smartReviewCount: 0,
    smartReviewDesc: '根据薄弱点智能推荐复习题目',
  },

  onLoad() {
    this.startX = 0; // Touch start X coordinate
    this.updateGreeting();
    this.updateDate();
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    const token = wx.getStorageSync('token');
    const user = wx.getStorageSync('user');
    if (!token) {
      wx.reLaunch({ url: '/pages/splash/index' });
      return;
    }
    if (!user || !user.targetSchool) {
      wx.reLaunch({ url: '/pages/onboarding/index' });
      return;
    }

    if (user) {
      this.setData({
        targetSchool: user.targetSchool || '目标院校',
        targetMajor: user.targetMajor || '目标专业'
      });
    }
  },

  onShow() {
    this.getTabBar().init();
    this.loadData();
    this.loadSmartReviewStatus();
  },

  updateGreeting() {
    const { text, greetingIcon } = this.getGreetingData();
    this.setData({ greeting: text, greetingIcon });
  },

  getGreetingData() {
    const hour = new Date().getHours();
    let text = '你好';
    let greetingIcon = 'sunny';
    
    if (hour < 5) {
      text = '晚上好';
      greetingIcon = 'moon';
    } else if (hour < 9) {
      text = '早上好';
      greetingIcon = 'sunny';
    } else if (hour < 12) {
        text = '上午好';
        greetingIcon = 'sunny';
      }
    else if (hour < 13) {
      text = '中午好';
      greetingIcon = 'sunny';
    } else if (hour < 18) {
      text = '下午好';
      greetingIcon = 'cloud';
    } else {
      text = '晚上好';
      greetingIcon = 'moon';
    }
    return { text, greetingIcon };
  },

  updateDate() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekDay = weekDays[now.getDay()];
    
    // Calculate days left until 2026-12-20
    const targetDate = new Date(2026, 11, 20); // Month is 0-indexed (11 is December)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = targetDate - today;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    this.setData({
      currentDate: `${weekDay} · ${month}月${date}日`,
      daysLeft: daysLeft > 0 ? daysLeft : 0
    });
  },

  onGoToQuestionBank() {
    wx.navigateTo({ url: '/pages/question-bank/index' });
  },

  onGoToTodayWrongs() {
    wx.navigateTo({
      url: '/pages/wrong-book/detail/index?mode=today&name=今日错题'
    });
  },

  // 加载智能复习状态
  async loadSmartReviewStatus() {
    try {
      const status = await api.getSmartReviewStatus();
      let desc = '根据薄弱点智能推荐复习题目';
      
      if (status.hasWeakness && status.hasNewKnowledge) {
        desc = `${status.weaknessCount}个薄弱点 · ${status.newKnowledgeCount}个新知识`;
      } else if (status.hasWeakness) {
        desc = `${status.weaknessCount}个薄弱知识点需要复习`;
      } else if (status.hasNewKnowledge) {
        desc = `${status.newKnowledgeCount}个新学知识待巩固`;
      } else {
        desc = '暂无需要复习的内容';
      }

      this.setData({
        smartReviewCount: status.suggestedReviewCount || 0,
        smartReviewDesc: desc,
      });
    } catch (err) {
      console.error('Load smart review status failed:', err);
      // 静默失败，不影响主流程
    }
  },

  // 跳转到智能复习页面
  onGoToSmartReview() {
    wx.navigateTo({
      url: '/pages/smart-review/index'
    });
  },

  async loadData() {
    try {
      // 先检查 token 是否存在
      const token = wx.getStorageSync('token');
      if (!token) {
        wx.reLaunch({ url: '/pages/splash/index' });
        return;
      }

      const profile = await api.getProfile();
      if (profile) {
        let greetingName = '同学';
        if (profile.displayName) greetingName = profile.displayName;
        else if (profile.nickname) greetingName = profile.nickname;
        
        const { text, greetingIcon } = this.getGreetingData();
        this.setData({ 
          greeting: `${text}, ${greetingName}`,
          greetingIcon,
          targetSchool: profile.targetSchool || this.data.targetSchool,
          targetMajor: profile.targetMajor || this.data.targetMajor
        });
      }

      // 获取今日任务
      let tasks = [];
      try {
        const todayTasks = await api.getTodayTasks();
        if (todayTasks && todayTasks.length > 0) {
          tasks = todayTasks.map((t) => {
            // 图标逻辑：优先取标题第一个字，如果是英文则取首字母大写
            const title = t.title || '';
            let icon = '学';
            
            if (title && title.length > 0) {
              const firstChar = title.trim().charAt(0);
              // 判断是否为中文字符
              if (/[\u4e00-\u9fa5]/.test(firstChar)) {
                icon = firstChar;
              } else {
                icon = firstChar.toUpperCase();
              }
            }
            
            return {
              id: t.id,
              title: t.title,
              estimatedMinutes: t.estimatedMinutes || 30,
              actualMinutes: t.actualMinutes || 0,
              time: t.status === 'completed' 
                ? `计划 ${t.estimatedMinutes || 30}分钟 · 实际 ${t.actualMinutes || (t.estimatedMinutes || 30)}分钟`
                : `计划 ${t.estimatedMinutes || 30}分钟 · 进行中`,
              icon: icon,
              status: t.status,
              completed: t.status === 'completed',
              txtStyle: 'left:0px',
              showDelete: false
            };
          });
        }
      } catch (err) {
        console.error('Load tasks failed:', err);
      }

      // 获取历史数据并绘制图表
      this.loadHistoryData();

      // 计算今日进度
      const completedCount = tasks.filter(t => t.completed).length;
      const todayProgress = tasks.length > 0 ? completedCount / tasks.length : 0;
      const todayProgressPercent = Math.round(todayProgress * 100);

      this.setData({
        tasks,
        todayProgress,
        todayProgressPercent,
        loading: false,
      });
    } catch (err) {
      console.error('Load data failed:', err);
      this.setData({ loading: false });
      
      // 如果是认证错误，request.js 已经处理了跳转
      // 这里只处理其他类型的错误
      if (err.message && !err.message.includes('未授权')) {
        wx.showToast({
          title: '加载数据失败',
          icon: 'none',
          duration: 2000
        });
      }
    }
  },

  async loadHistoryData() {
    try {
      const stats = await api.getWeeklyStats();
      if (stats && stats.length > 0) {
        this.drawChart(stats);
      } else {
        // Handle empty or failed data with default zero-data
        const defaultData = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          defaultData.push({
            date: d.toISOString().split('T')[0],
            count: 0
          });
        }
        this.drawChart(defaultData);
      }
    } catch (err) {
      console.error('Load history stats failed:', err);
      // Draw empty chart on error too
      const defaultData = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        defaultData.push({
          date: d.toISOString().split('T')[0],
          count: 0
        });
      }
      this.drawChart(defaultData);
    }
  },

  drawChart(data) {
    const query = wx.createSelectorQuery();
    query.select('#historyChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');

        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        const width = res[0].width;
        const height = res[0].height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Chart configuration
        const padding = 24; // Increased padding for labels
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        const maxCount = Math.max(...data.map(d => d.count), 5); // Minimum max scale is 5
        const stepX = chartWidth / (data.length - 1);
        const stepY = chartHeight / maxCount;

        // Draw Y-axis Grid & Labels
        ctx.fillStyle = '#E5E5E5'; // Grid line color
        ctx.strokeStyle = '#E5E5E5';
        ctx.lineWidth = 1;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
          const value = Math.round((maxCount / ySteps) * i);
          const y = height - padding - (value * stepY);
          
          // Draw Grid Line
          ctx.beginPath();
          ctx.moveTo(padding, y);
          ctx.lineTo(width - padding, y);
          ctx.stroke();

          // Draw Label
          ctx.fillStyle = '#86868B';
          ctx.fillText(value.toString(), padding - 6, y);
        }

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = '#10A37F';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        data.forEach((item, index) => {
          const x = padding + index * stepX;
          const y = height - padding - (item.count * stepY);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();

        // Draw Gradient Area
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        data.forEach((item, index) => {
          const x = padding + index * stepX;
          const y = height - padding - (item.count * stepY);
          ctx.lineTo(x, y);
        });
        ctx.lineTo(width - padding, height - padding);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(16, 163, 127, 0.2)');
        gradient.addColorStop(1, 'rgba(16, 163, 127, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw Points
        data.forEach((item, index) => {
          const x = padding + index * stepX;
          const y = height - padding - (item.count * stepY);
          
          ctx.beginPath();
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#10A37F';
          ctx.lineWidth = 2;
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw Date Labels
          ctx.fillStyle = '#86868B';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          const date = new Date(item.date);
          const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
          ctx.fillText(dateStr, x, height - 5);
        });
      });
  },

  onViewHistory() {
    wx.navigateTo({ url: '/pages/history/index' }); // Navigate to history page
  },

  async onAddTask() {
    const _this = this;
    wx.showModal({
      title: '添加新任务',
      editable: true,
      placeholderText: '请输入任务名称',
      success: async (res) => {
        if (res.confirm && res.content) {
          const title = res.content.trim();
          if (!title) return;

          // Ask for estimated minutes
          wx.showModal({
            title: '预计用时（分钟）',
            editable: true,
            placeholderText: '30',
            content: '30', // Default value in content doesn't work for editable, but placeholder does
            success: async (timeRes) => {
              if (timeRes.confirm) {
                let minutes = parseInt(timeRes.content);
                if (isNaN(minutes) || minutes <= 0) minutes = 30;

                wx.showLoading({ title: '添加中...' });
                try {
                  await api.createTask(title, minutes);
                  wx.showToast({ title: '添加成功', icon: 'success' });
                  _this.loadData(); // 重新加载列表
                } catch (err) {
                  console.error(err);
                  wx.hideLoading();
                  wx.showToast({ title: '添加失败', icon: 'none' });
                }
              }
            }
          });
        }
      }
    });
  },

  async onCompleteTask(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id.startsWith('temp-')) {
      wx.showToast({ title: '请先保存计划', icon: 'none' });
      return;
    }

    try {
      const updatedTask = await api.updateTaskStatus(id, 'completed');
      wx.showToast({ title: '任务已完成', icon: 'success' });
      
      // Close swipe
      const tasks = this.data.tasks.map(t => {
        if (t.id === id) {
          const actualMinutes = updatedTask.actualMinutes || 0;
          const estimatedMinutes = updatedTask.estimatedMinutes || 30;
          const timeText = `计划 ${estimatedMinutes}分钟 · 实际 ${actualMinutes}分钟`;

          return { 
            ...t, 
            status: 'completed', 
            completed: true, 
            actualMinutes: actualMinutes,
            time: timeText,
            txtStyle: 'left:0px', 
            showDelete: false 
          };
        }
        return t;
      });
      this.setData({ tasks });
      
      // Reload history chart to reflect new completion
      this.loadHistoryData();
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onDeleteTask(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id.startsWith('temp-')) {
      wx.showToast({ title: '请先保存计划', icon: 'none' });
      return;
    }

    const _this = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      confirmColor: '#FF3B30',
      success: async (modalRes) => {
        if (modalRes.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            await api.deleteTask(id);
            wx.showToast({ title: '已删除', icon: 'success' });
            _this.loadData(); // 重新加载
          } catch (err) {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  touchStart(e) {
    // Only one touch point
    if (e.touches.length === 1) {
      this.setData({ startX: e.touches[0].clientX });
    }
  },

  touchMove(e) {
    if (e.touches.length === 1) {
      const index = e.currentTarget.dataset.index;
      const task = this.data.tasks[index];
      
      // Disable swipe for completed tasks
      if (task.completed) return;

      const moveX = e.touches[0].clientX;
      const disX = this.data.startX - moveX;
      let txtStyle = '';
      let showDelete = false;

      if (disX <= 0) {
        txtStyle = 'left:0px';
        showDelete = false;
      } else if (disX > 0) {
        txtStyle = `left:-${disX}px`;
        showDelete = true;
        if (disX >= 140) {
          txtStyle = 'left:-140px';
        }
      }
      
      const tasks = this.data.tasks;
      tasks[index].txtStyle = txtStyle;
      tasks[index].showDelete = showDelete;
      this.setData({ tasks });
    }
  },

  touchEnd(e) {
    if (e.changedTouches.length === 1) {
      const index = e.currentTarget.dataset.index;
      const task = this.data.tasks[index];
      
      // Disable swipe for completed tasks
      if (task.completed) return;

      const endX = e.changedTouches[0].clientX;
      const disX = this.data.startX - endX;
      const tasks = this.data.tasks;
      
      // Threshold to snap open (e.g., 70px)
      const delBtnWidth = 140; // Two buttons of 70px
      let txtStyle = disX > delBtnWidth / 2 ? `left:-${delBtnWidth}px` : 'left:0px';
      let showDelete = disX > delBtnWidth / 2;
      
      // Close other open items
      tasks.forEach((item, idx) => {
        if (idx !== index) {
          item.txtStyle = 'left:0px';
          item.showDelete = false;
        }
      });
      
      tasks[index].txtStyle = txtStyle;
      tasks[index].showDelete = showDelete;
      this.setData({ tasks });
    }
  },
  
  // Close all swipes when tapping elsewhere
  resetSwipe() {
    const tasks = this.data.tasks.map(item => ({ ...item, txtStyle: 'left:0px', showDelete: false }));
    this.setData({ tasks });
  },

  async onTaskToggle(e) {
    const { id, completed } = e.currentTarget.dataset;
    
    if (!id || id.startsWith('temp-')) {
      wx.showToast({ title: '请先保存计划', icon: 'none' });
      return;
    }

    const newStatus = completed ? 'pending' : 'completed';
    
    try {
      const updatedTask = await api.updateTaskStatus(id, newStatus);
      
      // 更新本地状态
      const tasks = this.data.tasks.map(task => {
        if (task.id === id) {
          const actualMinutes = updatedTask.actualMinutes || 0;
          const estimatedMinutes = updatedTask.estimatedMinutes || 30;
          const timeText = newStatus === 'completed' 
                ? `计划 ${estimatedMinutes}分钟 · 实际 ${actualMinutes}分钟`
                : `计划 ${estimatedMinutes}分钟 · 进行中`;

          return { 
            ...task, 
            status: newStatus, 
            completed: newStatus === 'completed',
            actualMinutes: actualMinutes,
            time: timeText,
            // Disable swipe if completed
            txtStyle: 'left:0px',
            showDelete: false
          };
        }
        return task;
      });

      const completedCount = tasks.filter(t => t.completed).length;
      const todayProgress = tasks.length > 0 ? completedCount / tasks.length : 0;
      const todayProgressPercent = Math.round(todayProgress * 100);

      this.setData({
        tasks,
        todayProgress,
        todayProgressPercent
      });

      wx.showToast({
        title: newStatus === 'completed' ? '已完成！' : '已取消完成',
        icon: 'success'
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
