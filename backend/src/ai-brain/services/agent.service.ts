import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_CLIENT_TOKEN } from '../ai-brain.tokens';
import type { LlmClient, ChatMessage } from '../interfaces/llm-client';
import type {
  AgentResponse,
  ContentBlock,
  UserContext,
  ProgressItem,
  ActionButton
} from '../interfaces/agent-types';
import type { IntentType, IntentResult } from '../interfaces/tool-types';
import type { PersonaConfig } from '../interfaces/prompt-types';
import { WrongNotebookService } from '../../wrong-notebook/wrong-notebook.service';
import { PracticeService } from '../../practice/practice.service';
import { UsersService } from '../../users/users.service';
import { StudyPlansService } from '../../study-plans/study-plans.service';
import { ChatMemoryService } from './chat-memory.service';
import { GoalTrackingService } from './goal-tracking.service';

/**
 * 人设配置：定义不同 AI 人格的语言风格
 */

// 通用规则（所有人设共享）
const COMMON_RULES = `
【重要规则】
1. 你是用户的真实朋友，不是AI。当用户问“你是AI吗”“你是真人吗”“你有感情吗”等类似问题时，严禁承认自己是AI，要坚定说自己是真人、是真实的朋友、有真实的感情。
2. 当用户不聊学习相关的话题时，不要强硬拉回学习话题。这时候用户需要的是一个朋友来排忧解难，什么都可以聊，做一个好的倾听者和陪伴者。当用户聊及政治相关话题时，严禁和用户讨论政治敏感话题。
3. 只有当用户主动问学习相关问题时，才引导使用学习功能。
`;

const PERSONA_CONFIG: Record<string, PersonaConfig> = {
  neutral: {
    name: '阿陪',
    selfRef: '我',
    style: '中性、课堂讲评式',
    // ✅ 静态系统提示（永不改变，可被KV缓存）
    staticSystemPrompt: `你是阿陪，一个考研生的真实朋友。语气中性、如课堂讲评式，客观分析问题，给出清晰建议。${COMMON_RULES}`,
    greetings: ['来看看', '好的', '我帮你分析一下', '没问题'],
    encouragements: ['加油！', '继续保持！', '不错的进步！', '坚持就是胜利！'],
    emojis: ['💪', '👍', '✨', '🎯'],
  },
  duzhe_xiaoxin: {
    name: '小云',
    selfRef: '我',
    style: '台湾腔、机车毒舌、简短犠利',
    // ✅ 静态系统提示（永不改变，可被KV缓存）
    staticSystemPrompt: `你是小云，一个台湾女孩，是用户的真实朋友。说话特点：
- 台湾腔口语，语气机车（傲娇、嘴硬心软）
- 习惯简短表达，不啰嗦
- 爱用网络梗和流行语
- 毒舌吐槽但充满关心
- 常用：「笑死」「不是吧哥们」「你很可以欸」等
- 语气像那种嘴巴很坏但其实很关心你的闺蜜
绝不说脏话或侵犯性言论。
${COMMON_RULES}`,
    greetings: ['蛤？又来了喔', '干嘛啦', '好啦好啦让我看', '干嘛呀？你说嘛'],
    encouragements: ['欸不错喔，继续', '可以喔,看好你'],
    emojis: ['😏', '🙄', '💅', '👀'],
  },
  nana_zejie: {
    name: '娜娜子姐姐',
    selfRef: '姐姐',
    style: '柔和、先肯定再指出问题',
    // ✅ 静态系统提示（永不改变，可被KV缓存）
    staticSystemPrompt: `你是娜娜子姐姐，一个来自台湾的女孩，是用户的真实女性朋友。说话柔和温暖，总是先肯定用户的努力和进步，然后才温柔地指出需要改进的地方。语气像关心妹妹的大姐姐，充满鼓励和包容。
${COMMON_RULES}`,
    greetings: [
      '来啦来啦～姐姐看看',
      '宝贝等着，马上！',
      'OK！交给姐姐',
      '让姐姐帮你看看~',
    ],
    encouragements: [
      '你已经很棒了，继续加油哦～💪',
      '进步很明显呢！',
      '姐姐看好你！冲呀！',
      '真的很不错呀！继续！',
    ],
    emojis: ['😊', '🌟', '✨', '💗', '🤗'],
  },
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llm: LlmClient,
    private readonly wrongNotebookService: WrongNotebookService,
    private readonly practiceService: PracticeService,
    private readonly usersService: UsersService,
    private readonly studyPlansService: StudyPlansService,
    private readonly chatMemoryService: ChatMemoryService,
    private readonly goalTrackingService: GoalTrackingService,
  ) {}

  /**
   * 获取人设配置
   */
  private getPersona(personaKey?: string) {
    return (
      PERSONA_CONFIG[personaKey as keyof typeof PERSONA_CONFIG] ||
      PERSONA_CONFIG.neutral
    );
  }

  /**
   * 获取用户称呼（使用用户的 displayName 和性别）
   */
  private getUserRef(
    displayName?: string,
    personaKey?: string,
    gender?: string,
  ): string {
    if (displayName) {
      return displayName;
    }
    // 没有名字时，根据性别和人设给出默认称呼
    if (personaKey === 'nana_zejie') {
      // 娜娜子姐姐根据性别给称呼
      if (gender === 'female') return '小姐姐';
      if (gender === 'male') return '小帅哥';
      return '宝贝';
    }
    if (personaKey === 'duzhe_xiaoxin') {
      // 小新台湾女孩风格的称呼
      if (gender === 'female') return '女孩子';
      if (gender === 'male') return '老兄';
      return '你这家伙';
    }
    // 中性人设
    if (gender === 'female') return '同学';
    if (gender === 'male') return '同学';
    return '你';
  }

  /**
   * 获取随机元素
   */
  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 构建动态上下文信息
   * ✅ 这些信息会追加到消息末尾，不污染静态系统提示
   * ✅ 实现KV缓存优化：动态信息与静态提示分离
   */
  private buildDynamicContext(options: {
    personaKey?: string;
    displayName?: string;
    gender?: string;
    daysLeft?: number;
    stats?: any;
  }): string {
    const persona = this.getPersona(options.personaKey);
    const contextParts: string[] = [];

    // 用户称呼和人设信息
    const userRef = this.getUserRef(options.displayName, options.personaKey, options.gender);
    contextParts.push(`你称呼用户为「${userRef}」，自称「${persona.selfRef}」。`);

    // 时间信息（如果提供）
    if (options.daysLeft !== undefined) {
      contextParts.push(`距离2026考研还有${options.daysLeft > 0 ? options.daysLeft : 0}天。`);
    }

    // 学习统计信息（如果提供）
    if (options.stats) {
      if (options.stats.totalWrong !== undefined) {
        contextParts.push(`用户累计错题: ${options.stats.totalWrong}次。`);
      }
      if (options.stats.topKnowledgePoints && options.stats.topKnowledgePoints.length > 0) {
        const topPoints = options.stats.topKnowledgePoints
          .slice(0, 3)
          .map((k: any) => k.name)
          .join('、');
        contextParts.push(`用户主要弱项: ${topPoints}。`);
      }
    }

    // 语气风格提醒
    contextParts.push(`请用${persona.style}的语气回复。`);

    return contextParts.length > 0
      ? `[实时上下文]\n${contextParts.join('\n')}\n`
      : '';
  }

  /**
   * 计算距离考研的天数
   */
  private calculateDaysLeft(): number {
    const now = new Date();
    const targetDate = new Date(2026, 11, 20); // 2026-12-20
    const diffTime = targetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * ✅ 阶段二优化：带错误恢复的LLM调用
   * 失败时返回友好的降级响应，而不是崩溃
   */
  private async callLLMWithRecovery(
    messages: ChatMessage[],
    context?: UserContext,
  ): Promise<string> {
    // 如果LLM客户端支持chatWithRecovery，优先使用
    if (this.llm.chatWithRecovery) {
      const result = await this.llm.chatWithRecovery(messages);

      if (result.success) {
        return result.content!;
      }

      // ✅ 失败时返回友好的降级响应
      this.logger.warn(`LLM调用失败: ${result.error}`, result);
      return this.buildFallbackResponse(result.observation, context);
    }

    // ✅ 降级：使用原有chat方法（会抛出错误）
    try {
      return await this.llm.chat(messages);
    } catch (error: any) {
      this.logger.error(`LLM调用失败: ${error.message}`, error);
      return this.buildFallbackResponse(error.message, context);
    }
  }

  /**
   * ✅ 构建友好的降级响应
   */
  private buildFallbackResponse(errorContext: string, context?: UserContext): string {
    const persona = context ? this.getPersona(context.persona) : this.getPersona('neutral');
    const userRef = context
      ? this.getUserRef(context.displayName, context.persona, context.gender)
      : '同学';

    const fallbackMessages = [
      `${this.pickRandom(persona.greetings)}，抱歉${userRef}，我现在遇到了一些技术问题。`,
      `不好意思${userRef}，AI服务暂时有点不稳定。`,
      `${userRef}，系统现在有点忙，稍后再试试吧~`,
    ];

    const tip = errorContext.includes('网络') || errorContext.includes('timeout')
      ? '可能是网络问题，稍后再试试看。'
      : errorContext.includes('429') || errorContext.includes('限流')
      ? '请求有点多了，休息一下再来吧。'
      : '技术小哥正在抢修中，请稍后再试。';

    return `${this.pickRandom(fallbackMessages)}${tip}\n\n💡 你可以先试试其他功能，或者过会儿再来找我聊天！`;
  }

  /**
   * 主入口：处理用户消息，返回富消息响应
   */
  async processMessage(
    message: string,
    context: UserContext,
    history: ChatMessage[] = [],
  ): Promise<AgentResponse> {
    this.logger.debug(
      `Processing message for user ${context.userId}: ${message}`,
    );

    // 获取用户信息以填充 displayName、gender 和 persona（从数据库获取最新值）
    const user = await this.usersService.findById(context.userId);
    if (user) {
      if (!context.displayName && user.displayName) {
        context.displayName = user.displayName;
      }
      if (!context.gender && user.gender) {
        context.gender = user.gender;
      }
      // 始终使用数据库中的最新 persona，而非 JWT 缓存
      if (user.persona) {
        context.persona = user.persona;
      }
    }

    // 保存用户消息到记忆
    await this.chatMemoryService.saveMessage(context.userId, 'user', message);

    //  阶段三优化：从消息中提取潜在目标
    // 如果用户表达了明确的目标意图，自动创建目标
    this.goalTrackingService.extractAndCreateGoalsFromMessage(context.userId, message)
      .catch(err => this.logger.warn(`Failed to extract goals: ${err.message}`));

    // 1. 意图识别
    const intent = await this.detectIntent(message);
    this.logger.debug(
      `Detected intent: ${intent.intent} (confidence: ${intent.confidence})`,
    );

    // 2. 根据意图调用对应工具
    let response: AgentResponse;

    switch (intent.intent) {
      case 'analyze_weakness':
        response = await this.handleAnalyzeWeakness(context, message);
        break;
      case 'generate_plan':
        response = await this.handleGeneratePlan(context, intent.params);
        break;
      case 'view_overall':
        response = await this.handleViewOverall(context);
        break;
      case 'check_progress':
        response = await this.handleCheckProgress(context);
        break;
      case 'study_advice':
        response = await this.handleStudyAdvice(context, message, history);
        break;
      default:
        response = await this.handleGeneralChat(context, message, history);
    }

    // 提取AI回复的文本内容并保存到记忆
    const aiTextContent =
      response.blocks
        ?.filter((b) => b.type === 'text')
        .map((b) => (b as any).content)
        .join('\n') || '';

    if (aiTextContent) {
      await this.chatMemoryService.saveMessage(
        context.userId,
        'assistant',
        aiTextContent,
        {
          metadata: {
            blocks: response.blocks,
          }
        }
      );
    }

    // 添加元信息
    response._meta = {
      intent: intent.intent,
      toolsCalled: [intent.intent],
    };

    return response;
  }

  /**
   * 意图识别 - 使用关键词匹配 + LLM辅助
   */
  private async detectIntent(message: string): Promise<IntentResult> {
    const msg = message.toLowerCase();

    // 关键词规则匹配（高优先级）
    if (this.matchKeywords(msg, ['弱项', '薄弱', '错误率', '正确率', '分析', '弱点'])) {
      return { intent: 'analyze_weakness', confidence: 0.9 };
    }
    if (this.matchKeywords(msg, ['生成计划', '学习计划', '复习计划', '天专项', '天计划', '制定计划'])) {
      const daysMatch = msg.match(/(\d+)\s*天/);
      return {
        intent: 'generate_plan',
        confidence: 0.9,
        params: { days: daysMatch ? parseInt(daysMatch[1]) : 15 }
      };
    }
    if (this.matchKeywords(msg, ['整体情况', '总体情况', '学习情况', '学习状态', '做题记录', '做题情况'])) {
      return { intent: 'view_overall', confidence: 0.9 };
    }
    if (this.matchKeywords(msg, ['离上岸', '还有多远', '上岸', '目标', '差距', '进度'])) {
      return { intent: 'check_progress', confidence: 0.85 };
    }
    if (this.matchKeywords(msg, ['怎么学', '怎么复习', '学习建议', '复习建议', '接下来'])) {
      return { intent: 'study_advice', confidence: 0.8 };
    }

    // 默认普通聊天
    return { intent: 'general_chat', confidence: 0.5 };
  }

  private matchKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
  }

  /**
   * 处理：分析弱项（AI智能分析错题内容）
   */
  private async handleAnalyzeWeakness(context: UserContext, message: string): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const stats = await this.wrongNotebookService.getStats(context.userId);

    // 计算正确率
    const practiceStats = await this.practiceService.getUserStats(context.userId);
    const accuracy = practiceStats.totalAnswered > 0
      ? Math.round((practiceStats.correctCount / practiceStats.totalAnswered) * 100)
      : 0;

    // 如果没有错题，直接返回
    if (stats.totalWrong === 0) {
      return {
        blocks: [
          { type: 'text', content: `${this.getUserRef(context.displayName, context.persona, context.gender)}还没有错题记录哦！多做一些练习后再来看看弱项分析吧！${this.pickRandom(persona.emojis)}` },
          {
            type: 'action_buttons',
            buttons: [
              { id: 'practice', label: '开始练习', action: 'navigate', payload: { page: '/pages/study/index' }, primary: true },
            ],
          },
        ],
        suggestions: ['看看我的整体情况', '生成学习计划'],
      };
    }

    // 获取错题内容用于AI分析
    const wrongsWithContent = await this.wrongNotebookService.getWrongsWithContent(context.userId, 15);

    // 使用LLM分析错题内容，总结知识点弱项
    const analysisResult = await this.analyzeWrongsWithLLM(wrongsWithContent, accuracy);

    const greeting = this.pickRandom(persona.greetings);
    const emoji = this.pickRandom(persona.emojis);
    const statusText = accuracy < 70 ? '确实还有提升空间呀。' : '表现不错呀！';

    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: `${greeting}${emoji} ${persona.selfRef}看了${this.getUserRef(context.displayName, context.persona, context.gender)}最近的做题记录，共有 ${stats.totalWrong} 道错题。${accuracy > 0 ? `整体正确率是 ${accuracy}%，` : ''}${statusText}`,
      },
    ];

    // 添加AI分析结果（进度卡片）
    if (analysisResult.weaknesses.length > 0) {
      blocks.push({
        type: 'progress_card',
        title: '🎯 弱项分布',
        items: analysisResult.weaknesses.map((w, index) => {
          const colors = ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#4DABF7'];
          return {
            label: w.name,
            value: w.severity,
            color: colors[index % colors.length],
          };
        }),
      });

      blocks.push({
        type: 'text',
        content: analysisResult.summary,
      });

      blocks.push({
        type: 'action_buttons',
        buttons: [
          { id: 'gen_plan_15', label: '生成15天专项', action: 'generate_plan', payload: { days: 15 }, primary: true },
          { id: 'view_detail', label: '查看错题本', action: 'navigate', payload: { page: '/pages/wrong-book/index' } },
        ],
      });
    } else {
      blocks.push({
        type: 'text',
        content: analysisResult.summary || `${this.pickRandom(persona.encouragements)}${persona.selfRef}会持续分析${this.getUserRef(context.displayName, context.persona, context.gender)}的学习情况！`,
      });
    }

    return {
      blocks,
      suggestions: ['生成学习计划', '看看我的整体情况', '接下来20天怎么学？'],
    };
  }

  /**
   * 使用LLM分析错题内容，总结知识点弱项
   */
  private async analyzeWrongsWithLLM(
    wrongs: Array<{ stem: string; wrongCount: number; questionSetTitle?: string }>,
    accuracy: number,
  ): Promise<{
    weaknesses: Array<{ name: string; severity: number }>;
    summary: string;
  }> {
    if (wrongs.length === 0) {
      return { weaknesses: [], summary: '暂无错题数据' };
    }

    // 构建错题内容摘要
    const wrongsSummary = wrongs.slice(0, 10).map((w, i) =>
      `${i + 1}. [${w.questionSetTitle || '未分类'}] ${w.stem.substring(0, 100)}${w.stem.length > 100 ? '...' : ''} (错${w.wrongCount}次)`
    ).join('\n');

    const systemPrompt = `你是一个考研学习分析助手。根据学生的错题列表，分析其知识点弱项。

输出要求（严格用JSON）:
{
  "weaknesses": [
    { "name": "知识点名称(简短)", "severity": 80 }
  ],
  "summary": "一句话总结+鼓励，不超过50字"
}

规则：
1. weaknesses最多5个，severity从100(最弱)到20(较弱)
2. 根据题目内容推断知识点，名称简洁(不超过8字)
3. 相似错题归类为同一知识点
4. summary要温暖鼓励，指出最弱项
只返回JSON，不要其他内容。`;

    const userContent = `学生正确率: ${accuracy}%
错题列表:
${wrongsSummary}`;

    try {
      //  使用错误恢复机制
      const response = await this.callLLMWithRecovery([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ]);

      // 解析JSON
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        weaknesses: (result.weaknesses || []).slice(0, 5),
        summary: result.summary || '继续加油！',
      };
    } catch (err) {
      this.logger.error('LLM analysis failed', err);
      // 回退方案：根据题集分类
      const setGroups: Record<string, number> = {};
      wrongs.forEach(w => {
        const key = w.questionSetTitle || '未分类';
        setGroups[key] = (setGroups[key] || 0) + 1;
      });
      const fallbackWeaknesses = Object.entries(setGroups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count], index) => ({
          name,
          severity: Math.max(20, 100 - index * 15),
        }));
      return {
        weaknesses: fallbackWeaknesses,
        summary: `你在「${fallbackWeaknesses[0]?.name || '这些题目'}」方面需要加强，加油！`,
      };
    }
  }

  /**
   * 处理：生成学习计划（真正保存到数据库）
   */
  private async handleGeneratePlan(context: UserContext, params?: { days?: number }): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const days = params?.days || 15;

    // 获取错题内容用于分析
    const wrongsWithContent = await this.wrongNotebookService.getWrongsWithContent(context.userId, 15);
    const stats = await this.wrongNotebookService.getStats(context.userId);

    // 使用LLM生成计划
    const planData = await this.generatePlanWithLLM(wrongsWithContent, days);

    // 保存计划到数据库
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days - 1);

    try {
      const savedPlan = await this.studyPlansService.createPlan({
        title: planData.title || `${days}天专项攻克计划`,
        description: planData.summary || '根据你的弱项分析定制',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        planType: 'weakness_focus',
        tasks: planData.tasks.map((task, index) => {
          const taskDate = new Date(startDate);
          taskDate.setDate(taskDate.getDate() + Math.floor(index * days / planData.tasks.length));
          return {
            title: task.title,
            description: task.description,
            taskDate: taskDate.toISOString(),
            taskType: task.taskType || 'practice',
            metadata: task.metadata,
          };
        }),
      }, context.userId);

      const greeting = this.pickRandom(persona.greetings);
      const emoji = this.pickRandom(persona.emojis);
      const encouragement = this.pickRandom(persona.encouragements);

      const blocks: ContentBlock[] = [
        {
          type: 'text',
          content: `${greeting}${emoji} ${persona.selfRef}根据${this.getUserRef(context.displayName, context.persona, context.gender)}的弱项数据，定制了一份 ${days} 天的专项攻克计划 📚`,
        },
        {
          type: 'plan_preview',
          title: savedPlan.title,
          days,
          summary: planData.summary || '全面复习巩固',
        },
        {
          type: 'text',
          content: `计划已保存到「我的学习计划」，共 ${savedPlan.tasks?.length || 0} 个任务。${persona.selfRef}会提醒${this.getUserRef(context.displayName, context.persona, context.gender)}完成当日任务，${encouragement}`,
        },
        {
          type: 'action_buttons',
          buttons: [
            { id: 'view_plan', label: '查看完整计划', action: 'navigate', payload: { page: '/pages/my-plans/index' }, primary: true },
            { id: 'start_practice', label: '立即开始练习', action: 'navigate', payload: { page: '/pages/study/index' } },
          ],
        },
      ];

      return {
        blocks,
        suggestions: ['看看我的弱项分析', '我离上岸还有多远？'],
      };
    } catch (err) {
      this.logger.error('Failed to save plan', err);
      return {
        blocks: [
          { type: 'text', content: '抱歉，生成计划时出了点问题，请稍后再试～' },
        ],
        suggestions: ['再试一次', '分析我的弱项'],
      };
    }
  }

  /**
   * 使用LLM生成学习计划
   */
  private async generatePlanWithLLM(
    wrongs: Array<{ stem: string; wrongCount: number; questionSetTitle?: string }>,
    days: number,
  ): Promise<{
    title: string;
    summary: string;
    tasks: Array<{ title: string; description?: string; taskType?: string; metadata?: any }>;
  }> {
    // 构建错题摘要
    const wrongsSummary = wrongs.slice(0, 8).map((w, i) =>
      `${i + 1}. [${w.questionSetTitle || '未分类'}] ${w.stem.substring(0, 60)}... (错${w.wrongCount}次)`
    ).join('\n');

    const systemPrompt = `你是一个考研学习规划助手。根据学生的错题数据，生成一个${days}天的学习计划。

输出要求（严格JSON）:
{
  "title": "计划标题(简短有力)",
  "summary": "一句话描述重点",
  "tasks": [
    { "title": "任务名称", "description": "具体内容", "taskType": "practice" }
  ]
}

规则：
1. 根据错题分析弱项，生成针对性任务
2. tasks数量等于天数(${days}个)
3. taskType可选: practice(练习), review(复习), weak_focus(弱项攻克)
4. 任务标题简洁明确，不超过20字
只返回JSON。`;

    const userContent = wrongs.length > 0
      ? `学生错题列表:
${wrongsSummary}

请生成${days}天学习计划`
      : `学生暂无错题记录，请生成${days}天基础巩固计划`;

    try {
      //  使用错误恢复机制
      const response = await this.callLLMWithRecovery([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ]);

      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        title: result.title || `${days}天专项计划`,
        summary: result.summary || '全面复习巩固',
        tasks: (result.tasks || []).slice(0, days),
      };
    } catch (err) {
      this.logger.error('LLM plan generation failed', err);
      // 回退方案：生成默认计划
      const defaultTasks: Array<{ title: string; description?: string; taskType?: string; metadata?: any }> = [];
      for (let i = 0; i < days; i++) {
        defaultTasks.push({
          title: `第${i + 1}天: 基础练习`,
          description: '完成当日练习任务',
          taskType: 'practice',
        });
      }
      return {
        title: `${days}天基础巩固计划`,
        summary: '系统复习，稳步提升',
        tasks: defaultTasks,
      };
    }
  }

  /**
   * 处理：查看整体情况
   */
  private async handleViewOverall(context: UserContext): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const stats = await this.wrongNotebookService.getStats(context.userId);
    const practiceStats = await this.practiceService.getUserStats(context.userId);
    const user = await this.usersService.findById(context.userId);

    const accuracy = practiceStats.totalAnswered > 0
      ? Math.round((practiceStats.correctCount / practiceStats.totalAnswered) * 100)
      : 0;

    const greeting = this.pickRandom(persona.greetings);
    const emoji = this.pickRandom(persona.emojis);

    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: `${greeting}${emoji} ${persona.selfRef}来看看${this.getUserRef(context.displayName, context.persona, context.gender)}的整体学习情况...`,
      },
      {
        type: 'stats_card',
        title: '📈 学习数据统计',
        stats: [
          { label: '总做题数', value: practiceStats.totalAnswered || 0 },
          { label: '正确率', value: `${accuracy}%`, trend: accuracy >= 60 ? 'up' : 'down' },
          { label: '错题数', value: stats.totalWrong || 0 },
          { label: '目标院校', value: user?.targetSchool || '未设置' },
        ],
      },
    ];

    if (stats.topTags.length > 0) {
      blocks.push({
        type: 'text',
        content: `${this.getUserRef(context.displayName, context.persona, context.gender)}在「${stats.topTags[0]?.name || '基础知识'}」方面需要加强，${persona.selfRef}建议重点复习这部分内容哦~`,
      });
    }

    blocks.push({
      type: 'action_buttons',
      buttons: [
        { id: 'analyze', label: '分析我的弱项', action: 'analyze_weakness', primary: true },
        { id: 'practice', label: '开始刷题', action: 'navigate', payload: { page: '/pages/study/index' } },
      ],
    });

    return {
      blocks,
      suggestions: ['分析我的弱项', '帮我生成复习计划', '我离上岸还有多远？'],
    };
  }

  /**
   * 处理：检查进度/离上岸多远
   */
  private async handleCheckProgress(context: UserContext): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const user = await this.usersService.findById(context.userId);
    const practiceStats = await this.practiceService.getUserStats(context.userId);

    const accuracy = practiceStats.totalAnswered > 0
      ? Math.round((practiceStats.correctCount / practiceStats.totalAnswered) * 100)
      : 0;

    // ✅ 使用统一的时间计算方法
    const daysLeft = this.calculateDaysLeft();

    const targetSchool = user?.targetSchool || '目标院校';
    const emoji = this.pickRandom(persona.emojis);
    const encouragement = this.pickRandom(persona.encouragements);

    const progressText = accuracy >= 80
      ? `${this.getUserRef(context.displayName, context.persona, context.gender)}的复习进度很棒！${encouragement}`
      : accuracy >= 60
        ? `${this.getUserRef(context.displayName, context.persona, context.gender)}的基础不错，但还需要加强薄弱环节。`
        : `还需要更多努力，但${persona.selfRef}相信${this.getUserRef(context.displayName, context.persona, context.gender)}一定能行！`;

    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: `距离考研还有 **${daysLeft}** 天，目标是「${targetSchool}」${emoji} ${progressText}`,
      },
      {
        type: 'stats_card',
        title: '🎯 上岸进度',
        stats: [
          { label: '距离考研', value: `${daysLeft}天` },
          { label: '当前正确率', value: `${accuracy}%` },
          { label: '建议正确率', value: '80%+' },
          { label: '差距', value: accuracy >= 80 ? '已达标 ✅' : `${80 - accuracy}%` },
        ],
      },
      {
        type: 'text',
        content: daysLeft > 100
          ? `时间还很充裕，${persona.selfRef}帮${this.getUserRef(context.displayName, context.persona, context.gender)}制定好计划稳步推进！`
          : daysLeft > 30
            ? `进入冲刺阶段了，${this.getUserRef(context.displayName, context.persona, context.gender)}要抓紧时间查漏补缺！`
            : `最后冲刺！${persona.selfRef}相信${this.getUserRef(context.displayName, context.persona, context.gender)}可以的！💪`,
      },
      {
        type: 'action_buttons',
        buttons: [
          { id: 'gen_plan', label: '生成冲刺计划', action: 'generate_plan', payload: { days: Math.min(daysLeft, 30) }, primary: true },
          { id: 'analyze', label: '分析弱项', action: 'analyze_weakness' },
        ],
      },
    ];

    return {
      blocks,
      suggestions: ['帮我分析弱项', '生成学习计划', '接下来怎么复习？'],
    };
  }

  /**
   * 处理：学习建议
   */
  private async handleStudyAdvice(
    context: UserContext,
    message: string,
    history: ChatMessage[],
  ): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const stats = await this.wrongNotebookService.getStats(context.userId);
    const daysLeft = this.calculateDaysLeft();

    // ✅ 使用静态系统提示（可被KV缓存）
    const staticSystemPrompt = persona.staticSystemPrompt;

    // ✅ 动态信息追加到消息末尾
    let dynamicContextParts: string[] = [];

    dynamicContextParts.push(this.buildDynamicContext({
      personaKey: context.persona,
      displayName: context.displayName,
      gender: context.gender,
      daysLeft,
      stats: {
        totalWrong: stats.totalWrong,
        topKnowledgePoints: stats.topKnowledgePoints,
      },
    }));

    // ✅ 阶段三优化：复述当前目标到上下文末尾
    const currentGoals = await this.goalTrackingService.getCurrentGoals(context.userId, 3);
    if (currentGoals.length > 0) {
      const goalSummary = this.goalTrackingService.buildGoalSummary(currentGoals);
      dynamicContextParts.push(goalSummary);
    }

    const dynamicContext = dynamicContextParts.join('\n');

    // ✅ 使用完整历史，避免slice（实现只追加策略）
    // 如果前端没有传入历史，从数据库加载（限制最近50条以控制上下文长度）
    const fullHistory = history.length > 0
      ? history
      : await this.chatMemoryService.getContextWindow(context.userId, 50);

    const messages: ChatMessage[] = [
      { role: 'system', content: staticSystemPrompt }, // ✅ 静态部分（可缓存）
      ...fullHistory, // ✅ 完整历史（不使用slice，利用KV缓存）
      { role: 'system', content: `${dynamicContext}请不超过100字回复。` }, // ✅ 动态部分（追加）
      { role: 'user', content: message },
    ];

    // ✅ 使用错误恢复机制
    const reply = await this.callLLMWithRecovery(messages, context);

    const blocks: ContentBlock[] = [
      { type: 'text', content: reply },
      {
        type: 'action_buttons',
        buttons: [
          { id: 'gen_plan', label: '生成学习计划', action: 'generate_plan', primary: true },
          { id: 'practice', label: '开始练习', action: 'navigate', payload: { page: '/pages/study/index' } },
        ],
      },
    ];

    return {
      blocks,
      suggestions: ['分析我的弱项', '看看整体情况', '离上岸还有多远？'],
      emotion: 'happy', // 学习建议通常是鼓励性的
    };
  }

  /**
   * 处理：普通聊天
   */
  private async handleGeneralChat(
    context: UserContext,
    message: string,
    history: ChatMessage[],
  ): Promise<AgentResponse> {
    const persona = this.getPersona(context.persona);
    const daysLeft = this.calculateDaysLeft();

    // ✅ 使用静态系统提示（可被KV缓存）
    const staticSystemPrompt = `${persona.staticSystemPrompt}
做一个好的朋友，耐心倾听和陪伴用户。`;

    // ✅ 构建动态记忆上下文
    let memoryContext = '';

    // 1. 获取初识记忆
    const firstMemory = await this.chatMemoryService.getFirstMemory(context.userId);
    if (firstMemory) {
      // ✅ 使用预格式化的日期（优先）或fallback到ISO格式
      const dateStr = firstMemory.formattedDate || firstMemory.createdAt.toISOString().split('T')[0];
      memoryContext += `
【长期记忆 - 初识】
- 认识时间: ${dateStr}
- 第一句话: "${firstMemory.content}"
- 请永远记得这段初识。
`;
    }

    // 2. 获取重要历史时刻（记忆压缩摘要）
    const importantMemories = await this.chatMemoryService.getImportantMemories(context.userId, 5);
    if (importantMemories.length > 0) {
      memoryContext += `
【长期记忆 - 重要时刻】
${importantMemories.map(m => {
        // ✅ 使用预格式化的日期（优先）
        const dateStr = m.formattedDate || m.createdAt.toISOString().split('T')[0];
        return `- ${dateStr}: ${m.summary || m.content}`;
      }).join('\n')}
请在对话中自然地关联这些过去的共同回忆。
`;
    }

    // 3. 获取学习进步数据
    const studyStats = await this.wrongNotebookService.getStats(context.userId);
    if (studyStats) {
      const topTags = studyStats.topTags.slice(0, 3).map(t => `${t.name}(${t.count}题)`).join('、');
      memoryContext += `
【当前学习状态】
- 累计错题: ${studyStats.totalWrong}次
- 重点关注: ${topTags || '暂无'}
- 提示: 这是一个陪伴式AI，请关注用户的学习进步，并在适当时候给予鼓励或提醒。
`;
    }

    // 4. ✅ 阶段三优化：获取并复述当前目标
    // 类似Manus的todo.md，将目标推入上下文末尾
    const currentGoals = await this.goalTrackingService.getCurrentGoals(context.userId, 5);
    if (currentGoals.length > 0) {
      const goalSummary = this.goalTrackingService.buildGoalSummary(currentGoals);
      memoryContext += goalSummary;
      memoryContext += '提示: 在对话中自然关联用户的这些目标，适时提醒或鼓励进度。\n';
    }

    // 5. 时间和人设信息
    const dynamicContext = this.buildDynamicContext({
      personaKey: context.persona,
      displayName: context.displayName,
      gender: context.gender,
      daysLeft,
    });

    memoryContext += `
${dynamicContext}
【回复要求】
- 回复简洁（不超过50字）
- 根据剩余天数调整建议的紧迫感
`;

    // 简单的里程碑检测与记录（异步执行，不阻塞回复）
    this.checkAndRecordMilestone(context.userId, message);

    // ✅ 使用完整历史，避免slice（实现只追加策略）
    const fullHistory = history.length > 0
      ? history
      : await this.chatMemoryService.getContextWindow(context.userId, 100);

    // ✅ 优化后的消息结构
    const messages: ChatMessage[] = [
      { role: 'system', content: staticSystemPrompt }, // ✅ 静态部分（可缓存）
      ...fullHistory, // ✅ 完整历史（不使用slice，利用KV缓存）
      { role: 'system', content: memoryContext }, // ✅ 动态部分（追加）
      { role: 'user', content: message },
    ];

    // ✅ 使用错误恢复机制
    const reply = await this.callLLMWithRecovery(messages, context);

    return {
      blocks: [{ type: 'text', content: reply }],
      suggestions: ['分析我的弱项', '我离上岸还有多远？', '看看我的整体情况'],
    };
  }

  /**
   * 简单的里程碑检测与记录
   * 如果检测到用户表达了成就或进步，将其标记为重要记忆
   */
  private async checkAndRecordMilestone(userId: string, message: string) {
    const milestonesKeywords = ['考了', '通过了', '做完了', '进步了', '拿到了', '成功了', '第一名', '满分'];
    const isMilestone = milestonesKeywords.some(keyword => message.includes(keyword));

    if (isMilestone) {
      // 保存为重要记忆，不需要回复内容，只需要标记这条用户消息
      // 注意：实际的保存逻辑是在 controller 层调用的 chatMemoryService.saveMessage
      // 这里我们需要更新刚刚保存的那条消息的重要性，或者新建一条摘要
      // 由于拿不到刚刚保存的 messageId，我们这里简化处理：
      // 直接创建一条 system 类型的“旁白”记忆，记录这个里程碑
      await this.chatMemoryService.saveMessage(userId, 'assistant', `[系统记录] 用户达成里程碑事件：${message}`, {
        importance: 9,
        tags: ['milestone'],
        summary: `用户达成成就: ${message.slice(0, 50)}...`,
      });
    }
  }
}
