import { Inject, Injectable, Logger } from '@nestjs/common';
import { QuestionEntity, QuestionOption } from '../../question-bank/entities/question.entity';
import { LLM_CLIENT_TOKEN } from '../../ai-brain/ai-brain.tokens';
import type { LlmClient, ChatMessage } from '../../ai-brain/interfaces/llm-client';
import { TransformedQuestionDto } from '../dto/transform-question.dto';

/**
 * 变式题生成结果（内部使用）
 */
export interface TransformedQuestion {
  originalQuestionId: string;
  stem: string;
  type: string;
  options: QuestionOption[];
  knowledgeTags: string[];
  answerExplanation: string;
  difficulty: number;
  sourceInfo: string;
  isTransformed: boolean; // 标记是否成功变式，false表示降级返回原题
}

/**
 * LLM 返回的变式题结构
 */
interface LlmTransformResponse {
  stem: string;
  type: string;
  options: {
    label: string;
    content: string;
    isCorrect: boolean;
  }[];
  answerExplanation: string;
  difficulty: number;
}

/**
 * 题目变式生成服务
 * 使用 LLM 对原题进行改写，生成同构变式题
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */
@Injectable()
export class QuestionTransformerService {
  private readonly logger = new Logger(QuestionTransformerService.name);

  // 变式生成系统提示词
  private readonly TRANSFORM_SYSTEM_PROMPT = `你是一个专业的考试题目变式生成专家。你的任务是对给定的题目进行**深度变式改写**，生成一道新的同构题目。

【变式要求 - 重要！】
1. **保持知识点一致**：变式题必须考察与原题相同的核心知识点和概念
2. **实质性改变**：
   - 改变题目的**情境/背景**（如：从"图书馆"改为"超市"，从"学生"改为"员工"）
   - 改变**问题的角度**（如：从"求最大值"改为"求最小值"，从"正向推理"改为"逆向推理"）
   - 改变**具体对象**（如：从"苹果"改为"橙子"，从"汽车"改为"火车"）
   - 不要只是简单地更改数字！
3. **保持难度相当**：变式题的难度应与原题相当
4. **生成新解析**：为变式题生成完整的新答案解析

【禁止行为】
- ❌ 只改变数字而保持其他内容不变
- ❌ 只调整选项顺序
- ❌ 只替换同义词

【鼓励行为】
- ✅ 创造全新的题目情境
- ✅ 使用不同的例子来考察相同概念
- ✅ 从不同角度提问同一知识点

【输出格式】严格的 JSON 对象：
{
  "stem": "变式题题干",
  "type": "题目类型(single/multiple/true_false)",
  "options": [
    { "label": "A", "content": "选项A内容", "isCorrect": true/false },
    { "label": "B", "content": "选项B内容", "isCorrect": true/false },
    { "label": "C", "content": "选项C内容", "isCorrect": true/false },
    { "label": "D", "content": "选项D内容", "isCorrect": true/false }
  ],
  "answerExplanation": "答案解析",
  "difficulty": 难度值(1-5)
}

【注意事项】
- 只返回 JSON 对象，不要包含任何其他内容
- 确保 JSON 格式正确，可以被直接解析
- 选项数量应与原题保持一致
- 必须有且仅有一个正确答案（单选题）或至少一个正确答案（多选题）`;

  constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llm: LlmClient,
  ) {}

  /**
   * 对单道题目进行变式生成
   * 
   * @param question 原题实体
   * @returns 变式题结果
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   */
  async transform(question: QuestionEntity): Promise<TransformedQuestion> {
    this.logger.log(`Transforming question: ${question.id}`);

    try {
      // 1. 构建变式生成 Prompt (Requirement 4.1)
      const prompt = this.buildTransformPrompt(question);

      // 2. 调用 LLM
      const messages: ChatMessage[] = [
        { role: 'system', content: this.TRANSFORM_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ];

      const rawResponse = await this.llm.chat(messages);
      this.logger.debug(`LLM response: ${rawResponse.substring(0, 200)}...`);

      // 3. 解析 LLM 响应
      const parsedResponse = this.parseTransformResponse(rawResponse);

      // 4. 验证变式题完整性 (Requirement 4.2, 4.3, 4.4, 4.5)
      this.validateTransformedQuestion(parsedResponse, question);

      // 5. 构建变式题结果，标注原题来源 (Requirement 4.7)
      const transformed: TransformedQuestion = {
        originalQuestionId: question.id,
        stem: parsedResponse.stem,
        type: parsedResponse.type || question.type,
        options: parsedResponse.options,
        knowledgeTags: question.knowledgeTags, // 保持相同知识点 (Requirement 4.2)
        answerExplanation: parsedResponse.answerExplanation,
        difficulty: parsedResponse.difficulty || question.difficulty || 1,
        sourceInfo: `基于原题 ${question.id} 生成的变式题`, // Requirement 4.7
        isTransformed: true,
      };

      this.logger.log(`Successfully transformed question: ${question.id}`);
      return transformed;

    } catch (error) {
      // 6. LLM 调用失败时的降级处理：返回原题 (Requirement 4.6)
      this.logger.error(`Failed to transform question ${question.id}: ${error.message}`);
      return this.fallbackToOriginal(question);
    }
  }

  /**
   * 批量变式生成
   * 
   * @param questions 原题列表
   * @returns 变式题列表
   */
  async transformBatch(questions: QuestionEntity[]): Promise<TransformedQuestion[]> {
    this.logger.log(`Batch transforming ${questions.length} questions`);

    const results: TransformedQuestion[] = [];
    
    for (const question of questions) {
      const transformed = await this.transform(question);
      results.push(transformed);
    }

    const successCount = results.filter(r => r.isTransformed).length;
    this.logger.log(`Batch transform complete: ${successCount}/${questions.length} successful`);

    return results;
  }

  /**
   * 构建变式生成 Prompt
   * 
   * @param question 原题
   * @returns Prompt 字符串
   */
  private buildTransformPrompt(question: QuestionEntity): string {
    const optionsStr = question.options
      .map(opt => `${opt.label}. ${opt.content}${opt.isCorrect ? ' (正确答案)' : ''}`)
      .join('\n');

    return `请对以下题目进行**深度变式改写**。要求创造一个全新的题目情境，而不是简单地更改数字。

【原题信息】
题干：${question.stem}
类型：${question.type === 'single' ? '单选题' : question.type === 'multiple' ? '多选题' : '判断题'}
选项：
${optionsStr}
知识点：${question.knowledgeTags?.join(', ') || '未标注'}
难度：${question.difficulty || 1}
${question.answerExplanation ? `原答案解析：${question.answerExplanation}` : ''}

【变式要求 - 必须遵守！】
1. **创造全新情境**：使用完全不同的背景故事或场景
2. **保持知识点**：考察相同的核心概念
3. **改变问题角度**：可以从不同方向提问
4. **禁止只改数字**：必须有实质性的内容变化
5. **生成新解析**：为新题目写完整的解析

请以 JSON 格式返回变式题。`;
  }

  /**
   * 解析 LLM 响应
   * 
   * @param rawResponse LLM 原始响应
   * @returns 解析后的变式题结构
   */
  private parseTransformResponse(rawResponse: string): LlmTransformResponse {
    // 清理响应，移除可能的 markdown 代码块标记
    let cleaned = rawResponse
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // 尝试提取 JSON 对象
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in LLM response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed as LlmTransformResponse;
    } catch (error) {
      // 尝试修复常见的 JSON 格式问题
      const fixed = this.fixJsonFormat(jsonMatch[0]);
      return JSON.parse(fixed) as LlmTransformResponse;
    }
  }

  /**
   * 修复常见的 JSON 格式问题
   */
  private fixJsonFormat(jsonStr: string): string {
    return jsonStr
      // 修复未转义的换行符
      .replace(/([^\\])\n/g, '$1\\n')
      .replace(/([^\\])\r/g, '$1\\r')
      .replace(/([^\\])\t/g, '$1\\t')
      // 修复尾部逗号
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
  }

  /**
   * 验证变式题完整性
   * 
   * @param response LLM 响应
   * @param original 原题
   * 
   * Requirements: 4.2, 4.3, 4.4, 4.5
   */
  private validateTransformedQuestion(
    response: LlmTransformResponse,
    original: QuestionEntity,
  ): void {
    // 验证题干存在且与原题不同 (Requirement 4.3)
    if (!response.stem || response.stem.trim().length === 0) {
      throw new Error('Transformed question stem is empty');
    }

    // 验证选项存在且完整
    if (!response.options || response.options.length < 2) {
      throw new Error('Transformed question has insufficient options');
    }

    // 验证有正确答案
    const hasCorrectAnswer = response.options.some(opt => opt.isCorrect);
    if (!hasCorrectAnswer) {
      throw new Error('Transformed question has no correct answer');
    }

    // 验证答案解析存在 (Requirement 4.5)
    if (!response.answerExplanation || response.answerExplanation.trim().length === 0) {
      throw new Error('Transformed question has no answer explanation');
    }

    // 验证题干或选项与原题有差异 (Requirement 4.3)
    const originalOptionsStr = original.options.map(o => o.content).join('');
    const transformedOptionsStr = response.options.map(o => o.content).join('');
    
    if (response.stem === original.stem && transformedOptionsStr === originalOptionsStr) {
      throw new Error('Transformed question is identical to original');
    }
  }

  /**
   * 降级处理：返回原题
   * 当 LLM 调用失败时使用
   * 
   * @param question 原题
   * @returns 原题作为变式题结果
   * 
   * Requirement 4.6
   */
  private fallbackToOriginal(question: QuestionEntity): TransformedQuestion {
    this.logger.warn(`Falling back to original question: ${question.id}`);

    return {
      originalQuestionId: question.id,
      stem: question.stem,
      type: question.type,
      options: question.options,
      knowledgeTags: question.knowledgeTags,
      answerExplanation: question.answerExplanation || '',
      difficulty: question.difficulty || 1,
      sourceInfo: `原题 ${question.id}（变式生成失败，使用原题）`,
      isTransformed: false,
    };
  }

  /**
   * 将 TransformedQuestion 转换为 DTO 格式
   * 
   * @param transformed 内部变式题结果
   * @returns DTO 格式
   */
  toDto(transformed: TransformedQuestion): TransformedQuestionDto {
    return {
      originalQuestionId: transformed.originalQuestionId,
      stem: transformed.stem,
      type: transformed.type,
      options: transformed.options,
      knowledgeTags: transformed.knowledgeTags,
      answerExplanation: transformed.answerExplanation,
      difficulty: transformed.difficulty,
      sourceInfo: transformed.sourceInfo,
    };
  }
}
