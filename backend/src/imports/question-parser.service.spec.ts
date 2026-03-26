import { Test, TestingModule } from '@nestjs/testing';
import { QuestionParserService } from './question-parser.service';

describe('QuestionParserService', () => {
  let service: QuestionParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuestionParserService],
    }).compile();

    service = module.get<QuestionParserService>(QuestionParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse a standard question block', () => {
    const text = `
1. What is the capital of France?
A. London
B. Berlin
C. Paris
D. Madrid
答案: C
解析: Paris is the capital of France.
    `;
    const questions = service.parse(text);
    expect(questions).toHaveLength(1);
    expect(questions[0].stem).toContain('What is the capital of France?');
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].options[0].content).toBe('London');
    expect(questions[0].options[1].content).toBe('Berlin');
    expect(questions[0].options[2].content).toBe('Paris');
    expect(questions[0].options[3].content).toBe('Madrid');

    // Check correctness
    expect(questions[0].options[2].isCorrect).toBe(true);
    expect(questions[0].answerExplanation).toContain(
      'Paris is the capital of France',
    );
  });

  it('should parse multiple questions', () => {
    const text = `
1. Q1
A. A1
B. B1
答案: A

2. Q2
A. A2
B. B2
答案: B
    `;
    const questions = service.parse(text);
    expect(questions).toHaveLength(2);
    expect(questions[0].stem).toContain('Q1');
    expect(questions[1].stem).toContain('Q2');
  });

  it('should handle garbage page markers', () => {
    const text = `
-- 1 of 38 -- -- 2 of 38 --
1. What is 1+1?
-- 3 of 38 --
A. 1
B. 2
C. 3
D. 4
答案: B
-- 4 of 38 --
2. What is 2+2?
A. 3
B. 4
-- 5 of 38 --
C. 5
D. 6
答案: B
    `;
    const questions = service.parse(text);

    // It should parse 2 questions
    expect(questions.length).toBe(2);
    // The stem should not contain garbage
    expect(questions[0].stem).not.toContain('-- 1 of 38 --');
    expect(questions[0].stem).not.toContain('-- 2 of 38 --');
    expect(questions[0].stem).not.toContain('-- 3 of 38 --');
  });
});
