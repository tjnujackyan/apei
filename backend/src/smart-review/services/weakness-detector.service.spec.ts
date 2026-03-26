import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WeaknessDetectorService } from './weakness-detector.service';
import { WrongQuestionLogEntity } from '../../wrong-notebook/entities/wrong-question-log.entity';
import { PracticeItemLogEntity } from '../../practice/entities/practice-item-log.entity';
import { KnowledgePointEntity } from '../../knowledge-points/entities/knowledge-point.entity';

const mockWrongLogRepo = {
  find: jest.fn(),
};

const mockPracticeLogRepo = {
  find: jest.fn(),
};

const mockKpRepo = {
  find: jest.fn(),
};

describe('WeaknessDetectorService', () => {
  let service: WeaknessDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeaknessDetectorService,
        {
          provide: getRepositoryToken(WrongQuestionLogEntity),
          useValue: mockWrongLogRepo,
        },
        {
          provide: getRepositoryToken(PracticeItemLogEntity),
          useValue: mockPracticeLogRepo,
        },
        {
          provide: getRepositoryToken(KnowledgePointEntity),
          useValue: mockKpRepo,
        },
      ],
    }).compile();

    service = module.get<WeaknessDetectorService>(WeaknessDetectorService);
    jest.clearAllMocks();
  });

  describe('detect', () => {
    it('should return empty array when no wrong logs exist', async () => {
      mockWrongLogRepo.find.mockResolvedValue([]);

      const result = await service.detect('user1');

      expect(result).toEqual([]);
    });

    it('should return empty array when no weaknesses meet threshold', async () => {
      // 错误率 = 1/10 = 10% < 40%，不满足条件
      mockWrongLogRepo.find.mockResolvedValue([
        {
          userId: 'user1',
          questionId: 'q1',
          knowledgePointIds: ['kp1'],
          wrongCount: 1,
          updatedAt: new Date(),
        },
      ]);
      mockPracticeLogRepo.find.mockResolvedValue([
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: false },
      ]);

      const result = await service.detect('user1');

      expect(result).toEqual([]);
    });

    it('should detect weakness when error rate > 40% and error count >= 2', async () => {
      const now = new Date();
      // 错误率 = 3/5 = 60% > 40%，错误次数 = 3 >= 2
      mockWrongLogRepo.find.mockResolvedValue([
        {
          userId: 'user1',
          questionId: 'q1',
          knowledgePointIds: ['kp1'],
          wrongCount: 3,
          updatedAt: now,
        },
      ]);
      mockPracticeLogRepo.find.mockResolvedValue([
        { userId: 'user1', questionId: 'q1', isCorrect: false },
        { userId: 'user1', questionId: 'q1', isCorrect: false },
        { userId: 'user1', questionId: 'q1', isCorrect: false },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
      ]);
      mockKpRepo.find.mockResolvedValue([
        { id: 'kp1', name: '知识点1' },
      ]);

      const result = await service.detect('user1');

      expect(result.length).toBe(1);
      expect(result[0].knowledgePointId).toBe('kp1');
      expect(result[0].errorRate).toBeCloseTo(0.6, 2);
      expect(result[0].errorCount).toBe(3);
    });

    it('should sort weaknesses by weakness score (errorRate * errorCount) descending', async () => {
      const now = new Date();
      mockWrongLogRepo.find.mockResolvedValue([
        {
          userId: 'user1',
          questionId: 'q1',
          knowledgePointIds: ['kp1'],
          wrongCount: 2, // 错误率 50%, score = 0.5 * 2 = 1
          updatedAt: now,
        },
        {
          userId: 'user1',
          questionId: 'q2',
          knowledgePointIds: ['kp2'],
          wrongCount: 4, // 错误率 80%, score = 0.8 * 4 = 3.2
          updatedAt: now,
        },
      ]);
      mockPracticeLogRepo.find.mockResolvedValue([
        { userId: 'user1', questionId: 'q1', isCorrect: false },
        { userId: 'user1', questionId: 'q1', isCorrect: false },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q1', isCorrect: true },
        { userId: 'user1', questionId: 'q2', isCorrect: false },
        { userId: 'user1', questionId: 'q2', isCorrect: false },
        { userId: 'user1', questionId: 'q2', isCorrect: false },
        { userId: 'user1', questionId: 'q2', isCorrect: false },
        { userId: 'user1', questionId: 'q2', isCorrect: true },
      ]);
      mockKpRepo.find.mockResolvedValue([
        { id: 'kp1', name: '知识点1' },
        { id: 'kp2', name: '知识点2' },
      ]);

      const result = await service.detect('user1');

      expect(result.length).toBe(2);
      // kp2 应该排在前面，因为 weaknessScore 更高
      expect(result[0].knowledgePointId).toBe('kp2');
      expect(result[1].knowledgePointId).toBe('kp1');
      expect(result[0].weaknessScore).toBeGreaterThan(result[1].weaknessScore);
    });

    it('should include related question IDs in weakness point', async () => {
      const now = new Date();
      mockWrongLogRepo.find.mockResolvedValue([
        {
          userId: 'user1',
          questionId: 'q1',
          knowledgePointIds: ['kp1'],
          wrongCount: 2,
          updatedAt: now,
        },
        {
          userId: 'user1',
          questionId: 'q2',
          knowledgePointIds: ['kp1'],
          wrongCount: 2,
          updatedAt: now,
        },
      ]);
      mockPracticeLogRepo.find.mockResolvedValue([]);
      mockKpRepo.find.mockResolvedValue([
        { id: 'kp1', name: '知识点1' },
      ]);

      const result = await service.detect('user1');

      expect(result.length).toBe(1);
      expect(result[0].relatedQuestionIds).toContain('q1');
      expect(result[0].relatedQuestionIds).toContain('q2');
    });
  });

  describe('detectFromLogs', () => {
    it('should return empty array for empty wrong logs', () => {
      const result = service.detectFromLogs([], [], new Map());
      expect(result).toEqual([]);
    });

    it('should correctly calculate weakness from logs', () => {
      const now = new Date();
      const wrongLogs = [
        {
          userId: 'user1',
          questionId: 'q1',
          knowledgePointIds: ['kp1'],
          wrongCount: 3,
          updatedAt: now,
        } as WrongQuestionLogEntity,
      ];
      const practiceLogs = [
        { userId: 'user1', questionId: 'q1', isCorrect: false } as PracticeItemLogEntity,
        { userId: 'user1', questionId: 'q1', isCorrect: false } as PracticeItemLogEntity,
        { userId: 'user1', questionId: 'q1', isCorrect: false } as PracticeItemLogEntity,
        { userId: 'user1', questionId: 'q1', isCorrect: true } as PracticeItemLogEntity,
        { userId: 'user1', questionId: 'q1', isCorrect: true } as PracticeItemLogEntity,
      ];
      const kpMap = new Map([
        ['kp1', { id: 'kp1', name: '知识点1' } as KnowledgePointEntity],
      ]);

      const result = service.detectFromLogs(wrongLogs, practiceLogs, kpMap);

      expect(result.length).toBe(1);
      expect(result[0].knowledgePointId).toBe('kp1');
      expect(result[0].errorRate).toBeCloseTo(0.6, 2);
      expect(result[0].errorCount).toBe(3);
      expect(result[0].weaknessScore).toBeCloseTo(1.8, 2);
    });
  });
});
