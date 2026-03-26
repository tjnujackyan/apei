export interface TtsResult {
  audioBase64: string;
  mimeType: string;
  audioUrl?: string;
}

export interface TtsClient {
  synthesize(
    text: string,
    options?: { 
      voice?: string; 
      sampleRate?: number;
      referenceText?: string;
      emotion?: string;
    },
  ): Promise<TtsResult>;
}
