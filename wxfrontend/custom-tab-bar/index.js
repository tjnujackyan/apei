Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#10A37F",
    list: [
      { value: '/pages/home/index', label: '首页', icon: '/assets/tabbar/home.svg', iconSelected: '/assets/tabbar/home-active.svg' },
      { value: '/pages/ai-brain/index', label: '阿陪', icon: '/assets/tabbar/chat.svg', iconSelected: '/assets/tabbar/chat-active.svg' },
      { value: '/pages/study/index', label: '学习', icon: '/assets/tabbar/book.svg', iconSelected: '/assets/tabbar/book-active.svg' },
      { value: '/pages/profile/index', label: '我的', icon: '/assets/tabbar/user.svg', iconSelected: '/assets/tabbar/user-active.svg' },
    ],
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    },
    
    init() {
      const page = getCurrentPages().pop();
      const route = page ? page.route : null;
      if (route) {
        const activeIndex = this.data.list.findIndex(item => item.value === '/' + route);
        this.setData({
          selected: activeIndex > -1 ? activeIndex : 0
        });
      }
    },
  },

  lifetimes: {
    attached() {
      wx.loadFontFace({
        family: 't',
        source: 'url("https://tdesign.gtimg.com/icon/0.3.2/fonts/t.ttf")',
        scopes: ['webview', 'native'],
        success: () => console.log('TDesign font loaded'),
        fail: (err) => console.error('TDesign font load failed', err)
      });
    }
  }
});