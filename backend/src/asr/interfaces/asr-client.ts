export interface AsrResult {
  text: string;
  utterances?: AsrUtterance[];
  duration?: number;
}

export interface AsrUtterance {
  text: string;
  startTime: number;
  endTime: number;
  words?: AsrWord[];
  speakerId?: number;
  channelId?: number;
  emotion?: string;
  gender?: string;
  speechRate?: number;
  volume?: number;
}

export interface AsrWord {
  text: string;
  startTime: number;
  endTime: number;
  blankDuration?: number;
}

export interface AsrOptions {
  language?: string;
  format?: 'mp3' | 'wav' | 'ogg' | 'raw';
  sampleRate?: number;
  enablePunctuation?: boolean;
  enableItn?: boolean;
  enableSpeakerInfo?: boolean;
  showUtterances?: boolean;
}

export interface AsrClient {
  transcribe(audioUrl: string, options?: AsrOptions): Promise<AsrResult>;
}
