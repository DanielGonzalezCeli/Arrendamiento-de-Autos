import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

/** Header X-API-Deprecation-Date del contrato (opcional): se envía si API_DEPRECATION_DATE está configurada. */
@Injectable()
export class DeprecationHeaderInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const date = this.config.get<string>('API_DEPRECATION_DATE');
    if (date) context.switchToHttp().getResponse().setHeader('X-API-Deprecation-Date', date);
    return next.handle();
  }
}
