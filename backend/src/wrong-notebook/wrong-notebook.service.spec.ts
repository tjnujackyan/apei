import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WrongNotebookService } from './wrong-notebook.service';
import { WrongQuestionLogEntity } from './entities/wrong-question-log.entity';

const mockRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
};

describe('WrongNotebookService', () => {
  let service: WrongNotebookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WrongNotebookService,
        {
          provide: getRepositoryToken(WrongQuestionLogEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<WrongNotebookService>(WrongNotebookService);
    jest.clearAllMocks();
  });

  it('should create new record with tags', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.create.mockReturnValue({
      userId: 'u1',
      questionId: 'q1',
      tags: ['tag1'],
    });
    mockRepo.save.mockResolvedValue({ id: '1', userId: 'u1' });

    await service.recordWrong('u1', 's1', 'q1', ['tag1']);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['tag1'],
      }),
    );
  });

  it('should merge tags for existing record', async () => {
    mockRepo.findOne.mockResolvedValue({
      userId: 'u1',
      questionId: 'q1',
      wrongCount: 1,
      tags: ['old_tag'],
    });
    mockRepo.save.mockImplementation((entity) => Promise.resolve(entity));

    await service.recordWrong('u1', 's1', 'q1', ['new_tag']);

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining(['old_tag', 'new_tag']),
      }),
    );
  });
});
