import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.normalizeException(exception);

    const payload = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(
      `${request.method} ${request.url} -> ${status} | ${message}`,
      (exception as Error)?.stack,
    );

    response.status(status).json(payload);
  }

  private normalizeException(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const normalized =
        typeof response === 'string'
          ? { message: response, error: undefined }
          : response;

      return {
        status,
        message:
          (normalized as { message?: string }).message ??
          (exception.message || 'Unexpected error'),
        error: (normalized as { error?: string }).error,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: (exception as Error)?.message || 'Internal server error',
      error: 'InternalServerError',
    };
  }
}
