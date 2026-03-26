export default () => ({
  app: {
    name: process.env.APP_NAME || 'apei-backend',
    port: Number(process.env.PORT) || 3000,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'doubao',
    baseUrl:
      process.env.LLM_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/v3',
    model: process.env.LLM_MODEL || 'Doubao-pro-32k',
    apiKey: process.env.LLM_API_KEY || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60000,
    reasoningEffort: process.env.LLM_REASONING_EFFORT || 'medium', // OhMyGPT 专用参数
  },
  mineru: {
    enabled: process.env.MINERU_ENABLED === 'true',
    type: process.env.MINERU_TYPE || 'local', // 'local' | 'official'
    parseUrl: process.env.MINERU_PARSE_URL || '',
    apiKey: process.env.MINERU_API_KEY || '',
  },
  // 存储类型：oss（阿里云 OSS）| wxcloud（微信云 COS），默认 oss 便于本地与生产通用
  storage: {
    type: process.env.STORAGE_TYPE || 'oss',
  },
  // 阿里云 OSS 配置（当 storage.type === 'oss' 时使用）
  oss: {
    region: process.env.OSS_REGION || process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou',
    bucket: process.env.OSS_BUCKET || process.env.ALIYUN_OSS_BUCKET || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET || '',
    endpoint: process.env.OSS_ENDPOINT || '', // 可选，不填则用默认 region 端点
  },
  // 微信云托管对象存储配置（当 storage.type === 'wxcloud' 时使用）
  wxcloud: {
    bucket: process.env.WXCLOUD_BUCKET || process.env.COS_BUCKET || '',
    region: process.env.WXCLOUD_REGION || process.env.COS_REGION || 'ap-shanghai',
  },
  tts: {
    baseUrl:
      process.env.TTS_BASE_URL ||
      'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
    accessToken: process.env.TTS_ACCESS_TOKEN || '',
    appId: process.env.TTS_APP_ID || '',
    resourceId: process.env.TTS_RESOURCE_ID || 'volc.service_type.10029',
    voice: process.env.TTS_VOICE || 'BV001_streaming',
    speedRatio: Number(process.env.TTS_SPEED_RATIO) || 0.9, // 语速：0.5-2.0，默认0.9（稍慢）
    volumeRatio: Number(process.env.TTS_VOLUME_RATIO) || 1.0, // 音量：0.5-2.0
    pitchRatio: Number(process.env.TTS_PITCH_RATIO) || 1.0, // 音高：0.5-2.0
    emotion: process.env.TTS_EMOTION || 'neutral', // 情感：neutral/happy/sad/gentle等
    timeoutMs: Number(process.env.TTS_TIMEOUT_MS) || 30000,
  },
  asr: {
    appId: process.env.ASR_APP_ID || process.env.TTS_APP_ID || '',
    accessKey: process.env.ASR_ACCESS_KEY || process.env.TTS_ACCESS_TOKEN || '',
    resourceId: process.env.ASR_RESOURCE_ID || 'volc.bigasr.auc',
    submitUrl: process.env.ASR_SUBMIT_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit',
    queryUrl: process.env.ASR_QUERY_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query',
  },
  db: {
    type: process.env.DB_TYPE || 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : (process.env.DB_TYPE === 'postgres' ? 5432 : 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'apei',
    sqlitePath: process.env.SQLITE_PATH,
  },
});
