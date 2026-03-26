import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssistantPersona, UserEntity, UserGender, ChatDiyConfig } from './user.entity';
import { SmsService } from '../auth/sms/sms.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    private readonly smsService: SmsService,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByExternalId(externalId: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { externalId } });
  }

  async createOrUpdateUser(payload: {
    externalId: string;
    displayName?: string;
    avatarUrl?: string;
    phoneNumber?: string;
    gender?: UserGender;
    targetSchool?: string;
    targetMajor?: string;
    targetScore?: number;
    subjects?: string;
    dailyStudyHours?: string;
    persona?: AssistantPersona;
  }): Promise<UserEntity> {
    const existing = await this.findByExternalId(payload.externalId);
    if (existing) {
      existing.displayName = payload.displayName ?? existing.displayName;
      existing.avatarUrl = payload.avatarUrl ?? existing.avatarUrl;
      existing.phoneNumber = payload.phoneNumber ?? existing.phoneNumber;
      existing.gender = payload.gender ?? existing.gender;
      existing.targetSchool = payload.targetSchool ?? existing.targetSchool;
      existing.targetMajor = payload.targetMajor ?? existing.targetMajor;
      existing.targetScore = payload.targetScore ?? existing.targetScore;
      existing.subjects = payload.subjects ?? existing.subjects;
      existing.dailyStudyHours = payload.dailyStudyHours ?? existing.dailyStudyHours;
      existing.persona = payload.persona ?? existing.persona;
      return this.repo.save(existing);
    }
    const user = this.repo.create({
      externalId: payload.externalId,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      phoneNumber: payload.phoneNumber,
      gender: payload.gender ?? 'unknown',
      targetSchool: payload.targetSchool,
      targetMajor: payload.targetMajor,
      targetScore: payload.targetScore,
      subjects: payload.subjects,
      dailyStudyHours: payload.dailyStudyHours,
      persona: payload.persona ?? 'neutral',
    });
    return this.repo.save(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // 处理 chatDiyConfig 特殊字段（需要转换为 JSON 字符串）
    if (dto.chatDiyConfig !== undefined) {
      user.setChatDiyConfig(dto.chatDiyConfig as ChatDiyConfig);
    }
    
    // 复制其他字段
    const { chatDiyConfig, ...rest } = dto;
    Object.assign(user, rest);
    
    return this.repo.save(user);
  }

  async updatePhone(
    userId: string,
    phoneNumber: string,
    smsCode: string,
  ): Promise<UserEntity> {
    // 验证验证码
    const isValid = this.smsService.validateCode(phoneNumber, smsCode);
    if (!isValid) {
      throw new BadRequestException('验证码错误或已过期');
    }

    // 检查手机号是否已被其他用户绑定
    const existingUser = await this.repo.findOne({ where: { phoneNumber } });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('该手机号已被其他账号绑定');
    }

    // 更新手机号
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.phoneNumber = phoneNumber;
    return this.repo.save(user);
  }
}
