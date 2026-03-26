const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    step: 1, // 当前步骤 1-4
    
    // 第1步：目标设置
    targetSchool: '',
    targetMajor: '',
    targetScore: '',
    
    // 第2步：科目选择
    selectedSubjects: {
      politics: true,
      english: true,
      math: false,
      cs408: true
    },
    
    // 第3步：时间设置
    studyTime: '3-5',
    
    // 第4步：助手风格
    persona: 'nana_zejie', // duzhe_xiaoxin, nana_zejie, neutral
    
    // 用户信息
    displayName: '',
    avatarUrl: ''
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    
    // 尝试获取用户信息
    this.loadUserInfo();
  },

  /**
   * 加载用户信息（如果已登录）
   */
  async loadUserInfo() {
    try {
      const profile = await api.getProfile();
      if (profile) {
        this.setData({
          displayName: profile.displayName || '',
          avatarUrl: profile.avatarUrl || '',
          targetSchool: profile.targetSchool || '',
          targetMajor: profile.targetMajor || '',
          persona: profile.persona || 'nana_zejie'
        });
      }
    } catch (err) {
      console.log('未登录或获取用户信息失败', err);
    }
  },

  /**
   * 第1步：选择学校
   */
  selectSchool(e) {
    const { school } = e.currentTarget.dataset;
    this.setData({ targetSchool: school });
  },

  /**
   * 第1步：输入学校
   */
  onSchoolInput(e) {
    this.setData({ targetSchool: e.detail.value });
  },

  /**
   * 第1步：输入专业
   */
  onMajorInput(e) {
    this.setData({ targetMajor: e.detail.value });
  },

  /**
   * 第1步：输入分数
   */
  onScoreInput(e) {
    this.setData({ targetScore: e.detail.value });
  },

  /**
   * 第2步：切换科目选择
   */
  toggleSubject(e) {
    const { subject } = e.currentTarget.dataset;
    const key = `selectedSubjects.${subject}`;
    this.setData({
      [key]: !this.data.selectedSubjects[subject]
    });
  },

  /**
   * 第2步：添加其他科目
   */
  addSubject() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  /**
   * 第3步：选择学习时间
   */
  selectTime(e) {
    const { time } = e.currentTarget.dataset;
    this.setData({ studyTime: time });
  },

  /**
   * 第4步：选择助手风格
   */
  selectPersona(e) {
    const { persona } = e.currentTarget.dataset;
    this.setData({ persona });
  },

  /**
   * 底部按钮点击处理
   */
  handleAction() {
    const { step } = this.data;
    if (step === 4) {
      this.submit();
    } else {
      this.nextStep();
    }
  },

  /**
   * 下一步
   */
  nextStep() {
    const { step, targetSchool, targetMajor, targetScore } = this.data;
    
    if (step === 1) {
      if (!targetSchool) {
        wx.showToast({ title: '请输入目标院校', icon: 'none' });
        return;
      }
      if (!targetMajor) {
        wx.showToast({ title: '请输入目标专业', icon: 'none' });
        return;
      }
      if (!targetScore) {
        wx.showToast({ title: '请输入目标分数', icon: 'none' });
        return;
      }
    }
    
    this.setData({ step: step + 1 });
  },

  /**
   * 提交引导信息
   */
  async submit() {
    const {
      displayName,
      targetSchool,
      targetMajor,
      targetScore,
      selectedSubjects,
      studyTime,
      persona
    } = this.data;

    // 显示加载
    wx.showLoading({ title: '正在保存...' });

    try {
      // 构建提交数据
      const subjects = [];
      if (selectedSubjects.politics) subjects.push('政治');
      if (selectedSubjects.english) subjects.push('英语一');
      if (selectedSubjects.math) subjects.push('数学一');
      if (selectedSubjects.cs408) subjects.push('408计算机综合');

      const onboardingData = {
        targetSchool,
        targetMajor,
        targetScore: parseInt(targetScore),
        subjects: subjects.join(','),
        dailyStudyHours: studyTime,
        persona
      };

      // 调用API更新用户信息
      await api.updateProfile(onboardingData);

      wx.hideLoading();

      // 保存到本地存储
      wx.setStorageSync('onboarded', true);
      
      // 更新本地用户信息
      const currentUser = wx.getStorageSync('user') || {};
      const updatedUser = { ...currentUser, ...onboardingData };
      wx.setStorageSync('user', updatedUser);

      // 跳转到首页
      wx.reLaunch({
        url: '/pages/home/index'
      });

      wx.showToast({
        title: '设置完成！',
        icon: 'success'
      });

    } catch (err) {
      wx.hideLoading();
      console.error('提交引导信息失败', err);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  }
});
