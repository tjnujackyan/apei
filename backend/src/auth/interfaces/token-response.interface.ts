/**
 * 登录/刷新 token 返回的统一格式
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // accessToken 过期时间（秒）
  user?: {
    id: string;
    externalId: string;
    displayName?: string;
    targetSchool?: string;
    targetMajor?: string;
    persona: string;
  };
}

/**
 * 需要绑定手机号的响应
 */
export interface NeedBindingResponse {
  needBinding: true;
  openid: string;
}
