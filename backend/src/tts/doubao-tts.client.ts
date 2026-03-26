import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as zlib from 'zlib';
import type { TtsClient, TtsResult } from './interfaces/tts-client';

export interface DoubaoTtsOptions {
  baseUrl: string; // e.g. wss://openspeech.bytedance.com/api/v3/tts/bidirection
  accessToken: string; // This will now be treated as Authorization header (Bearer)
  appId: string; // X-Api-App-Key
  resourceId?: string; // X-Api-Resource-Id, e.g. "volc.service_type.10029" or "seed-tts-2.0"
  uid?: string;
  cluster?: string; // e.g. "volcano_tts"
  voice?: string; // Default voice
  speedRatio?: number; // 语速比率 (0.5-2.0, 默认1.0)
  volumeRatio?: number; // 音量比率 (0.5-2.0, 默认1.0)
  pitchRatio?: number; // 音高比率 (0.5-2.0, 默认1.0)
  emotion?: string; // 情感标签 (如: happy, sad, angry等)
}

/**
 * Doubao (VolcEngine) WebSocket TTS Client
 * Reference: https://www.volcengine.com/docs/6561/1329505
 */
export class DoubaoTtsClient implements TtsClient {
  constructor(private readonly options: DoubaoTtsOptions) {}

  async synthesize(
    text: string,
    opts?: { voice?: string; sampleRate?: number; referenceText?: string; emotion?: string },
  ): Promise<TtsResult> {
    return new Promise((resolve, reject) => {
      const sessionId = uuidv4();
      const url =
        this.options.baseUrl ||
        'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

      // According to VolcEngine documentation for WebSocket connection (V1):
      // Authorization: Bearer; <access_token>

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer; ${this.options.accessToken}`,
          'X-Api-App-Key': this.options.appId,
          'X-Api-Resource-Id': this.options.resourceId || 'volc.service_type.10029',
        },
      });

      const audioChunks: Buffer[] = [];

      ws.on('open', () => {
        // Send 'start-connection' logic is implicit in handshake for some versions,
        // but protocol says:
        // 1. Handshake (Headers) -> Success
        // 2. Send JSON payload (Full-client request) for one-shot synthesis

        // Construct the request payload
        // According to "Protocol version 1", we can send a JSON message.
        // However, the doc mentions binary protocol structure for advanced control.
        // For simplicity, many VolcEngine SDKs use a specific JSON format inside the payload
        // or a binary frame with JSON header.

        // Let's implement the standard JSON-based "Full Client Request" if supported,
        // OR the binary frame protocol as described in the doc.
        // The doc "WebSocket Binary Protocol" section describes a complex 4-byte header + payload.

        // Let's use the standard "query" structure often used in their examples:
        const requestPayload = {
          app: {
            appid: this.options.appId,
            token: 'access_token', // usually ignored if header is set, but required by schema
            cluster: this.options.cluster || 'volcano_tts',
          },
          user: {
            uid: this.options.uid || 'guest',
          },
          audio: {
            voice_type: opts?.voice || this.options.voice || 'BV001_streaming',
            encoding: 'mp3',
            speed_ratio: this.options.speedRatio || 0.9, // 默认0.9（稍慢，更自然）
            volume_ratio: this.options.volumeRatio || 1.0,
            pitch_ratio: this.options.pitchRatio || 1.0,
            // 如果有 emotion 参数则使用，否则不传该字段，让模型根据 reference_text 自动推断
            ...(opts?.emotion || this.options.emotion ? { emotion: opts?.emotion || this.options.emotion } : {}),
          },
          request: {
            reqid: sessionId,
            text: text,
            operation: 'query',
            // 豆包语音合成2.0: 支持引用上文 (Context Reference)
            // 字段通常为 reference_text 或 ref_text，用于承接语境情绪
            reference_text: opts?.referenceText,
          },
        };

        console.log('Doubao TTS Payload:', JSON.stringify(requestPayload, null, 2));

        // If the endpoint strictly requires Binary Protocol (as per the doc link):
        // We need to wrap this JSON in the binary frame format.
        // [0001] [0001] [0001] [0000] (Version | HeaderSize | MsgType | SpecificFlags ...)

        // However, standard "wss://openspeech.bytedance.com/api/v1/tts" often supports pure JSON.
        // The doc linked is "v3", which emphasizes Binary Protocol.

        // Let's implement the Binary Protocol Wrapper for V1.
        // Reference: https://www.volcengine.com/docs/6561/79823

        // Header: 4 bytes
        // Byte 0: Version (4) | Header Size (4) -> 0x11 (Version 1, Header Size 4)
        // Byte 1: Message Type (4) | Specific Flags (4) -> 0x10 (Full Client Request 0b0001, Flags 0b0000)
        // Byte 2: Serialization (4) | Compression (4) -> 0x11 (JSON 0b0001, Gzip 0b0001)
        // Byte 3: Reserved -> 0x00

        const header = Buffer.from([0x11, 0x10, 0x11, 0x00]);

        let payloadBuffer = Buffer.from(JSON.stringify(requestPayload));
        // Gzip the payload
        payloadBuffer = zlib.gzipSync(payloadBuffer);

        // Protocol format: [Header (4)] [Payload Size (4, Big Endian)] [Payload]
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeInt32BE(payloadBuffer.length, 0);

        const packet = Buffer.concat([header, sizeBuffer, payloadBuffer]);
        ws.send(packet);
      });

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        // V1 Protocol Parsing

        // Ensure data is Buffer
        if (!Buffer.isBuffer(data)) {
          if (Array.isArray(data)) {
            data = Buffer.concat(data);
          } else {
            data = Buffer.from(data);
          }
        }

        // console.log('Received message, length:', data.length);

        if (data.length < 4) return; // Invalid header

        // Header (4 bytes)
        const version = (data[0] >> 4) & 0x0f;
        const headerSize = (data[0] & 0x0f) * 4; // header size value * 4 bytes
        const messageType = (data[1] >> 4) & 0x0f;
        const specificFlags = data[1] & 0x0f;
        const serialization = (data[2] >> 4) & 0x0f;
        const compression = data[2] & 0x0f;

        // Payload
        let payload = data.subarray(headerSize);

        // Decompress if needed (0b0001 = gzip)
        if (compression === 1) {
          try {
            payload = zlib.gunzipSync(payload);
          } catch (e) {
            console.error('Gunzip error', e);
            return;
          }
        }

        // Handle Message Types
        // 0b1011 (0xB) - Audio-only server response
        // 0b1111 (0xF) - Error message
        // 0b1001 (0x9) - Full server response (deprecated but might appear)

        if (messageType === 0xb) {
          // Audio Data
          audioChunks.push(payload);

          // Check sequence flags for end of stream
          // b0010 or b0011 means last message (< 0)
          // Actually specificFlags logic:
          // 0b0000 - no sequence
          // 0b0001 - sequence > 0
          // 0b0010 - sequence < 0 (last)
          // 0b0011 - sequence < 0 (last)

          if (specificFlags >= 2) {
            ws.close();
          }
        } else if (messageType === 0xf) {
          // Error
          const errorMsg = payload.toString('utf-8');
          console.error('Server Error:', errorMsg);
          ws.close();
          reject(new Error(`Server Error: ${errorMsg}`));
        } else {
          // console.log('Unknown message type:', messageType);
        }
      });

      ws.on('close', () => {
        const fullAudio = Buffer.concat(audioChunks);
        if (fullAudio.length === 0) {
          reject(new Error('No audio received'));
          return;
        }
        resolve({
          audioBase64: fullAudio.toString('base64'),
          mimeType: 'audio/mpeg',
        });
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  }
}
