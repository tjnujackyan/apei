import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { TokenResponse } from './interfaces/token-response.interface';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { SmsService } from './sms/sms.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

// Refresh token 有效期：30 天
const REFRESH_TOKEN_EXPIRES_DAYS = 30;
// Access token 有效期（秒）：2 小时
const ACCESS_TOKEN_EXPIRES_SECONDS = 7200;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
  ) {}

  /**
   * 生成 access token 和 refresh token
   */
  private async generateTokenPair(userId: string, externalId: string, persona: string): Promise<TokenResponse> {
    // 1. 生成 access token (JWT)
    const payload: JwtPayload = {
      sub: userId,
      externalId,
      persona,
    };
    const accessToken = this.jwtService.sign(payload);

    // 2. 生成 refresh token (随机 UUID，存数据库)
    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    // 3. 保存 refresh token 到数据库
    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId,
      token: refreshToken,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS,
    };
  }

  /**
   * 刷新 token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    // 1. 查找 refresh token
    const tokenEntity = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken },
    });

    if (!tokenEntity) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    // 2. 检查是否有效
    if (!tokenEntity.isValid()) {
      // 清理无效 token
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }

    // 3. 获取用户信息
    const user = await this.usersService.findById(tokenEntity.userId);
    if (!user) {
      await this.refreshTokenRepo.remove(tokenEntity);
      throw new UnauthorizedException('USER_NOT_FOUND');
    }

    // 4. 撤销旧的 refresh token（轮换策略，提高安全性）
    tokenEntity.revoked = true;
    await this.refreshTokenRepo.save(tokenEntity);

    // 5. 生成新的 token 对
    const tokens = await this.generateTokenPair(user.id, user.externalId, user.persona);

    return {
      ...tokens,
      user: {
        id: user.id,
        externalId: user.externalId,
        displayName: user.displayName,
        targetSchool: user.targetSchool,
        targetMajor: user.targetMajor,
        persona: user.persona,
      },
    };
  }

  /**
   * 登出：撤销用户的所有 refresh token
   */
  async logout(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { userId, revoked: false },
      { revoked: true },
    );
  }

  /**
   * 清理过期的 refresh token（可定期调用）
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  async jscode2session(code: string) {
    const appId = this.configService.get<string>('WECHAT_APP_ID');
    const secret = this.configService.get<string>('WECHAT_APP_SECRET');

    if (!appId || !secret || appId === 'your_app_id') {
      this.logger.warn('WeChat App ID or Secret not set correctly in .env');
      // For development/testing without real credentials, we might want to mock or throw
      // But user asked for REAL integration.
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

    try {
      const response = await axios.get(url);
      const data = response.data;

      if (data.errcode) {
        this.logger.error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
        throw new UnauthorizedException(`WeChat login failed: ${data.errmsg}`);
      }

      return data; // { openid, session_key, unionid, errcode, errmsg }
    } catch (error) {
      this.logger.error('Failed to call WeChat API', error);
      throw new UnauthorizedException('WeChat login failed');
    }
  }

  // Simple in-memory cache for access_token
  private accessToken: string | null = null;
  private accessTokenExpiresAt: number = 0;

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const appId = this.configService.get<string>('WECHAT_APP_ID');
    const secret = this.configService.get<string>('WECHAT_APP_SECRET');

    if (!appId || !secret || appId === 'your_app_id') {
      this.logger.warn('WeChat App ID or Secret not set correctly in .env');
      throw new Error('WeChat credentials not configured');
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`;

    try {
      const response = await axios.get(url);
      const data = response.data;

      if (data.errcode) {
        this.logger.error(
          `WeChat Token API error: ${data.errcode} - ${data.errmsg}`,
        );
        throw new Error(`Failed to get access token: ${data.errmsg}`);
      }

      this.accessToken = data.access_token;
      // Expires in 7200 seconds, refresh a bit earlier
      this.accessTokenExpiresAt = Date.now() + (data.expires_in - 200) * 1000;
      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get WeChat access token', error);
      throw new Error('Failed to get WeChat access token');
    }
  }

  async getWechatPhoneNumber(mobileCode: string) {
    try {
      const token = await this.getAccessToken();
      const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`;

      const response = await axios.post(url, { code: mobileCode });
      const data = response.data;

      if (data.errcode !== 0) {
        this.logger.error(
          `WeChat PhoneNumber API error: ${data.errcode} - ${data.errmsg}`,
        );
        throw new BadRequestException(
          `Failed to get phone number: ${data.errmsg}`,
        );
      }

      return data.phone_info; // { phoneNumber, purePhoneNumber, countryCode, watermark }
    } catch (error) {
      this.logger.error('Failed to get WeChat phone number', error);
      throw error;
    }
  }

  async wechatMobileLogin(code: string, mobileCode: string) {
    // 1. Get OpenID
    const { openid } = await this.jscode2session(code);

    // 2. Get Phone Number
    // Note: If you don't have Enterprise Wechat Mini Program, this will fail.
    // For development with personal account, you might need to mock this or stick to manual SMS.
    let phoneNumber: string;
    try {
      const phoneInfo = await this.getWechatPhoneNumber(mobileCode);
      phoneNumber = phoneInfo.purePhoneNumber;
    } catch (e) {
      // Fallback or rethrow? User asked for "Official Method", so we assume they have permissions.
      // But if it fails, maybe we can throw specific error.
      this.logger.warn(
        'Failed to get phone number from WeChat, maybe personal account?',
      );
      throw e;
    }

    // 3. Find or Create User
    let user = await this.usersService.findByExternalId(openid);

    if (user) {
      // Update phone if missing or changed (though usually we trust the one bound)
      if (!user.phoneNumber) {
        user.phoneNumber = phoneNumber;
        await user.save();
      }
    } else {
      // Create new user
      // Check if phone number is already used by another user?
      // In WeChat logic, phone + openid is the identity.
      // If phone exists on another openid, we might have a merge conflict.
      // For MVP, we assume 1:1 or just create.

      const existingPhoneUser = await this.usersService['repo'].findOne({
        where: { phoneNumber },
      });

      if (existingPhoneUser) {
        // Phone already registered with another OpenID?
        // This is a complex case. For now, maybe we just login that user and update OpenID?
        // Or reject? Let's assume we link them.
        existingPhoneUser.externalId = openid; // Link to this new WeChat
        user = await existingPhoneUser.save();
      } else {
        user = await this.usersService.createOrUpdateUser({
          externalId: openid,
          phoneNumber: phoneNumber,
        });
      }
    }

    // 4. Generate Token Pair
    const tokens = await this.generateTokenPair(user.id, user.externalId, user.persona);

    return {
      ...tokens,
      user: {
        id: user.id,
        externalId: user.externalId,
        displayName: user.displayName,
        targetSchool: user.targetSchool,
        targetMajor: user.targetMajor,
        persona: user.persona,
      },
    };
  }

  async wechatLogin(code: string) {
    const { openid } = await this.jscode2session(code);
    const user = await this.usersService.findByExternalId(openid);

    if (user) {
      // User exists, generate token pair
      const tokens = await this.generateTokenPair(user.id, user.externalId, user.persona);
      return {
        ...tokens,
        user: {
          id: user.id,
          externalId: user.externalId,
          displayName: user.displayName,
          targetSchool: user.targetSchool,
          targetMajor: user.targetMajor,
          persona: user.persona,
        },
      };
    } else {
      // User does not exist, return openid for binding
      return {
        needBinding: true,
        openid,
      };
    }
  }

  async sendSmsCode(phoneNumber: string) {
    await this.smsService.sendCode(phoneNumber);
    return { success: true };
  }

  async login(dto: LoginDto) {
    let user = await this.usersService.findByExternalId(dto.externalId);

    if (user) {
      if (!user.phoneNumber && !dto.phoneNumber) {
        // Allow login without phone number (skip binding)
        // throw new UnauthorizedException('BIND_PHONE_REQUIRED');
      }
      if (
        user.phoneNumber &&
        dto.phoneNumber &&
        user.phoneNumber !== dto.phoneNumber
      ) {
        throw new BadRequestException('OPENID_BOUND_TO_ANOTHER_PHONE');
      }
    } else {
      if (dto.phoneNumber && dto.smsCode) {
        const isValid = this.smsService.validateCode(
          dto.phoneNumber,
          dto.smsCode,
        );
        if (!isValid) {
          throw new UnauthorizedException('INVALID_OR_EXPIRED_SMS_CODE');
        }
        const phoneUser = await this.usersService['repo'].findOne({
          where: { phoneNumber: dto.phoneNumber },
        });
        if (phoneUser) {
          throw new BadRequestException('PHONE_ALREADY_REGISTERED');
        }
      }
      // If no phone provided, just proceed to create user
    }

    user = await this.usersService.createOrUpdateUser({
      externalId: dto.externalId,
      displayName: dto.displayName,
      avatarUrl: dto.avatarUrl,
      // Convert empty string to undefined so we don't violate unique constraint
      phoneNumber: dto.phoneNumber || undefined,
      targetSchool: dto.targetSchool,
      targetMajor: dto.targetMajor,
      persona: dto.persona,
    });

    // Generate token pair
    const tokens = await this.generateTokenPair(user.id, user.externalId, user.persona);

    return {
      ...tokens,
      user: {
        id: user.id,
        externalId: user.externalId,
        displayName: user.displayName,
        targetSchool: user.targetSchool,
        targetMajor: user.targetMajor,
        persona: user.persona,
      },
    };
  }
}
