const api = require('../../services/api');

Page({
  data: {
    sessionId: null,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    total: 0,
    selectedIdx: null,
    selectedIndices: [],
    showResult: false,
    isCorrect: null,
    startTime: 0,
    loading: true,
    finished: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuButtonTop: 0,
    title: '专项练习' // Default title
  },

  async onLoad(options) {
    // Calculate custom navigation bar layout
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    const statusBarHeight = systemInfo.statusBarHeight;
    const navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
    
    this.setData({ 
        statusBarHeight,
        navBarHeight,
        menuButtonTop: menuButtonInfo.top
    });

    const { mode, id, title, sessionId } = options;
    
    if (title) {
        this.setData({ title: decodeURIComponent(title) });
    }

    try {
      if (mode === 'resume' && sessionId) {
        // Resume mode: Fetch existing session details
        await this.resumeSession(sessionId);
      } else if (mode === 'set' && id) {
        // New session from set
        await this.startNewSession(id);
      } else {
        throw new Error('Invalid parameters');
      }
    } catch (err) {
      console.error('Init practice failed', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async startNewSession(setId) {
    // 1. Fetch questions for the set
    const questions = await api.getQuestions(setId);
    if (!questions || questions.length === 0) {
      throw new Error('No questions found');
    }

    // 2. Create new session
    const session = await api.createPracticeSession(setId, questions.map(q => q.id));
    
    this.setData({
      sessionId: session.id,
      questions,
      total: questions.length,
      loading: false
    });
    
    this.loadQuestion(0);
  },

  async resumeSession(sessionId) {
    // 1. Fetch session details (status, progress)
    const session = await api.getSession(sessionId);
    
    // 2. Fetch questions for the set (we need full question data)
    // Optimization: Backend could return questions with session, or we fetch separately
    const questions = await api.getQuestions(session.questionSetId);
    
    // 3. Determine resume index
    // We can use session.answeredCount (which we added to backend entity)
    // Or calculate from logs length if logs are returned
    const resumeIndex = session.logs ? session.logs.length : (session.answeredCount || 0);

    this.setData({
      sessionId: session.id,
      questions,
      total: questions.length,
      loading: false
    });

    // Check if finished
    if (resumeIndex >= questions.length) {
       this.setData({ finished: true });
    } else {
       this.loadQuestion(resumeIndex);
    }
  },

  loadQuestion(index) {
    if (index >= this.data.questions.length) {
      this.setData({ finished: true });
      return;
    }

    const q = this.data.questions[index];
    // Parse options if stored as JSON string, assuming backend returns array or string
    let options = q.options;
    if (typeof options === 'string') {
        try {
            options = JSON.parse(options);
        } catch(e) {
            options = [];
        }
    }

    this.setData({
      currentIndex: index,
      currentQuestion: { ...q, options },
      selectedIdx: null,
      selectedIndices: [],
      showResult: false,
      isCorrect: null,
      startTime: Date.now()
    });
  },

  onSelectOption(e) {
    if (this.data.showResult) return;
    
    const index = e.currentTarget.dataset.index;
    const { type } = this.data.currentQuestion;

    if (type === 'multiple') {
      let selected = [...this.data.selectedIndices];
      const idxInSelected = selected.indexOf(index);
      if (idxInSelected > -1) {
        selected.splice(idxInSelected, 1);
      } else {
        selected.push(index);
      }
      this.setData({ selectedIndices: selected });
    } else {
      // Single choice
      this.setData({ selectedIdx: index });
    }
  },

  onHint() {
      // Toggle explanation or show hint toast
      if (!this.data.currentQuestion.explanation) {
          wx.showToast({ title: '暂无提示', icon: 'none' });
          return;
      }
      
      this.setData({ showHint: !this.data.showHint });
  },

  onPrev() {
    if (this.data.currentIndex > 0) {
      this.loadQuestion(this.data.currentIndex - 1);
    }
  },

  async onSubmit() {
    const { type, options } = this.data.currentQuestion;
    let userSelected; // Should be the content or identifier

    if (type === 'multiple') {
      if (this.data.selectedIndices.length === 0) return;
      // Map indices back to option objects
      userSelected = this.data.selectedIndices.map(idx => options[idx]);
    } else {
      if (this.data.selectedIdx === null) return;
      userSelected = options[this.data.selectedIdx];
    }

    const timeSpent = Math.round((Date.now() - this.data.startTime) / 1000);
    
    // Calculate correctness
    let isCorrect = false;
    
    const isOptionObject = options.length > 0 && typeof options[0] === 'object';
    
    if (isOptionObject) {
        // Compare based on isCorrect flag in options
        if (type === 'multiple') {
            // Get all correct options indices
            const correctIndices = options
                .map((o, i) => o.isCorrect ? i : -1)
                .filter(i => i !== -1);
            
            const selectedSet = new Set(this.data.selectedIndices);
            const correctSet = new Set(correctIndices);
            
            isCorrect = selectedSet.size === correctSet.size && 
                        [...selectedSet].every(s => correctSet.has(s));
        } else {
            // Single
            isCorrect = options[this.data.selectedIdx].isCorrect;
        }
    } else {
        // Fallback for string options (legacy)
        isCorrect = userSelected === this.data.currentQuestion.correctAnswer;
    }
    
    this.setData({
      showResult: true,
      isCorrect
    });

    // Submit to backend
    // For submission, we might want to send labels or content
    // But let's keep sending the option objects as before if that's what backend expects
    // Or just labels. "selected" param in API seems flexible.
    
    // 验证 questionId
    if (!this.data.currentQuestion || !this.data.currentQuestion.id) {
      console.error('Missing question ID', this.data.currentQuestion);
      wx.showToast({ title: '题目数据异常', icon: 'none' });
      return;
    }
    
    try {
      await api.submitAnswer(
        this.data.sessionId,
        this.data.currentQuestion.id,
        isCorrect,
        timeSpent,
        { selected: userSelected }
      );
    } catch (err) {
      console.error('Submit answer failed', err);
    }
  },

  onNext() {
    this.loadQuestion(this.data.currentIndex + 1);
  },

  async onComplete() {
      try {
          await api.completeSession(this.data.sessionId);
          this.setData({ finished: true });
      } catch (err) {
          console.error('Failed to complete session', err);
          wx.showToast({ title: '提交失败', icon: 'none' });
      }
  },

  onBack() {
    wx.navigateBack();
  }
});