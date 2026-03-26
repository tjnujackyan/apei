import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class UpdatePhoneDto {
  @IsNotEmpty({ message: '手机号不能为空' })
  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phoneNumber: string;

  @IsNotEmpty({ message: '验证码不能为空' })
  @IsString()
  @Length(6, 6, { message: '验证码必须是6位' })
  smsCode: string;
}
