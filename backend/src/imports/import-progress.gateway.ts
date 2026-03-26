import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface ImportProgress {
  jobId: string;
  stage: 'uploading' | 'parsing' | 'generating' | 'saving' | 'completed' | 'failed';
  currentStep?: number; // 当前步骤 1 or 2
  totalSteps?: number;  // 总步骤数 2
  stepName?: string;    // 步骤名称：'导入识别' | '生题处理'
  message: string;
  error?: string;
  totalQuestions?: number;
  // 保留 progress 字段用于向后兼容，但前端不使用
  progress?: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/import-progress',
})
export class ImportProgressGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ImportProgressGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // 从查询参数、auth或headers中获取token
      const token =
        client.handshake.query?.token ||
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('Client connected without token');
        client.disconnect();
        return;
      }

      // 验证JWT
      const payload = await this.jwtService.verifyAsync(token as string);
      const userId = payload.sub || payload.userId;

      if (!userId) {
        this.logger.warn('Invalid token payload');
        client.disconnect();
        return;
      }

      // 保存用户socket映射
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // 保存userId到socket数据中
      (client as any).userId = userId;

      this.logger.log(`Client connected: ${client.id} for user ${userId}`);
    } catch (error) {
      this.logger.error('Connection authentication failed', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 向指定用户发送导入进度更新
   */
  sendProgressToUser(userId: string, progress: ImportProgress) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || socketIds.size === 0) {
      this.logger.debug(`No active sockets for user ${userId}`);
      return;
    }

    socketIds.forEach((socketId) => {
      this.server.to(socketId).emit('import-progress', progress);
    });

    this.logger.debug(
      `Sent progress to user ${userId}: ${progress.stage} ${progress.progress}%`,
    );
  }
}

