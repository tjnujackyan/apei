const api = require('../../services/api');

Page({
  data: {
    paddingTop: 0,
    loading: true,
    saving: false,
    
    // 用户资料
    displayName: '',
    gender: 'unknown',
    targetSchool: '',
    targetMajor: '',
    targetScore: '',
    persona: 'neutral',
    
    // 性别选项
    genderOptions: [
      { value: 'male', label: '男生', icon: 'user' },
      { value: 'female', label: '女生', icon: 'user' },
      { value: 'other', label: '保密', icon: 'browse-off' }
    ],
    
    // 人设选项
    personas: [
      { value: 'duzhe_xiaoxin', name: '毒舌小新', emoji: 'chat', desc: '台湾腔、机车、爱用梗' },
      { value: 'nana_zejie', name: '娜娜子姐姐', emoji: 'heart', desc: '温柔、鼓励、有耐心' },
      { value: 'neutral', name: '理性助手', emoji: 'cooperation', desc: '客观、专业、有条理' }
    ],
    
    // 热门院校
    hotSchools: ['清华大学', '北京大学', '浙江大学', '复旦大学', '上海交大', '南京大学', '中科大', '武汉大学']
  },

  onLoad() {
    const { statusBarHeight } = wx.getSystemInfoSync();
    this.setData({ paddingTop: statusBarHeight + 12 });
    this.loadProfile();
  },

  handleBack() {
    wx.navigateBack();
  },

  async loadProfile() {
    try {
      const user = await api.getProfile();
      this.setData({
        displayName: user.displayName || '',
        gender: user.gender || 'unknown',
        targetSchool: user.targetSchool || '',
        targetMajor: user.targetMajor || '',
        targetScore: user.targetScore ? String(user.targetScore) : '',
        persona: user.persona || 'neutral',
        loading: false
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onNameInput(e) {
    this.setData({ displayName: e.detail.value });
  },

  selectGender(e) {
    const { gender } = e.currentTarget.dataset;
    this.setData({ gender });
  },

  onSchoolInput(e) {
    this.setData({ targetSchool: e.detail.value });
  },

  selectSchool(e) {
    const { school } = e.currentTarget.dataset;
    this.setData({ targetSchool: school });
  },

  onMajorInput(e) {
    this.setData({ targetMajor: e.detail.value });
  },

  onScoreInput(e) {
    this.setData({ targetScore: e.detail.value });
  },

  selectPersona(e) {
    const { persona } = e.currentTarget.dataset;
    this.setData({ persona });
  },

  async handleSave() {
    if (this.data.saving) return;

    const { displayName, gender, targetSchool, targetMajor, targetScore, persona } = this.data;
    
    if (!displayName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      await api.updateProfile({
        displayName: displayName.trim(),
        gender: gender !== 'unknown' ? gender : undefined,
        targetSchool: targetSchool.trim() || undefined,
        targetMajor: targetMajor.trim() || undefined,
        targetScore: targetScore ? Number(targetScore) : undefined,
        persona
      });

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
