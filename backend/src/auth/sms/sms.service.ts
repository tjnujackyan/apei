import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface CodeRecord {
  code: string;
  expires: number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly codes = new Map<string, CodeRecord>();

  constructor(private readonly configService: ConfigService) {}

  async sendCode(phoneNumber: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;
    this.codes.set(phoneNumber, { code, expires });
    this.logger.log(`SMS ${phoneNumber} ${code}`);

    const appCode = this.configService.get<string>('SMS_APP_CODE');
    const templateId = this.configService.get<string>('SMS_TEMPLATE_ID');
    const signId = this.configService.get<string>('SMS_SIGN_ID');

    if (!appCode || appCode === 'your_app_code_here') {
      this.logger.warn('SMS AppCode not set, skipping real SMS send');
      return code;
    }

    const url = 'https://gyytz.market.alicloudapi.com/sms/smsSend';

    // Format: **code**:12345,**minute**:5
    const param = `**code**:${code},**minute**:5`;

    try {
      const response = await axios.post(url, null, {
        params: {
          mobile: phoneNumber,
          templateId: templateId,
          smsSignId: signId,
          param: param,
        },
        headers: {
          Authorization: `APPCODE ${appCode}`,
        },
      });

      this.logger.log(`SMS API Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      this.logger.error('Failed to send SMS', error);
      // We might not want to throw here to allow dev testing with logged code
    }

    return code;
  }

  validateCode(phoneNumber: string, code: string): boolean {
    const record = this.codes.get(phoneNumber);
    if (!record) return false;
    if (Date.now() > record.expires) {
      this.codes.delete(phoneNumber);
      return false;
    }
    if (record.code === code) {
      this.codes.delete(phoneNumber);
      return true;
    }
    return false;
  }
}
