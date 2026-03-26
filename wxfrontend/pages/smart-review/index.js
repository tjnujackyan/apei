const api = require('../../services/api');

Page({
  data: {
    loading: true,
    generating: false,
    status: null,
    hasContent: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    // 生成参数
    totalCount: 20,
    enableTransform: false,
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    const statusBarHeight = systemInfo.statusBarHeight;
    const navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
    
    this.setData({ statusBarHeight, navBarHeight });
    
    // 先执行知识点迁移，再加载状态
    this.migrateAndLoadStatus();
  },

  async migrateAndLoadStatus() {
    try {
      // 静默执行知识点迁移（将 knowledgeTags 转换为 knowledgePointIds）
      await api.migrateKnowledgePoints();
    } catch (err) {
      // 迁移失败不影响主流程
      console.log('Knowledge point migration skipped:', err.message);
    }
    
    // 加载复习状态
    this.loadStatus();
  },

  async loadStatus() {
    try {
      this.setData({ loading: true });
      const status = await api.getSmartReviewStatus();
      
      const hasContent = status.hasWeakness || status.hasNewKnowledge;
      
      this.setData({
        status,
        hasContent,
        loading: false,
      });
    } catch (err) {
      console.error('Load status failed:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onCountInput(e) {
    // 实时更新显示值
    const value = e.detail.value;
    this.setData({ totalCount: value });
  },

  onCountBlur(e) {
    // 失焦时验证并修正数值
    let value = parseInt(e.detail.value) || 20;
    
    // 限制范围 10-30
    if (value < 10) value = 10;
    if (value > 30) value = 30;
    
    this.setData({ totalCount: value });
  },

  onTransformChange(e) {
    this.setData({ enableTransform: e.detail.value });
  },

  async onGenerate() {
    if (this.data.generating) return;
    
    this.setData({ generating: true });
    wx.showLoading({ title: '正在生成复习题目...', mask: true });

    try {
      const result = await api.generateSmartReviewQuiz({
        totalCount: this.data.totalCount,
        enableTransform: this.data.enableTransform,
      });

      wx.hideLoading();
      this.setData({ generating: false });

      // 跳转到练习页面
      if (result && result.questionSet) {
        const questionCount = result.questionSet.questionCount || this.data.totalCount;
        
        // 显示成功提示
        wx.showToast({ 
          title: `已生成${questionCount}道题目`, 
          icon: 'success',
          duration: 1500
        });
        
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/practice/index?mode=set&id=${result.questionSet.id}&title=${encodeURIComponent('智能复习')}`
          });
        }, 1500);
      } else {
        wx.showToast({ title: '生成完成，但未返回题目', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ generating: false });
      
      console.error('Generate failed:', err);
      
      // 处理特定错误
      if (err.code === 'NO_REVIEW_CONTENT') {
        wx.showToast({ title: '暂无需要复习的内容', icon: 'none' });
      } else {
        wx.showToast({ title: err.message || '生成失败', icon: 'none' });
      }
    }
  },

  onBack() {
    wx.navigateBack();
  },
});
