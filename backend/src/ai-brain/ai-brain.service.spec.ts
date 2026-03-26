import { Test, TestingModule } from '@nestjs/testing';
import { AiBrainService } from './ai-brain.service';
import { LLM_CLIENT_TOKEN } from './ai-brain.tokens';
import { WrongNotebookService } from '../wrong-notebook/wrong-notebook.service';

const mockLlmClient = {
  chat: jest.fn(),
};

const mockWrongNotebookService = {
  getStats: jest.fn(),
};

describe('AiBrainService', () => {
  let service: AiBrainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBrainService,
        {
          provide: LLM_CLIENT_TOKEN,
          useValue: mockLlmClient,
        },
        {
          provide: WrongNotebookService,
          useValue: mockWrongNotebookService,
        },
      ],
    }).compile();

    service = module.get<AiBrainService>(AiBrainService);
    jest.clearAllMocks();
  });

  it('should generate a study plan', async () => {
    // Mock input
    const user = { userId: 'u1', persona: 'Student' } as any;
    const dto = { days: 15 };

    // Mock stats
    mockWrongNotebookService.getStats.mockResolvedValue({
      totalWrong: 50,
      topTags: [{ tag: 'calc', count: 10 }],
      topKnowledgePoints: [{ kp: 'kp1', count: 5 }],
    });

    // Mock LLM output
    const mockJson = `
    [
      {
        "day": 1,
        "theme": "Weakness Breakthrough - calc",
        "tasks": []
      }
    ]
    `;
    mockLlmClient.chat.mockResolvedValue(mockJson);

    const result = await service.generateStudyPlan(dto, user);

    expect(mockWrongNotebookService.getStats).toHaveBeenCalledWith('u1');
    expect(mockLlmClient.chat).toHaveBeenCalled();
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0].day).toBe(1);
    expect(result.plan[0].theme).toContain('calc');
  });

  it('should handle invalid JSON from LLM', async () => {
    mockWrongNotebookService.getStats.mockResolvedValue({
      totalWrong: 0,
      topTags: [],
      topKnowledgePoints: [],
    });
    mockLlmClient.chat.mockResolvedValue('Not JSON');

    const result = await service.generateStudyPlan({ days: 5 }, {} as any);

    expect(result.error).toBe('Parse failed');
    expect(result.raw).toBe('Not JSON');
  });
});
