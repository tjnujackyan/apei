import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('wechat/login')
  wechatLogin(@Body('code') code: string) {
    return this.authService.wechatLogin(code);
  }

  @Post('wechat/mobile-login')
  wechatMobileLogin(@Body() body: { code: string; mobileCode: string }) {
    return this.authService.wechatMobileLogin(body.code, body.mobileCode);
  }

  @Post('sms')
  sendSms(@Body('phoneNumber') phoneNumber: string) {
    return this.authService.sendSmsCode(phoneNumber);
  }

  /**
   * 刷新 token
   * 使用 refresh token 获取新的 access token 和 refresh token
   */
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  /**
   * 登出
   * 撤销当前用户的所有 refresh token
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any) {
    await this.authService.logout(req.user.userId);
    return { success: true };
  }
}
