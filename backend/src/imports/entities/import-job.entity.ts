import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Entity({ name: 'import_jobs' })
export class ImportJobEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  filename: string;

  @Column()
  status: ImportJobStatus;

  @Column({ default: 0 })
  totalQuestions: number;

  @Column({ default: 0 })
  succeededQuestions: number;

  @Column({ default: 0 })
  failedQuestions: number;

  @Column({ nullable: true })
  questionSetId?: string;

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ default: 0 })
  currentStep: number; // 当前步骤：0=pending, 1=parsing, 2=generating

  @Column({ nullable: true })
  stepName?: string; // 步骤名称

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
