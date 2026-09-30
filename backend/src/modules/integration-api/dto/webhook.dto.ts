import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUrl, IsUUID, Length } from 'class-validator';
import { WEBHOOK_EVENT_TYPES } from '../../events/domain-events';

/** WebhookSubscription (request de POST /webhooks). id, url y events son requeridos en el contrato. */
export class WebhookSubscriptionDto {
  /** El contrato exige que el cliente envíe el id (uuid). */
  @IsUUID()
  id: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(WEBHOOK_EVENT_TYPES, { each: true })
  events: string[];

  /** Opcional en el contrato: si no se envía, se genera y se devuelve solo en esta respuesta. */
  @IsOptional()
  @IsString()
  @Length(16, 200)
  secret?: string;
}
