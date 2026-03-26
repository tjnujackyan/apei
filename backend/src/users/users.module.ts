import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from './user.entity';
import { UsersController } from './users.controller';
import { SmsModule } from '../auth/sms/sms.module';
import { StorageModule } from '../imports/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), SmsModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
