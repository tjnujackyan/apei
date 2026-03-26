import { Injectable } from '@nestjs/common';
import { CreateQuestionDto } from '../question-bank/dto/create-question.dto';

@Injectable()
export class QuestionParserService {
  /**
   * Parses raw text into a list of structured questions.
   * Supports answer parsing from separate blocks or answer sheets.
   */
  parse(text: string): CreateQuestionDto[] {
    const questions: CreateQuestionDto[] = [];

    // 1. Clean garbage (page numbers, headers/footers)
    let cleanedText = this.cleanText(text);

    // 2. Normalize newlines
    cleanedText = cleanedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 3. Detect and extract Answer Sheet if present
    // Often answers are at the end, marked by "答案" or "参考答案"
    // We split the text into "Questions Part" and "Answer Part"
    const answerSheetSplit = cleanedText.split(/^(?:参考)?答案(?:[:：]|\s*$)/m);
    let questionText = cleanedText;
    let answerText = '';

    if (answerSheetSplit.length > 1) {
      // Assume the last part is the answer sheet if it's substantial
      // or if we have multiple splits, try to find the one that looks like a block of answers
      // For simplicity, take the last part as answers, and everything before as questions
      answerText = answerSheetSplit.pop() || '';
      questionText = answerSheetSplit.join('\n');
    }

    // 4. Ensure questions start on new lines (handle inline numbering)
    // Look for "1.", "1、" preceded by whitespace or start of line, and force a newline
    questionText = questionText.replace(/(?<=\s|^)(\d+[\.、]\s*)/g, '\n$1');

    // 5. Ensure Options and Answer/Explanation start on new lines
    questionText = questionText.replace(/(?<=\s)([A-Da-d][\.\)、]\s*)/g, '\n$1');
    questionText = questionText.replace(
      /(?<=\s)((?:答案|正确答案|解析|解释)[:：])/g,
      '\n$1',
    );

    // 6. Parse Answers from Answer Sheet (if any)
    // Map: Question Number -> Answer String (e.g. "1" -> "A", "2" -> "B")
    const separateAnswers = this.parseAnswerSheet(answerText);

    // 7. Split by question number patterns
    const blocks = questionText.split(/\n(?=\d+[\.、]\s*)/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const question = this.parseBlock(block, separateAnswers);
      if (question) {
        questions.push(question);
      }
    }

    return questions;
  }

  private parseAnswerSheet(text: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!text) return map;

    // Normalize text
    const clean = text.replace(/\s+/g, ' ');
    
    // Pattern 1: "1. A 2. B" or "1.A 2.B" or "1 A 2 B"
    // Regex to find number followed by A-D
    const matches = clean.matchAll(/(\d+)[\.、\s]*([A-Da-d]+)/g);
    for (const m of matches) {
      map.set(m[1], m[2].toUpperCase());
    }

    // Pattern 2: Table-like or dense block? 
    // The simple regex above handles most linear answer sheets.
    // E.g. "1-5 ADBCA" is harder, but "1.A" is common.
    
    return map;
  }

  private cleanText(text: string): string {
    let cleaned = text;
    // Remove "-- 1 of 38 --" style page markers
    // Handles multiple markers on one line or across lines
    cleaned = cleaned.replace(/(?:--\s*\d+\s*of\s*\d+\s*--\s*)+/g, '\n');

    // Remove "Page 1 of 38" style
    cleaned = cleaned.replace(/Page\s*\d+\s*of\s*\d+/gi, '\n');

    return cleaned;
  }

  private cleanLatex(text: string): string {
    if (!text) return text;
    // Remove outer $...$
    let clean = text.replace(/^\$(.*)\$$/g, '$1');
    // Remove inline $...$ (just keep content) - simplified
    clean = clean.replace(/\$([^\$]+)\$/g, '$1');
    
    // Common LaTeX commands replacement
    clean = clean
      .replace(/\\mathrm\{([^}]+)\}/g, '$1') // \mathrm{abc} -> abc
      .replace(/\\textbf\{([^}]+)\}/g, '$1') // \textbf{abc} -> abc
      .replace(/\\textit\{([^}]+)\}/g, '$1') // \textit{abc} -> abc
      .replace(/\\text\{([^}]+)\}/g, '$1')   // \text{abc} -> abc
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2') // \frac{a}{b} -> a/b
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\div/g, '÷')
      .replace(/\\le/g, '≤')
      .replace(/\\ge/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\infty/g, '∞')
      .replace(/\\pm/g, '±')
      .replace(/\\circ/g, '°')
      .replace(/\\_/g, '_')
      .replace(/\\%/g, '%')
      .replace(/\\$/g, '$')
      .replace(/\\quad/g, ' ')
      .replace(/\\qquad/g, '  ')
      .replace(/\\[a-zA-Z]+/g, ' '); // Remove remaining commands

    // Collapse spaces
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
  }

  private parseBlock(
    block: string,
    separateAnswers: Map<string, string>,
  ): CreateQuestionDto | null {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length === 0) return null;

    // Extract Question Stem (first line usually contains "1. Question...")
    // Remove the leading number and separator (dot or Chinese comma)
    const numberMatch = lines[0].match(/^(\d+)[\.、]\s*/);
    const questionNumber = numberMatch ? numberMatch[1] : '';
    
    let stem = lines[0].replace(/^\d+[\.、]\s*/, '');
    stem = this.cleanLatex(stem);

    // If stem is empty (e.g. number was on its own line), take next line?
    // For MVP assume standard format.

    const options: string[] = [];
    let answer = '';
    let explanation = '';

    // Check separate answer sheet first
    if (questionNumber && separateAnswers.has(questionNumber)) {
      answer = separateAnswers.get(questionNumber) || '';
    }

    // Basic state machine
    let state: 'stem' | 'options' | 'answer' | 'explanation' = 'stem';

    // Iterate from line 1
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Detect Answer
      if (line.match(/^(答案|正确答案)[:：]/)) {
        state = 'answer';
        answer = line.replace(/^(答案|正确答案)[:：]\s*/, '').trim();
        continue;
      }

      // Detect Explanation
      if (line.match(/^(解析|解释)[:：]/)) {
        state = 'explanation';
        explanation = line.replace(/^(解析|解释)[:：]\s*/, '').trim();
        explanation = this.cleanLatex(explanation);
        continue;
      }

      // Detect Options (A., B., A), B))
      const optionMatch = line.match(/^([A-Da-d])[\.\)、]\s*(.*)/);
      if (optionMatch) {
        state = 'options';
        // Normalize option content
        options.push(this.cleanLatex(optionMatch[2]));
        continue;
      }

      // Append to current state content
      if (state === 'stem') {
        stem += '\n' + this.cleanLatex(line);
      } else if (state === 'explanation') {
        explanation += '\n' + this.cleanLatex(line);
      } else if (state === 'options' && options.length > 0) {
        options[options.length - 1] += '\n' + this.cleanLatex(line);
      }
    }

    // Stricter validation: Must have options OR an answer to be considered valid
    // This filters out garbage blocks that might have been split incorrectly
    if (options.length === 0 && !answer) {
      return null;
    }

    if (!stem) return null;

    // Map to DTO
    let optionDtos;
    if (options.length > 0) {
      optionDtos = options.map((optContent, index) => {
        const label = String.fromCharCode(65 + index); // A, B, C...
        // Check if this option is the correct answer
        // Answer might be "A" or "A." or "Option A" or "AB"
        const isCorrect = answer.includes(label);
        return {
          label,
          content: optContent,
          isCorrect,
        };
      });
    } else {
      // If no options parsed but answer exists (e.g. math question with "A"), 
      // we might need to rely on what was parsed.
      // But for robustness, if we see answer contains A/B/C/D but no options, 
      // it might be a parsing failure of options.
      // However, for pure fill-in or calculation questions, options might not exist.
      // Current system only supports choice questions.
      // Let's create dummy options if answer implies choice but options missing? No.
      // Let's return null if it looks like a choice question but options are missing.
      if (answer.match(/[A-D]/)) return null;
      optionDtos = [];
    }
    
    // Fix: If we have options, but they don't seem to match A/B/C/D labels correctly 
    // (e.g. parser missed some), we might have issues. 
    // But assuming simple regex worked:
    
    // Check if options content contains the label itself (common issue: "A. Option A")
    // The regex `^([A-Da-d])[\.\)、]\s*(.*)` puts content in group 2.
    // So "A. Content" -> label="A", content="Content". Correct.

    const correctCount = optionDtos.filter((o) => o.isCorrect).length;
    const type = correctCount > 1 ? 'multiple' : 'single';

    return {
      stem: stem,
      type: type,
      options: optionDtos,
      knowledgeTags: [],
      answerExplanation: explanation,
      difficulty: 1,
    };
  }
}
