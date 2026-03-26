const api = require('../../services/api');
const app = getApp();
const plugin = requirePlugin('WechatSI');

// DIY 气泡样式 class 名（与 chat-diy 页面对应）
// 注意：跳过了 bubble-style-1 和 bubble-style-2（手绘和云朵气泡）
const BUBBLE_CLASS_NAMES = [
  'bubble-style-0',  // index 0: 经典白
  'bubble-style-3',  // index 1: 薄荷绿
  'bubble-style-4',  // index 2: 奶茶色
  'bubble-style-5',  // index 3: 梦幻紫
];

// DIY 字体样式预设
const FONT_STYLES = [
  '',
  'font-family: "PingFang SC", sans-serif; font-weight: 300;',
  'font-family: "Kaiti SC", "STKaiti", serif;',
  'font-family: "Heiti SC", sans-serif; font-weight: 600;',
];

Page({
  data: {
    inputValue: '',
    messages: [],
    suggestions: ['分析我的弱项', '我离上岸还有多远？', '看看我的整体情况'],
    toView: '',
    loading: false,
    historyLoaded: false,
    navHeight: 0,
    statusBarHeight: 0,
    menuButtonHeight: 0,
    menuButtonTop: 0,
    voiceMode: false,
    recording: false,
    aiVoiceReply: false,
    playingIndex: -1,
    showNewMessageTip: false,
    isAtBottom: true,
    windowHeight: 0,
    scrollViewHeight: 0,
    scrollTop: 0,
    
    // DIY 样式
    diyAvatarUrl: '/assets/icon.png',
    chatBgStyle: '',
    diyBubbleClass: 'bubble-style-0',
    diyFontStyle: '',
  },

  onLoad() {
    this.recognizedText = '';
    this.usingFallbackRecorder = false;
    const platform = wx.getSystemInfoSync().platform;
    this.isDevTools = platform === 'devtools';
    this.isDesktop = platform === 'windows' || platform === 'mac';

    // 开发者工具和桌面端（Windows/Mac）不支持同声传译插件，直接跳过
    if (this.isDevTools || this.isDesktop) {
      console.warn(`[Speech] ${this.isDevTools ? 'DevTools' : 'Desktop(' + platform + ')'} detected — plugin disabled, will use fallback recorder`);
      this.speechManager = null;
    } else {
      try {
        this.speechManager = plugin.getRecordRecognitionManager();
        console.log('[Speech] plugin loaded');

        this.speechManager.onStart(() => {
          console.log('[Speech] ✓ recognition started');
          // 清除启动超时定时器（已正常启动）
          if (this._speechStartTimer) {
            clearTimeout(this._speechStartTimer);
            this._speechStartTimer = null;
          }
        });

        this.speechManager.onRecognize((res) => {
          if (res.result) {
            this.recognizedText = res.result;
          }
        });

        this.speechManager.onStop((res) => {
          console.log('[Speech] ✓ result:', res.result);
          if (this._speechStartTimer) {
            clearTimeout(this._speechStartTimer);
            this._speechStartTimer = null;
          }
          this.setData({ recording: false });
          const finalText = res.result || this.recognizedText || '';
          this.recognizedText = '';
          this.handleSpeechResult(finalText, res.tempFilePath, res.duration);
        });

        this.speechManager.onError((err) => {
          console.error('[Speech] ✗ error:', JSON.stringify(err));
          if (this._speechStartTimer) {
            clearTimeout(this._speechStartTimer);
            this._speechStartTimer = null;
          }
          this.setData({ recording: false, loading: false });
          wx.showToast({ title: '语音识别出错，请重试', icon: 'none' });
        });
      } catch (e) {
        console.error('[Speech] plugin init failed:', e);
        this.speechManager = null;
      }
    }

    // Audio Context（用于播放语音消息）
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.onEnded(() => {
      this.setData({ playingIndex: -1 });
    });
    this.audioCtx.onError((res) => {
      console.error(res.errMsg);
      this.setData({ playingIndex: -1 });
      wx.showToast({ title: '播放失败', icon: 'none' });
    });

    // Calculate navigation bar layout based on Menu Button (Capsule)
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
    // Height of the nav content area (same as capsule height)
    const menuButtonHeight = menuButtonInfo.height;
    // Top position of the capsule (to align our custom elements)
    const menuButtonTop = menuButtonInfo.top;
    
    // Total Nav Height (Status Bar + Nav Content + Padding)
    const navContentHeight = (menuButtonTop - systemInfo.statusBarHeight) * 2 + menuButtonHeight;

    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      navHeight: navContentHeight,
      menuButtonHeight: menuButtonHeight,
      menuButtonTop: menuButtonTop,
      windowHeight: systemInfo.windowHeight
    });

    // 加载历史对话记录
    this.loadChatHistory();
    
    // 加载 DIY 配置
    this.loadDiyConfig();
  },

  loadDiyConfig() {
    // 从全局状态读取配置
    const config = app.globalData.chatDiyConfig || {};
    
    const bubbleIndex = config.bubbleStyle || 0;
    const fontIndex = config.fontStyle || 0;
    
    // 头像：优先使用用户上传的自定义头像
    const avatarUrl = config.customAvatarUrl || '/assets/icon.png';
    
    // 背景：优先使用用户上传的自定义背景
    let chatBgStyle = '';
    if (config.customBackgroundUrl) {
      chatBgStyle = `background-image: url(${config.customBackgroundUrl}); background-size: cover; background-position: center;`;
    }
    
    this.setData({
      diyAvatarUrl: avatarUrl,
      chatBgStyle: chatBgStyle,
      diyBubbleClass: BUBBLE_CLASS_NAMES[bubbleIndex] || 'bubble-style-0',
      diyFontStyle: FONT_STYLES[fontIndex] || '',
    });
  },

  onAvatarTap() {
    wx.navigateTo({ url: '/pages/chat-diy/index' });
  },

  async loadChatHistory() {
    try {
      // 检查 token 是否存在
      const token = wx.getStorageSync('token');
      if (!token) {
        wx.reLaunch({ url: '/pages/splash/index' });
        return;
      }

      const history = await api.getChatHistory(50);
      if (history && history.length > 0) {
        const messages = history.map(h => ({
          role: h.role,
          content: h.content,
          blocks: h.blocks,
          // 如果后端返回了语音相关字段，则设置为语音消息
          type: h.type || (h.role === 'assistant' ? 'text' : 'text'), 
          audioUrl: h.audioUrl,
          duration: h.duration
        }));
        this.setData({ 
          messages,
          historyLoaded: true 
        }, () => {
          this.scrollToBottom();
        });
      } else {
        // 没有历史记录，显示欢迎消息
        this.setData({ 
          messages: [{ role: 'assistant', content: '你终于想起我啦，快和我分享分享你的进度吧！' }],
          historyLoaded: true 
        });
      }
    } catch (err) {
      console.error('加载历史记录失败:', err);
      // 加载失败时显示默认欢迎消息
      this.setData({ 
        messages: [{ role: 'assistant', content: '你终于想起我啦，快和我分享分享你的进度吧！' }],
        historyLoaded: true 
      });
    }
  },

  onUnload() {
    if (this.audioCtx) {
      this.audioCtx.destroy();
    }
  },

  toggleAiVoice() {
    this.setData({ aiVoiceReply: !this.data.aiVoiceReply });
    wx.showToast({
      title: this.data.aiVoiceReply ? '语音回复已开启' : '语音回复已关闭',
      icon: 'none'
    });
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  switchMode() {
    this.setData({ voiceMode: !this.data.voiceMode });
  },

  startRecord() {
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        wx.vibrateShort();
        this.recognizedText = '';

        // 插件不存在或初始化失败 → 直接用回退方案
        if (!this.speechManager) {
          console.warn('[Speech] plugin not available, using fallback recorder');
          this.fallbackRecord();
          return;
        }

        this.setData({ recording: true });
        console.log('[Speech] calling speechManager.start...');
        try {
          this.speechManager.start({
            lang: 'zh_CN',
            duration: 30000,
          });
          // 超时保护：如果 2 秒内 onStart 未触发，说明插件静默失败，降级到 fallback
          this._speechStartTimer = setTimeout(() => {
            this._speechStartTimer = null;
            if (this.data.recording && !this.usingFallbackRecorder) {
              console.warn('[Speech] plugin start timeout (2s), falling back to native recorder');
              try { this.speechManager.stop(); } catch (e) { /* ignore */ }
              this.setData({ recording: false });
              this.fallbackRecord();
            }
          }, 2000);
        } catch (e) {
          console.error('[Speech] start() threw:', e);
          this.setData({ recording: false });
          this.fallbackRecord();
        }
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限',
          content: '请在设置中允许录音权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting();
          }
        });
      }
    });
  },

  stopRecord() {
    this.setData({ recording: false });
    if (this.usingFallbackRecorder) {
      this.fallbackRecorderManager.stop();
    } else {
      try {
        this.speechManager.stop();
      } catch (e) {
        console.error('[Speech] stop() threw:', e);
      }
    }
  },

  // 回退方案：插件不可用时使用原生录音 + 后端 ASR
  fallbackRecord() {
    this.usingFallbackRecorder = true;
    if (!this.fallbackRecorderManager) {
      this.fallbackRecorderManager = wx.getRecorderManager();
      this.fallbackRecorderManager.onStop((res) => {
        this.usingFallbackRecorder = false;
        this.handleFallbackRecordStop(res);
      });
    }
    this.setData({ recording: true });
    this.fallbackRecorderManager.start({ format: 'mp3' });
  },

  async handleFallbackRecordStop(res) {
    const { tempFilePath, duration } = res;
    this.setData({ recording: false });

    try {
      wx.showLoading({ title: '识别中...', mask: true });
      const transcribeRes = await api.transcribeAudio(tempFilePath);
      wx.hideLoading();

      const text = transcribeRes.text;
      if (!text || !text.trim()) {
        wx.showToast({ title: '未检测到语音内容', icon: 'none' });
        return;
      }

      this.handleSpeechResult(text, tempFilePath, duration);
    } catch (err) {
      wx.hideLoading();
      console.error('[Fallback ASR] failed:', err);
      wx.showToast({ title: '语音识别失败', icon: 'none' });
    }
  },

  scrollToBottom() {
    const len = this.data.messages.length;
    if (len > 0) {
      // Use toView to scroll to the last message
      // We set it to empty string first to ensure the property change triggers scroll
      // even if we are targeting the same message ID (e.g. content update)
      this.setData({ toView: '' }, () => {
        setTimeout(() => {
          this.setData({
            toView: `msg-${len - 1}`,
            showNewMessageTip: false
          });
        }, 100);
      });
    }
  },

  handleSpeechResult(text, tempFilePath, duration) {
    // 空内容检测
    if (!text || !text.trim()) {
      wx.showToast({ title: '未检测到语音内容', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    const durationSec = duration ? Math.round(duration / 1000) : Math.ceil(text.length / 4);

    // 构建语音消息（同时包含音频和识别文字）
    const voiceMsg = {
      role: 'user',
      content: text,
      type: 'voice',
      audioUrl: tempFilePath || '',
      duration: durationSec,
    };

    const newMsgs = [...this.data.messages, voiceMsg];
    this.setData({ messages: newMsgs }, () => {
      this.scrollToBottom();
    });

    // 直接把识别文字发送给 AI Agent
    this.handleAgentResponse(newMsgs, text);
  },

  async sendMessage() {
    const msg = this.data.inputValue;
    if(!msg || this.data.loading) return;

    const newMsgs = [...this.data.messages, { role: 'user', content: msg }];
    this.handleAgentResponse(newMsgs, msg);
  },

  // 快捷问题点击
  onSuggestionTap(e) {
    const text = e.currentTarget.dataset.text;
    if (!text || this.data.loading) return;
    
    const newMsgs = [...this.data.messages, { role: 'user', content: text }];
    this.handleAgentResponse(newMsgs, text);
  },

  // 按钮点击处理
  onActionButtonTap(e) {
    const { action, payload } = e.currentTarget.dataset;
    
    if (action === 'navigate' && payload && payload.page) {
      wx.navigateTo({ url: payload.page });
      return;
    }
    
    if (action === 'generate_plan') {
      const days = payload?.days || 15;
      const msg = `帮我生成${days}天学习计划`;
      const newMsgs = [...this.data.messages, { role: 'user', content: msg }];
      this.handleAgentResponse(newMsgs, msg);
      return;
    }
    
    if (action === 'analyze_weakness') {
      const msg = '分析我的弱项';
      const newMsgs = [...this.data.messages, { role: 'user', content: msg }];
      this.handleAgentResponse(newMsgs, msg);
      return;
    }
  },

  // Agent模式响应处理
  async handleAgentResponse(newMsgs, userMessage) {
    this.setData({ 
      messages: newMsgs, 
      inputValue: '',
      loading: true,
      suggestions: [] // 清空当前建议
    }, () => {
      this.scrollToBottom();
    });

    try {
      // 调用 Agent API
      const history = newMsgs.slice(0, -1).map(m => ({
        role: m.role,
        content: m.blocks ? m.blocks.filter(b => b.type === 'text').map(b => b.content).join('') : (m.content || '')
      }));
      
      const res = await api.agentChat(userMessage, history);
      
      // 构建AI消息（富消息模式）
      let aiMsg = { 
        role: 'assistant', 
        blocks: res.blocks || [{ type: 'text', content: res.content || '抱歉，我没有理解你的问题' }]
      };

      // 如果开启了语音回复，合成语音
      if (this.data.aiVoiceReply) {
        try {
          // 提取所有文本内容进行语音合成
          const textContent = aiMsg.blocks
            .filter(b => b.type === 'text')
            .map(b => b.content)
            .join('');
          
          if (textContent) {
            // 传递 userMessage 作为 referenceText，启用豆包语音2.0的情绪承接功能
            // 同时传递 res.emotion (如果后端返回了建议情感)
            const ttsRes = await api.synthesize(textContent, userMessage, res.emotion);
            if (ttsRes && ttsRes.audioUrl) {
              const estimatedDuration = Math.min(60, Math.ceil(textContent.length / 3));
              aiMsg.type = 'voice';
              aiMsg.audioUrl = ttsRes.audioUrl;
              aiMsg.duration = estimatedDuration;
              aiMsg.content = textContent; // 保留文本内容用于显示
              
              // 后台获取实际时长
              this.getAudioDuration(ttsRes.audioUrl).then(realDuration => {
                const finalDuration = realDuration > 0 ? realDuration : estimatedDuration;
                
                // ✅ 关键修复：同步语音状态到后端数据库
                // 这样下次进入页面加载历史记录时，才能看到是语音消息
                api.updateVoiceStatus(ttsRes.audioUrl, finalDuration);

                if (realDuration > 0) {
                  const currentMsgs = this.data.messages;
                  const targetIndex = currentMsgs.findIndex(m => m.audioUrl === ttsRes.audioUrl);
                  if (targetIndex !== -1) {
                    this.setData({ [`messages[${targetIndex}].duration`]: realDuration });
                  }
                }
              });
            }
          }
        } catch (ttsErr) {
          console.error('TTS Failed', ttsErr);
          // 回退到文本模式
        }
      }

      // 更新消息和建议
      const updatedMsgs = [...newMsgs, aiMsg];
      const shouldAutoScroll = this.data.isAtBottom;

      this.setData({
        messages: updatedMsgs,
        loading: false,
        suggestions: res.suggestions || [],
        showNewMessageTip: shouldAutoScroll ? false : true
      }, () => {
        if (shouldAutoScroll) {
          setTimeout(() => this.scrollToBottom(), 100);
        }
      });
    } catch (err) {
      console.error('Agent response error:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '连接失败', icon: 'none' });
    }
  },

  // 保留旧的chat方法作为备用

  async handleAiResponse(newMsgs) {
    this.setData({ 
      messages: newMsgs, 
      inputValue: '',
      loading: true
    }, () => {
      // Scroll to user message immediately after rendering
      this.scrollToBottom();
    });

    try {
      // 1. Get Text Response
      // For MVP simulation of voice input, we use userContent. 
      // If it was real voice, we would upload audio first.
      
      // Filter out [语音消息] for API call if needed, but here we just pass the history
      // Note: Backend handles text.
      
      const res = await api.chat(newMsgs.map(m => ({ 
        role: m.role, 
        content: m.content || '[语音消息]' // Ensure content is never empty
      })));
      
      let aiMsg = { role: 'assistant', content: res.content };

      // 2. If AI Voice Reply is ON, Synthesize Audio
      if (this.data.aiVoiceReply) {
        try {
          // 获取上一条用户消息作为 referenceText
          const lastUserMsg = newMsgs.length > 0 ? newMsgs[newMsgs.length - 1].content : '';
          const ttsRes = await api.synthesize(res.content, lastUserMsg);
          if (ttsRes && ttsRes.audioUrl) {
            const estimatedDuration = Math.min(60, Math.ceil(res.content.length / 3));
            aiMsg = {
              ...aiMsg,
              type: 'voice',
              audioUrl: ttsRes.audioUrl,
              duration: estimatedDuration // Estimate duration for MVP UI
            };

            // Fetch actual duration in background
            this.getAudioDuration(ttsRes.audioUrl).then(realDuration => {
              if (realDuration > 0) {
                // Find the message in current data and update it
                const currentMsgs = this.data.messages;
                // We need to find the latest message that matches this URL
                // Since we just added it, it should be the last one, but let's be safe
                const targetIndex = currentMsgs.findIndex(m => m.audioUrl === ttsRes.audioUrl);
                
                if (targetIndex !== -1) {
                  const key = `messages[${targetIndex}].duration`;
                  this.setData({ [key]: realDuration });
                }
              }
            });
          }
        } catch (ttsErr) {
          console.error('TTS Failed', ttsErr);
          // Fallback to text
        }
      }
      
      const updatedMsgs = [...newMsgs, aiMsg];
      const shouldAutoScroll = this.data.isAtBottom;

      const updates = {
        messages: updatedMsgs,
        loading: false,
        showNewMessageTip: shouldAutoScroll ? false : true
      };

      this.setData(updates, () => {
        if (shouldAutoScroll) {
          setTimeout(() => {
            this.scrollToBottom();
          }, 100);
        }
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false });
      wx.showToast({ title: '连接失败', icon: 'none' });
    }
  },

  playAudio(e) {
    const { url, index } = e.currentTarget.dataset;
    if (!url) return;

    if (this.data.playingIndex === index) {
      // Stop if clicking same
      this.audioCtx.stop();
      this.setData({ playingIndex: -1 });
      return;
    }

    this.audioCtx.src = url.split('?')[0];
    this.audioCtx.play();
    this.setData({ playingIndex: index });
  },

  onVoiceLongPress(e) {
    const { index, content } = e.currentTarget.dataset;
    const msg = this.data.messages[index];

    // 根据是否已转换文字显示不同菜单
    const itemList = msg.convertedText 
      ? ['播放语音', '隐藏文字', '复制文字']
      : ['播放语音', '转为文字'];

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        if (!msg.convertedText) {
          // 未转换状态的菜单
          if (res.tapIndex === 0) {
            // 播放语音
            this.playAudio(e);
          } else if (res.tapIndex === 1) {
            // 转为文字
            this.convertVoiceToText(index);
          }
        } else {
          // 已转换状态的菜单
          if (res.tapIndex === 0) {
            // 播放语音
            this.playAudio(e);
          } else if (res.tapIndex === 1) {
            // 隐藏文字
            const key = `messages[${index}].convertedText`;
            this.setData({ [key]: '' });
            wx.showToast({ title: '已隐藏', icon: 'success', duration: 1500 });
          } else if (res.tapIndex === 2) {
            // 复制文字
            wx.setClipboardData({
              data: msg.convertedText,
              success: () => {
                wx.showToast({ title: '已复制', icon: 'success', duration: 1500 });
              }
            });
          }
        }
      }
    });
  },

  // 转换语音为文字
  convertVoiceToText(index) {
    wx.showLoading({ title: '转换中...' });
    
    setTimeout(() => {
      const msg = this.data.messages[index];
      // 使用消息的 content 作为转换后的文本
      // 在实际应用中，应该调用语音识别API
      const convertedText = msg.content || '这是转换后的文本内容';
      
      const key = `messages[${index}].convertedText`;
      this.setData({
        [key]: convertedText
      });
      
      wx.hideLoading();
      wx.showToast({ 
        title: '转换成功', 
        icon: 'success',
        duration: 1500
      });
    }, 500);
  },

  getAudioDuration(url) {
    return new Promise((resolve) => {
      const ctx = wx.createInnerAudioContext();
      ctx.src = url ? url.split('?')[0] : url;
      
      // Some optimization: mute it so it doesn't make noise if it accidentally plays
      ctx.volume = 0;
      
      ctx.onCanplay(() => {
        // duration is in seconds. It might be available now.
        if (ctx.duration) {
          resolve(Math.round(ctx.duration));
          ctx.destroy();
        } else {
          // Sometimes duration is not ready immediately in onCanplay on some devices
          setTimeout(() => {
            resolve(Math.round(ctx.duration) || 0);
            ctx.destroy();
          }, 200);
        }
      });
      
      ctx.onError(() => {
        resolve(0);
        ctx.destroy();
      });
    });
  },

  onReady() {
    // Get accurate scroll view height
    const query = wx.createSelectorQuery();
    query.select('.chat-history').boundingClientRect(rect => {
      if (rect) {
        this.setData({ scrollViewHeight: rect.height });
      }
    }).exec();
  },

  onShow() {
    // 每次页面显示时重新加载 DIY 配置（用户可能修改了）
    this.loadDiyConfig();
    
    // 初始化 TabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init();
    }
  },

  onScroll(e) {
    const { scrollTop, scrollHeight } = e.detail;
    
    // Use the actual scroll view height if available, otherwise fallback to windowHeight
    const viewHeight = this.data.scrollViewHeight || this.data.windowHeight;
    
    // Threshold: 100px from bottom is considered "at bottom"
    const isAtBottom = (scrollHeight - scrollTop - viewHeight) < 100;
    
    // Only setData if value changes to avoid performance issues
    if (isAtBottom !== this.data.isAtBottom) {
      this.setData({ isAtBottom });
    }
    
    // If user scrolls to bottom manually, hide the tip
    if (isAtBottom && this.data.showNewMessageTip) {
      this.setData({ showNewMessageTip: false });
    }
  },

  scrollToBottom() {
    this.setData({
      toView: `msg-${this.data.messages.length - 1}`,
      showNewMessageTip: false
    });
  }
})
