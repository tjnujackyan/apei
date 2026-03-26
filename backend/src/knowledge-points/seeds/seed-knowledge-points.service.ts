import { Injectable, Logger } from '@nestjs/common';
import { KnowledgePointsService } from '../knowledge-points.service';

/**
 * 知识点种子数据服务
 * 用于初始化考研常见科目的知识点体系
 */
@Injectable()
export class SeedKnowledgePointsService {
  private readonly logger = new Logger(SeedKnowledgePointsService.name);

  constructor(private readonly kpService: KnowledgePointsService) {}

  /**
   * 初始化所有知识点
   */
  async seed() {
    this.logger.log('开始初始化知识点数据...');

    await this.seedMath();
    await this.seedEnglish();
    await this.seedPolitics();
    await this.seedCS408();

    this.logger.log('知识点数据初始化完成！');
  }

  /**
   * 数学知识点（示例）
   */
  private async seedMath() {
    // 1. 科目
    const math = await this.kpService.create({
      name: '数学',
      description: '考研数学',
      level: 1,
      subjectCode: 'math',
      sortOrder: 1,
    });

    // 2. 章节
    const calculus = await this.kpService.create({
      name: '高等数学',
      level: 2,
      subjectCode: 'math',
      parentId: math.id,
      sortOrder: 1,
    });

    const linearAlgebra = await this.kpService.create({
      name: '线性代数',
      level: 2,
      subjectCode: 'math',
      parentId: math.id,
      sortOrder: 2,
    });

    const probability = await this.kpService.create({
      name: '概率论与数理统计',
      level: 2,
      subjectCode: 'math',
      parentId: math.id,
      sortOrder: 3,
    });

    // 3. 知识点
    await this.kpService.bulkCreate([
      { name: '极限与连续', level: 3, subjectCode: 'math', parentId: calculus.id, sortOrder: 1 },
      { name: '一元函数微分学', level: 3, subjectCode: 'math', parentId: calculus.id, sortOrder: 2 },
      { name: '一元函数积分学', level: 3, subjectCode: 'math', parentId: calculus.id, sortOrder: 3 },
      { name: '多元函数微积分', level: 3, subjectCode: 'math', parentId: calculus.id, sortOrder: 4 },
      { name: '行列式', level: 3, subjectCode: 'math', parentId: linearAlgebra.id, sortOrder: 1 },
      { name: '矩阵', level: 3, subjectCode: 'math', parentId: linearAlgebra.id, sortOrder: 2 },
      { name: '向量', level: 3, subjectCode: 'math', parentId: linearAlgebra.id, sortOrder: 3 },
      { name: '线性方程组', level: 3, subjectCode: 'math', parentId: linearAlgebra.id, sortOrder: 4 },
      { name: '特征值与特征向量', level: 3, subjectCode: 'math', parentId: linearAlgebra.id, sortOrder: 5 },
      { name: '随机事件与概率', level: 3, subjectCode: 'math', parentId: probability.id, sortOrder: 1 },
      { name: '随机变量及其分布', level: 3, subjectCode: 'math', parentId: probability.id, sortOrder: 2 },
      { name: '数字特征', level: 3, subjectCode: 'math', parentId: probability.id, sortOrder: 3 },
    ]);

    this.logger.log('数学知识点初始化完成');
  }

  /**
   * 英语知识点
   */
  private async seedEnglish() {
    const english = await this.kpService.create({
      name: '英语',
      description: '考研英语',
      level: 1,
      subjectCode: 'english',
      sortOrder: 2,
    });

    const vocabulary = await this.kpService.create({
      name: '词汇',
      level: 2,
      subjectCode: 'english',
      parentId: english.id,
      sortOrder: 1,
    });

    const reading = await this.kpService.create({
      name: '阅读理解',
      level: 2,
      subjectCode: 'english',
      parentId: english.id,
      sortOrder: 2,
    });

    const writing = await this.kpService.create({
      name: '写作',
      level: 2,
      subjectCode: 'english',
      parentId: english.id,
      sortOrder: 3,
    });

    await this.kpService.bulkCreate([
      { name: '高频词汇', level: 3, subjectCode: 'english', parentId: vocabulary.id, sortOrder: 1 },
      { name: '词汇辨析', level: 3, subjectCode: 'english', parentId: vocabulary.id, sortOrder: 2 },
      { name: '词根词缀', level: 3, subjectCode: 'english', parentId: vocabulary.id, sortOrder: 3 },
      { name: '主旨大意题', level: 3, subjectCode: 'english', parentId: reading.id, sortOrder: 1 },
      { name: '细节理解题', level: 3, subjectCode: 'english', parentId: reading.id, sortOrder: 2 },
      { name: '推理判断题', level: 3, subjectCode: 'english', parentId: reading.id, sortOrder: 3 },
      { name: '小作文', level: 3, subjectCode: 'english', parentId: writing.id, sortOrder: 1 },
      { name: '大作文', level: 3, subjectCode: 'english', parentId: writing.id, sortOrder: 2 },
    ]);

    this.logger.log('英语知识点初始化完成');
  }

  /**
   * 政治知识点
   */
  private async seedPolitics() {
    const politics = await this.kpService.create({
      name: '政治',
      description: '考研政治',
      level: 1,
      subjectCode: 'politics',
      sortOrder: 3,
    });

    const marxism = await this.kpService.create({
      name: '马克思主义基本原理',
      level: 2,
      subjectCode: 'politics',
      parentId: politics.id,
      sortOrder: 1,
    });

    const maoism = await this.kpService.create({
      name: '毛泽东思想和中国特色社会主义理论体系',
      level: 2,
      subjectCode: 'politics',
      parentId: politics.id,
      sortOrder: 2,
    });

    const history = await this.kpService.create({
      name: '中国近现代史纲要',
      level: 2,
      subjectCode: 'politics',
      parentId: politics.id,
      sortOrder: 3,
    });

    await this.kpService.bulkCreate([
      { name: '唯物论', level: 3, subjectCode: 'politics', parentId: marxism.id, sortOrder: 1 },
      { name: '辩证法', level: 3, subjectCode: 'politics', parentId: marxism.id, sortOrder: 2 },
      { name: '认识论', level: 3, subjectCode: 'politics', parentId: marxism.id, sortOrder: 3 },
      { name: '历史唯物主义', level: 3, subjectCode: 'politics', parentId: marxism.id, sortOrder: 4 },
      { name: '毛泽东思想', level: 3, subjectCode: 'politics', parentId: maoism.id, sortOrder: 1 },
      { name: '邓小平理论', level: 3, subjectCode: 'politics', parentId: maoism.id, sortOrder: 2 },
      { name: '新时代中国特色社会主义', level: 3, subjectCode: 'politics', parentId: maoism.id, sortOrder: 3 },
      { name: '旧民主主义革命', level: 3, subjectCode: 'politics', parentId: history.id, sortOrder: 1 },
      { name: '新民主主义革命', level: 3, subjectCode: 'politics', parentId: history.id, sortOrder: 2 },
      { name: '社会主义革命和建设', level: 3, subjectCode: 'politics', parentId: history.id, sortOrder: 3 },
    ]);

    this.logger.log('政治知识点初始化完成');
  }

  /**
   * 计算机408知识点
   */
  private async seedCS408() {
    const cs408 = await this.kpService.create({
      name: '计算机408',
      description: '计算机学科专业基础综合',
      level: 1,
      subjectCode: 'cs408',
      sortOrder: 4,
    });

    const dataStructure = await this.kpService.create({
      name: '数据结构',
      level: 2,
      subjectCode: 'cs408',
      parentId: cs408.id,
      sortOrder: 1,
    });

    const os = await this.kpService.create({
      name: '操作系统',
      level: 2,
      subjectCode: 'cs408',
      parentId: cs408.id,
      sortOrder: 2,
    });

    const network = await this.kpService.create({
      name: '计算机网络',
      level: 2,
      subjectCode: 'cs408',
      parentId: cs408.id,
      sortOrder: 3,
    });

    const organization = await this.kpService.create({
      name: '计算机组成原理',
      level: 2,
      subjectCode: 'cs408',
      parentId: cs408.id,
      sortOrder: 4,
    });

    await this.kpService.bulkCreate([
      { name: '线性表', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 1 },
      { name: '栈和队列', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 2 },
      { name: '树与二叉树', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 3 },
      { name: '图', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 4 },
      { name: '查找', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 5 },
      { name: '排序', level: 3, subjectCode: 'cs408', parentId: dataStructure.id, sortOrder: 6 },
      { name: '进程与线程', level: 3, subjectCode: 'cs408', parentId: os.id, sortOrder: 1 },
      { name: '内存管理', level: 3, subjectCode: 'cs408', parentId: os.id, sortOrder: 2 },
      { name: '文件系统', level: 3, subjectCode: 'cs408', parentId: os.id, sortOrder: 3 },
      { name: 'I/O管理', level: 3, subjectCode: 'cs408', parentId: os.id, sortOrder: 4 },
      { name: '体系结构', level: 3, subjectCode: 'cs408', parentId: network.id, sortOrder: 1 },
      { name: '物理层', level: 3, subjectCode: 'cs408', parentId: network.id, sortOrder: 2 },
      { name: '数据链路层', level: 3, subjectCode: 'cs408', parentId: network.id, sortOrder: 3 },
      { name: '网络层', level: 3, subjectCode: 'cs408', parentId: network.id, sortOrder: 4 },
      { name: '传输层', level: 3, subjectCode: 'cs408', parentId: network.id, sortOrder: 5 },
      { name: '数据的表示与运算', level: 3, subjectCode: 'cs408', parentId: organization.id, sortOrder: 1 },
      { name: '存储系统', level: 3, subjectCode: 'cs408', parentId: organization.id, sortOrder: 2 },
      { name: '指令系统', level: 3, subjectCode: 'cs408', parentId: organization.id, sortOrder: 3 },
      { name: 'CPU', level: 3, subjectCode: 'cs408', parentId: organization.id, sortOrder: 4 },
    ]);

    this.logger.log('计算机408知识点初始化完成');
  }
}

