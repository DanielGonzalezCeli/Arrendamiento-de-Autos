import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/** URL absoluta de esta instancia para enlaces HATEOAS (format: uri exige URL absoluta). */
export function publicBaseUrl(config: ConfigService, request: Request): string {
  const configured = config.get<string>('PUBLIC_BASE_URL');
  return (configured || `${request.protocol}://${request.get('host')}`).replace(/\/$/, '');
}
