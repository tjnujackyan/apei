import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssistantPersona = 'neutral' | 'duzhe_xiaoxin' | 'nana_zejie';
export type UserGender = 'male' | 'female' | 'other' | 'unknown';

/**
 * 聊天界面 DIY 配置
 */
export interface ChatDiyConfig {
  customAvatarUrl?: string;
  customBackgroundUrl?: string;
  /** COS 存储 Key（用于动态刷新签名 URL，避免过期） */
  avatarStorageKey?: string;
  bgStorageKey?: string;
  bubbleStyle?: number;
  fontStyle?: number;
}

@Entity({ name: 'users' })
export class UserEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  externalId: string;

  @Column({ unique: true, nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  /**
   * 用户性别
   */
  @Column({ default: 'unknown' })
  gender: UserGender;

  @Column({ nullable: true })
  targetSchool?: string;

  @Column({ nullable: true })
  targetMajor?: string;

  @Column({ nullable: true })
  targetScore?: number;

  @Column({ nullable: true })
  subjects?: string; // Comma separated list: "politics,english,math,cs408"

  @Column({ nullable: true })
  dailyStudyHours?: string; // e.g., "3-5"

  @Column({ default: 'neutral' })
  persona: AssistantPersona;

  /**
   * 聊天界面 DIY 配置（JSON 格式存储）
   */
  @Column({ type: 'text', nullable: true })
  chatDiyConfig?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * 获取解析后的 DIY 配置
   */
  getChatDiyConfig(): ChatDiyConfig {
    if (!this.chatDiyConfig) return {};
    try {
      return JSON.parse(this.chatDiyConfig);
    } catch {
      return {};
    }
  }

  /**
   * 设置 DIY 配置
   */
  setChatDiyConfig(config: ChatDiyConfig): void {
    this.chatDiyConfig = JSON.stringify(config);
  }
}
