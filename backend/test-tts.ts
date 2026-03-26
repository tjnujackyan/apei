import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { DoubaoTtsClient } from './src/tts/doubao-tts.client';

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function runTest() {
  console.log('--- Starting TTS Test ---');
  console.log('Base URL:', process.env.TTS_BASE_URL);
  console.log('App ID:', process.env.TTS_APP_ID);
  console.log('Resource ID:', process.env.TTS_RESOURCE_ID);
  console.log('Voice:', process.env.TTS_VOICE);

  const client = new DoubaoTtsClient({
    baseUrl: process.env.TTS_BASE_URL || 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
    accessToken: process.env.TTS_ACCESS_TOKEN || '',
    appId: process.env.TTS_APP_ID || '',
    resourceId: process.env.TTS_RESOURCE_ID || 'volc.service_type.10029',
    voice: process.env.TTS_VOICE || 'BV001_streaming',
  });

  const text = '不是！哥们，你是人啊？这么简单的排序都能做错啊？';
  console.log(`Synthesizing text: "${text}"`);

  try {
    const start = Date.now();
    const result = await client.synthesize(text);
    const duration = Date.now() - start;

    console.log(`Synthesis completed in ${duration}ms`);
    console.log(`Audio format: ${result.mimeType}`);
    console.log(`Audio size: ${result.audioBase64.length} bytes (base64)`);

    // Save to file
    const outputPath = path.join(__dirname, 'test-output.mp3');
    fs.writeFileSync(outputPath, Buffer.from(result.audioBase64, 'base64'));
    console.log(`Audio saved to: ${outputPath}`);

  } catch (error) {
    console.error('Test failed:', error);
    if (error instanceof Error) {
        console.error('Message:', error.message);
    }
  }
}

runTest();
