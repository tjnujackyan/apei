import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { QuestionSetEntity } from '../question-bank/entities/question-set.entity';
import { QuestionEntity } from '../question-bank/entities/question.entity';
import { ImportJobEntity } from '../imports/entities/import-job.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('db.type');
        const dbHost = config.get<string>('db.host');
        const isSqlite = dbType === 'sqlite' || !dbHost;
        const isMysql = dbType === 'mysql';
        
        // 🔧 调试日志：打印数据库配置
        console.log('========================================');
        console.log('🔧 数据库配置信息:');
        console.log(`  DB_TYPE 环境变量: ${process.env.DB_TYPE || '未设置'}`);
        console.log(`  配置中的 db.type: ${dbType}`);
        console.log(`  db.host: ${dbHost || '未设置'}`);
        console.log(`  db.port: ${config.get<number>('db.port') || '未设置'}`);
        console.log(`  db.name: ${config.get<string>('db.name') || '未设置'}`);
        console.log(`  db.user: ${config.get<string>('db.user') || '未设置'}`);
        console.log(`  判断结果 - isSqlite: ${isSqlite}, isMysql: ${isMysql}`);
        console.log(`  最终使用的数据库类型: ${isSqlite ? 'sqlite' : dbType}`);
        console.log('========================================');
        
        return {
          type: isSqlite ? 'sqlite' : (dbType as 'mysql' | 'postgres' | 'sqlite'),
          database: isSqlite
            ? config.get<string>('db.sqlitePath') || 'dev.db'
            : config.get<string>('db.name'),
          host: isSqlite ? undefined : config.get<string>('db.host'),
          port: isSqlite ? undefined : (config.get<number>('db.port') ?? 3306),
          username: isSqlite ? undefined : config.get<string>('db.user'),
          password: isSqlite ? undefined : config.get<string>('db.password'),
          // MySQL 需要 utf8mb4 才能支持 emoji
          charset: isMysql ? 'utf8mb4' : undefined,
          extra: isMysql ? { charset: 'utf8mb4_unicode_ci' } : undefined,
          synchronize: true, // Note: Be careful with synchronize in production
          autoLoadEntities: true,
          entities: [
            UserEntity,
            QuestionSetEntity,
            QuestionEntity,
            ImportJobEntity,
          ],
          // 数据库连接重试配置
          retryAttempts: 10,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
