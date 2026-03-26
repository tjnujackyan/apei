import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AnalyzeDto } from './dto/analyze.dto';
import type { ChatDto } from './dto/chat.dto';
import type { GeneratePlanDto } from './dto/generate-plan.dto';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { LLM_CLIENT_TOKEN } from './ai-brain.tokens';
import type { LlmClient, ChatMessage } from './interfaces/llm-client';
import { WrongNotebookService } from '../wrong-notebook/wrong-notebook.service';
import { stableStringify } from './utils/stable-json.util';

@Injectable()
export class AiBrainService {
  private readonly logger = new Logger(AiBrainService.name);

  constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llm: LlmClient,
    private readonly wrongNotebookService: WrongNotebookService,
  ) {}

  async chat(dto: ChatDto, user: RequestUser) {
    this.logger.debug(`Chatting with LLM for user ${user.userId}`);
    // Append system prompt if not present or just pass through
    const messages: ChatMessage[] = dto.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // ✅ 使用静态系统提示（可被KV缓存）
    if (!messages.find((m) => m.role === 'system')) {
      const staticSystemPrompt = `You are apei, a witty and rebellious AI assistant for postgraduate entrance exam (Kaoyan) students.
Your style is minimalist, direct, and slightly humorous.
Answer in Chinese unless asked otherwise.`;
      
      messages.unshift({
        role: 'system',
        content: staticSystemPrompt,
      });
      
      // ✅ 动态信息追加到末尾（如果需要）
      if (user.persona && user.persona !== 'Student') {
        messages.push({
          role: 'system',
          content: `[用户人设: ${user.persona}]`,
        });
      }
    }

    const output = await this.llm.chat(messages);
    return { content: output };
  }

  async analyze(dto: AnalyzeDto, user: RequestUser) {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是阿陪的AI考研大脑，请以结构化要点输出学习建议，包含阶段目标、优先级、每日行动。语言简洁。',
      },
      {
        role: 'user',
        // ✅ 使用稳定的JSON序列化（键排序一致）
        content: stableStringify(
          {
            objective: dto.objective,
            persona: user.persona,
            recentStats: dto.recentStats,
            constraints: dto.constraints,
            days: dto.days ?? 15,
          },
          2,
        ),
      },
    ];

    this.logger.debug(`Calling LLM for user ${user.userId}`);
    const output = await this.llm.chat(messages);
    return { output };
  }

  async generateStudyPlan(dto: GeneratePlanDto, user: RequestUser) {
    // 1. Fetch user weakness data
    const stats = await this.wrongNotebookService.getStats(user.userId);

    // 2. Construct Prompt
    const systemPrompt = `
You are an expert Study Planner AI for postgraduate entrance exams (Kaoyan).
Your task is to generate a structured ${dto.days}-day study plan based on the user's weakness profile.
The plan must be strictly in JSON format.

User Profile:
- Persona: ${user.persona || 'Standard Student'}
- Total Wrong Questions: ${stats.totalWrong}
- Top Weakness Tags: ${stats.topTags.map((t) => `${t.name} (${t.count})`).join(', ')}
- Top Weakness Knowledge Points: ${stats.topKnowledgePoints.map((k) => `${k.name} (${k.count})`).join(', ')}
${dto.subject ? `- Focus Subject: ${dto.subject}` : ''}

Output Format (JSON Array):
[
  {
    "day": 1,
    "theme": "Weakness Breakthrough - [Tag/Topic]",
    "tasks": [
      { "type": "review", "content": "Review [Specific Knowledge Point]", "duration_mins": 30 },
      { "type": "practice", "content": "Do 10 exercises on [Topic]", "duration_mins": 45 }
    ]
  },
  ...
]
Only return the JSON array. No markdown, no commentary.
`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the plan now.' },
    ];

    // 3. Call LLM
    this.logger.debug(
      `Generating plan for user ${user.userId} with stats`,
      stats,
    );
    const rawOutput = await this.llm.chat(messages);

    // 4. Parse/Clean Output (basic)
    let plan = [];
    try {
      // Remove markdown code blocks if present
      const cleanJson = rawOutput
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      plan = JSON.parse(cleanJson);
    } catch (e) {
      this.logger.error('Failed to parse LLM plan output', e);
      // Fallback or return raw text wrapped
      return { raw: rawOutput, error: 'Parse failed' };
    }

    return { plan };
  }

  async generateQuestionsFromText(
    text: string,
    count: number,
    types: string[],
    difficulty: number = 1,
  ) {
    // 预处理：提取答案页并与题目关联
    const { questionsText, answersText } = this.extractAnswerSection(text);
    
    // 智能 prompt：支持提取和转换
    const systemPrompt = `你是一个专业的考试题目提取和转换专家。

【任务】从试卷文本中提取或生成 ${count} 道选择题。

【处理策略】
1. **如果文本中有标准选择题**（带A/B/C/D选项）：
   - 直接提取题干和选项
   - 保持原文内容不变

2. **如果文本是填空题**（带下划线或空格）：
   - 将填空题转换为选择题格式
   - 根据填空内容生成4个选项（1个正确答案 + 3个合理的干扰项）

3. **如果文本是判断题或简答题**：
   - 转换为相应的选择题格式

【特别注意：处理分页和代码】
- **代码题目**：如果题目包含代码片段，务必在 stem 中包含**完整的代码**
- **分页处理**：PDF 解析可能导致代码或题干被分割，你需要：
  ① 识别并合并被分割的内容（通常编号连续或代码不完整）
  ② 将完整的代码块放入题干中
  ③ 确保用户看到题干就能理解题目，不需要额外信息

【输出格式】严格的 JSON 数组：
[
  {
    "stem": "题干（必须包含完整信息，如果有代码要包含完整代码）",
    "type": "single",
    "options": [
      { "label": "A", "content": "选项A内容", "isCorrect": true },
      { "label": "B", "content": "选项B内容", "isCorrect": false },
      { "label": "C", "content": "选项C内容", "isCorrect": false },
      { "label": "D", "content": "选项D内容", "isCorrect": false }
    ],
    "answerExplanation": "答案：A",
    "difficulty": ${difficulty},
    "knowledgeTags": []
  }
]

【质量标准】
- 题干必须**自包含**：用户只看题干就能答题
- 代码必须**完整可读**
- 选项必须**清晰独立**
- 只返回 JSON 数组，无其他内容
`;

    // 智能截取：保留题目部分和答案部分
    const normalized = this.normalizeMaterial(questionsText);
    const normalizedAnswers = this.normalizeMaterial(answersText);
    
    // 加大字符限制到 30000（豆包支持大上下文）
    const maxQuestionLen = 25000;
    const truncatedQuestions = normalized.length > maxQuestionLen 
      ? normalized.substring(0, maxQuestionLen) + '\n[...题目内容已截断...]' 
      : normalized;
    
    // 答案部分通常较短，保留完整
    const truncatedAnswers = normalizedAnswers.length > 5000 
      ? normalizedAnswers.substring(0, 5000) 
      : normalizedAnswers;

    // 添加一个few-shot示例来引导AI
    const exampleMessage: ChatMessage = {
      role: 'assistant',
      // ✅ 使用稳定的JSON序列化
      content: stableStringify([
        {
          stem: "示例题干：什么是数据结构？",
          type: "single",
          options: [
            { label: "A", content: "一种编程语言", isCorrect: false },
            { label: "B", content: "数据的组织方式", isCorrect: true },
            { label: "C", content: "一种算法", isCorrect: false },
            { label: "D", content: "一种软件", isCorrect: false }
          ],
          answerExplanation: "答案：B",
          difficulty: difficulty,
          knowledgeTags: []
        }
      ])
    };
    
    // 构建用户内容，添加明确的提示
    let userContent = '';
    
    if (answersText) {
      userContent = `【试卷内容】
${truncatedQuestions}

【答案部分】
${truncatedAnswers}

请分析上述内容，生成 ${count} 道选择题：

**核心要求**：
1. 题干必须**完整自包含** - 用户只看题干就能答题
2. 如果题目包含代码，必须在题干中包含**完整的代码**（不要截断）
3. 合并被分页分割的内容（识别编号连续性）
4. 根据答案部分标记正确选项

**题型处理**：
- 选择题 → 直接提取完整内容
- 填空题 → 转换为选择题（1正确+3干扰项）
- 代码题 → 确保代码完整可读

直接返回 JSON 数组！`;
    } else {
      userContent = `【试卷内容】
${truncatedQuestions}

请分析上述内容，生成 ${count} 道选择题：

**核心要求（重要！）**：
1. 题干必须**完整自包含** - 用户只看题干就能答题
2. 如果题目包含代码，必须在题干中包含**完整的代码**
3. 合并被分页分割的内容：
   - 识别不完整的代码块（如函数定义被截断）
   - 查找后续内容并合并
   - 确保逻辑连贯

**识别题型**：
- "A. B. C. D." → 选择题，提取完整内容
- "___" 或空格 → 填空题，转换为选择题
- 代码片段 → 确保包含完整代码

**质量检查**：
✓ 题干是否完整？
✓ 代码是否可读？
✓ 选项是否清晰？
✓ 用户能否独立答题？

直接返回 JSON 数组！`;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请看这个示例：' },
      exampleMessage,
      { role: 'user', content: userContent },
    ];

    // 记录发送给 AI 的内容
    this.logger.debug(`Sending to AI - System prompt: ${systemPrompt.length} chars, User content: ${userContent.length} chars`);
    this.logger.debug(`Questions text preview: ${questionsText.substring(0, 300)}...`);

    this.logger.debug(`Generating ${count} questions via LLM...`);
    const rawOutput = await this.llm.chat(messages);

    // 详细记录 AI 返回内容
    this.logger.debug(`AI raw output (${rawOutput.length} chars): ${rawOutput}`);

    let questions = [] as any[];
    let cleaned = rawOutput
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    
    this.logger.debug(`Cleaned output (${cleaned.length} chars): ${cleaned}`);
    
    // 尝试解析JSON
    try {
      questions = this.parseJsonWithFallback(cleaned);
      this.logger.log(`Parsed ${questions.length} questions successfully`);
      
      // 如果返回空数组，记录更多信息
      if (questions.length === 0) {
        this.logger.warn('AI returned empty array. This may indicate:');
        this.logger.warn('1. No questions found in the text');
        this.logger.warn('2. Text format not recognized by AI');
        this.logger.warn('3. AI safety filters blocking content');
        this.logger.warn(`Original text length: ${text.length}, Questions part: ${questionsText.length}`);
      }
    } catch (error) {
      this.logger.error(`Failed to parse questions: ${error.message}`);
      this.logger.debug(`Problematic output: ${cleaned}`);
      throw new Error(`JSON解析失败: ${error.message}`);
    }

    // Filter unsupported types
    const allowedTypes = ['single', 'multiple', 'true_false'];
    questions = questions.filter((q) => {
        // Validate options presence for choice types
        if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length < 2)) {
            return false;
        }
        return allowedTypes.includes(q.type);
    });

    return questions;
  }

  /**
   * 增强的JSON解析，处理常见的格式错误
   */
  private parseJsonWithFallback(text: string): any[] {
    // 第一次尝试: 直接解析
    try {
      return JSON.parse(text);
    } catch (e) {
      this.logger.debug('Direct JSON parse failed, trying extraction...');
    }

    // 第二次尝试: 提取JSON数组部分
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      let jsonStr = match[0];
      
      // 修复常见的转义字符问题
      jsonStr = this.fixJsonEscaping(jsonStr);
      
      try {
        return JSON.parse(jsonStr);
      } catch (e2) {
        this.logger.debug('JSON extraction failed, trying aggressive fix...');
        
        // 第三次尝试: 更激进的修复
        try {
          jsonStr = this.aggressiveJsonFix(match[0]);
          return JSON.parse(jsonStr);
        } catch (e3) {
          this.logger.error('All JSON parse attempts failed', e3);
          this.logger.debug('Raw output (first 500 chars):', text.substring(0, 500));
          throw new Error('AI generation failed to produce valid JSON');
        }
      }
    }

    this.logger.error('No JSON array found in LLM output');
    throw new Error('AI generation failed to produce valid JSON');
  }

  /**
   * 修复常见的JSON转义字符问题
   */
  private fixJsonEscaping(jsonStr: string): string {
    return jsonStr
      // 修复未转义的反斜杠 (但保留有效的转义序列)
      .replace(/\\(?!["\\nrtbfu])/g, '\\\\')
      // 修复字符串中的换行符
      .replace(/([^\\])\n/g, '$1\\n')
      .replace(/([^\\])\r/g, '$1\\r')
      .replace(/([^\\])\t/g, '$1\\t')
      // 修复开头的换行符
      .replace(/^\n/gm, '\\n')
      .replace(/^\r/gm, '\\r');
  }

  /**
   * 更激进的JSON修复
   */
  private aggressiveJsonFix(jsonStr: string): string {
    // 尝试逐个对象提取并重建数组
    const objects: any[] = [];
    
    // 匹配每个对象 {...}
    const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = jsonStr.match(objectPattern);
    
    if (matches) {
      for (const objStr of matches) {
        try {
          // 尝试解析单个对象
          const fixed = objStr
            .replace(/\\(?!["\\nrtbfu])/g, '\\\\')
            .replace(/[\n\r\t]/g, ' ')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']');
          const obj = JSON.parse(fixed);
          if (obj.stem && obj.type) { // 验证是否是题目对象
            objects.push(obj);
          }
        } catch (e) {
          // 跳过解析失败的对象
          this.logger.debug('Skipping malformed object');
        }
      }
    }
    
    if (objects.length > 0) {
      // ✅ 使用稳定的JSON序列化
      return stableStringify(objects);
    }
    
    // 如果还是不行，抛出错误
    throw new Error('Could not extract valid question objects');
  }

  /**
   * 智能提取答案部分
   * 试卷通常分为题目部分和答案部分，答案在末尾
   */
  private extractAnswerSection(text: string): { questionsText: string; answersText: string } {
    if (!text) {
      return { questionsText: '', answersText: '' };
    }

    const minQuestionLength = 500; // 题目部分至少要有500字符
    let questionsText = text;
    let answersText = '';

    // 策略: 从文本后半部分开始查找答案标识，避免匹配到标题
    const halfPoint = Math.floor(text.length * 0.4); // 从40%位置开始搜索
    const searchText = text.substring(halfPoint);

    // 常见的答案页标识模式 - 必须在行首或换行后
    const answerPatterns = [
      /[\n\r]+\s*[“”"]?[^\n\r]*?试题\s*答案/i,    // "试题答案" 或 "“数据结构”期末考试试题答案"
      /[\n\r]+\s*参考答案\s*[\n::：]/i,           // "参考答案"
      /[\n\r]+\s*标准答案\s*[\n::：]/i,           // "标准答案"
      /[\n\r]+\s*答\s*案\s*[\n::：]/i,               // "答 案" (可能有空格)
    ];

    // 在后半部分查找答案标识
    for (const pattern of answerPatterns) {
      const match = searchText.match(pattern);
      if (match && match.index !== undefined) {
        const splitIndex = halfPoint + match.index;
        const potentialQuestions = text.substring(0, splitIndex).trim();
        const potentialAnswers = text.substring(splitIndex).trim();
        
        // 验证: 题目部分必须足够长
        if (potentialQuestions.length >= minQuestionLength) {
          questionsText = potentialQuestions;
          answersText = potentialAnswers;
          this.logger.debug(`Found answer section at position ${splitIndex}, questions: ${questionsText.length} chars`);
          break;
        }
      }
    }

    // 如果没找到明确标识，尝试匹配密集答案列表格式
    // 如: "1.B 2.B 3.C 4.D 5.B 6.A" (多个连续的答案)
    if (!answersText && text.length > 2000) {
      const lastPart = text.slice(-2000);
      
      // 查找密集的答案列表 (至少3个连续的 "数字.字母" 模式)
      const denseAnswerPattern = /(\d+\s*[\.\u3001]\s*[A-Da-d]\s+){3,}/g;
      const matches = [...lastPart.matchAll(denseAnswerPattern)];
      
      if (matches.length > 0) {
        const fullTextLen = text.length;
        const lastPartStart = fullTextLen - 2000;
        const firstMatch = matches[0];
        const answerStartInLastPart = firstMatch.index || 0;
        
        // 向前查找行首
        let lineStart = answerStartInLastPart;
        while (lineStart > 0 && lastPart[lineStart - 1] !== '\n' && lastPart[lineStart - 1] !== '\r') {
          lineStart--;
        }
        
        // 再向前查找可能的标题行 (如 "一、单选题")
        const headerSearchStart = Math.max(0, lineStart - 50);
        const headerContext = lastPart.substring(headerSearchStart, lineStart);
        const headerMatch = headerContext.match(/[\n\r]([^\n\r]*(单选|填空|运算|选择)[^\n\r]*)$/i);
        
        if (headerMatch && headerMatch.index !== undefined) {
          lineStart = headerSearchStart + headerMatch.index;
        }
        
        const splitIndex = lastPartStart + lineStart;
        const potentialQuestions = text.substring(0, splitIndex).trim();
        
        // 验证: 题目部分必须足够长，且分割点在后半部分
        if (potentialQuestions.length >= minQuestionLength && splitIndex > text.length * 0.4) {
          questionsText = potentialQuestions;
          answersText = text.substring(splitIndex).trim();
          this.logger.debug(`Found dense answer list at position ${splitIndex}`);
        }
      }
    }

    this.logger.debug(`Split result - Questions: ${questionsText.length} chars, Answers: ${answersText.length} chars`);
    return { questionsText, answersText };
  }

  private normalizeMaterial(input: string): string {
    let s = input || '';
    
    // 1. 统一换行符
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 2. 移除分页标记（常见格式）
    s = s.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '');
    s = s.replace(/Page\s*\d+\s*of\s*\d+/gi, '');
    s = s.replace(/第\s*\d+\s*页\s*共\s*\d+\s*页/gi, '');
    s = s.replace(/\d+\s*\/\s*\d+/g, ''); // 如 "1/10"
    
    // 3. 移除页眉页脚（常见模式）
    s = s.replace(/^[-=_]{3,}$/gm, ''); // 横线分隔符
    s = s.replace(/^\s*\d+\s*$/gm, ''); // 单独的页码行
    
    // 4. 合并被分割的代码行
    // 识别代码块（通常缩进或包含编程关键字）
    s = s.replace(/(\w+)\s*\n\s*(\()/g, '$1$2'); // 函数名和括号分离：func\n( → func(
    s = s.replace(/(\{)\s*\n\s*(\})/g, '$1$2'); // 空代码块：{\n} → {}
    
    // 5. 标点符号统一
    s = s.replace(/〔/g, '(').replace(/〕/g, ')');
    s = s.replace(/（/g, '(').replace(/）/g, ')');
    s = s.replace(/．/g, '.');
    s = s.replace(/，/g, ',');
    
    // 6. 清理多余空白
    s = s.replace(/[\t ]{2,}/g, ' '); // 多个空格 → 单个空格
    s = s.replace(/\n{3,}/g, '\n\n'); // 多个空行 → 最多2个空行
    
    return s.trim();
  }
}
