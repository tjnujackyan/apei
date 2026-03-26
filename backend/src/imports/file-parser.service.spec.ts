import { Test, TestingModule } from '@nestjs/testing';
import { FileParserService } from './file-parser.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Mock mammoth and pdf-parse
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'Parsed Word Content' }),
}));

jest.mock('pdf-parse', () => {
  return jest.fn().mockResolvedValue({ text: 'Parsed PDF Content' });
});

describe('FileParserService', () => {
  let service: FileParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileParserService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              enabled: false,
              parseUrl: '',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileParserService>(FileParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse .docx files', async () => {
    const buffer = Buffer.from('mock');
    const result = await service.parseFile(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'test.docx',
    );
    expect(result).toBe('Parsed Word Content');
  });

  it('should parse .pdf files', async () => {
    const buffer = Buffer.from('mock');
    const result = await service.parseFile(
      buffer,
      'application/pdf',
      'test.pdf',
    );
    expect(result).toBe('Parsed PDF Content');
  });

  it('should throw error for unsupported file types', async () => {
    const buffer = Buffer.from('mock');
    await expect(
      service.parseFile(buffer, 'image/jpeg', 'test.jpg'),
    ).rejects.toThrow(BadRequestException);
  });
});
