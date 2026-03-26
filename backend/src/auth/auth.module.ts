import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SmsModule } from './sms/sms.module';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule,
    SmsModule,
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const expiresInFromEnv = config.get<string>('jwt.expiresIn');
        const expiresIn = Number.isFinite(Number(expiresInFromEnv))
          ? Number(expiresInFromEnv)
          : 7200;
        const signOptions: JwtSignOptions = { expiresIn };
        return {
          secret: config.getOrThrow<string>('jwt.secret'),
          signOptions,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
