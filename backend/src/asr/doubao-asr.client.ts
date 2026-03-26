import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { AsrClient, AsrResult, AsrOptions } from './interfaces/asr-client';

export interface DoubaoAsrConfig {
  appId: string;           // X-Api-App-Key
  accessKey: string;       // X-Api-Access-Key
  resourceId?: string;     // X-Api-Resource-Id: volc.bigasr.auc 或 volc.seedasr.auc
  submitUrl?: string;
  queryUrl?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface SubmitResponse {
  statusCode: number;
  message: string;
}

interface QueryResponse {
  result?: {
    text: string;
    utterances?: Array<{
      text: string;
      start_time: number;
      end_time: number;
      definite?: boolean;
      speaker_id?: number;
      channel_id?: number;
      additions?: {
        emotion?: string;
        gender?: string;
        speech_rate?: number;
        volume?: number;
      };
      words?: Array<{
        text: string;
        start_time: number;
        end_time: number;
        blank_duration?: number;
      }>;
    }>;
  };
  audio_info?: {
    duration: number;
  };
}

/**
 * 火山引擎（豆包）大模型录音文件识别客户端
 * API文档: https://www.volcengine.com/docs/6561/xxx
 * 
 * 流程：
 * 1. 提交任务（submit）- 提交音频URL，获取任务ID
 * 2. 查询结果（query）- 轮询查询转写结果
 */
export class DoubaoAsrClient implements AsrClient {
  private readonly config: Required<DoubaoAsrConfig>;

  constructor(config: DoubaoAsrConfig) {
    this.config = {
      appId: config.appId,
      accessKey: config.accessKey,
      resourceId: config.resourceId || 'volc.bigasr.auc',
      submitUrl: config.submitUrl || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit',
      queryUrl: config.queryUrl || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query',
      pollIntervalMs: config.pollIntervalMs || 2000,
      maxPollAttempts: config.maxPollAttempts || 60, // 最多等待120秒
    };
  }

  async transcribe(audioUrl: string, options?: AsrOptions): Promise<AsrResult> {
    const requestId = uuidv4();

    // 1. 提交任务
    await this.submitTask(requestId, audioUrl, options);

    // 2. 轮询查询结果
    const result = await this.pollForResult(requestId);

    return result;
  }

  private async submitTask(
    requestId: string,
    audioUrl: string,
    options?: AsrOptions,
  ): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-App-Key': this.config.appId,
      'X-Api-Access-Key': this.config.accessKey,
      'X-Api-Resource-Id': this.config.resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    };

    const body = {
      user: {
        uid: 'apei-user',
      },
      audio: {
        format: options?.format || 'mp3',
        url: audioUrl,
        language: options?.language || '',
        rate: options?.sampleRate || 16000,
        bits: 16,
        channel: 1,
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: options?.enableItn ?? true,
        enable_punc: options?.enablePunctuation ?? true,
        enable_ddc: true, // 语义顺滑
        enable_speaker_info: options?.enableSpeakerInfo ?? false,
        show_utterances: options?.showUtterances ?? true,
      },
    };

    try {
      const response = await axios.post(this.config.submitUrl, body, { headers });
      
      // 检查响应头中的状态码
      const statusCode = response.headers['x-api-status-code'];
      const message = response.headers['x-api-message'];

      if (statusCode && statusCode !== '20000000') {
        throw new Error(`ASR submit failed: ${message} (code: ${statusCode})`);
      }

      console.log(`[ASR] Task submitted successfully, requestId: ${requestId}`);
    } catch (error: any) {
      if (error.response) {
        const statusCode = error.response.headers['x-api-status-code'];
        const message = error.response.headers['x-api-message'];
        throw new Error(`ASR submit failed: ${message} (code: ${statusCode})`);
      }
      throw error;
    }
  }

  private async pollForResult(requestId: string): Promise<AsrResult> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-App-Key': this.config.appId,
      'X-Api-Access-Key': this.config.accessKey,
      'X-Api-Resource-Id': this.config.resourceId,
      'X-Api-Request-Id': requestId,
    };

    let attempts = 0;

    while (attempts < this.config.maxPollAttempts) {
      attempts++;

      try {
        const response = await axios.post<QueryResponse>(
          this.config.queryUrl,
          {},
          { headers },
        );

        const statusCode = response.headers['x-api-status-code'];
        const message = response.headers['x-api-message'];

        // 20000000: 成功
        // 20000001: 正在处理中
        // 20000002: 任务在队列中
        // 20000003: 静音音频
        // 45000xxx: 请求参数错误
        // 55000xxx: 服务内部错误

        if (statusCode === '20000000') {
          // 成功，解析结果
          console.log(`[ASR] Task completed, requestId: ${requestId}`);
          return this.parseResult(response.data);
        }

        if (statusCode === '20000001' || statusCode === '20000002') {
          // 仍在处理中，继续轮询
          console.log(`[ASR] Task in progress (${statusCode}), attempt ${attempts}/${this.config.maxPollAttempts}`);
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        if (statusCode === '20000003') {
          // 静音音频
          console.warn(`[ASR] Silent audio detected, requestId: ${requestId}`);
          return { text: '', utterances: [], duration: 0 };
        }

        // 其他错误
        throw new Error(`ASR query failed: ${message} (code: ${statusCode})`);

      } catch (error: any) {
        if (error.response) {
          const statusCode = error.response.headers['x-api-status-code'];
          const message = error.response.headers['x-api-message'];

          // 检查是否是处理中状态
          if (statusCode === '20000001' || statusCode === '20000002') {
            console.log(`[ASR] Task in progress (${statusCode}), attempt ${attempts}/${this.config.maxPollAttempts}`);
            await this.sleep(this.config.pollIntervalMs);
            continue;
          }

          throw new Error(`ASR query failed: ${message} (code: ${statusCode})`);
        }
        throw error;
      }
    }

    throw new Error(`ASR query timeout after ${this.config.maxPollAttempts} attempts`);
  }

  private parseResult(data: QueryResponse): AsrResult {
    const result: AsrResult = {
      text: data.result?.text || '',
      duration: data.audio_info?.duration,
    };

    if (data.result?.utterances) {
      result.utterances = data.result.utterances.map((u) => ({
        text: u.text,
        startTime: u.start_time,
        endTime: u.end_time,
        speakerId: u.speaker_id,
        channelId: u.channel_id,
        emotion: u.additions?.emotion,
        gender: u.additions?.gender,
        speechRate: u.additions?.speech_rate,
        volume: u.additions?.volume,
        words: u.words?.map((w) => ({
          text: w.text,
          startTime: w.start_time,
          endTime: w.end_time,
          blankDuration: w.blank_duration,
        })),
      }));
    }

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
