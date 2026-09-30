import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WebhookSubscriptionService } from '../events/webhook-subscription.service';
import {
  AutosScope, CurrentPrincipal, IntegrationAuthGuard, IntegrationPrincipal, RequireScopes,
} from '../integration-auth/integration-auth.guard';
import { WebhookSubscriptionDto } from './dto/webhook.dto';

/**
 * API de integración — "Webhooks" (scope autos:webhooks). Cada sistema gestiona SUS suscripciones.
 * Los eventos se entregan con POST {url} firmado (callback carEvent del contrato).
 */
@ApiExcludeController()
@Controller('webhooks')
@UseGuards(IntegrationAuthGuard)
@RequireScopes(AutosScope.Webhooks)
export class WebhooksController {
  constructor(private readonly subscriptions: WebhookSubscriptionService) {}

  /** 200 WebhookSubscription[] (sin secret). */
  @Get()
  list(@CurrentPrincipal() principal: IntegrationPrincipal) {
    return this.subscriptions.list(principal.sub);
  }

  /** 201 WebhookSubscription (incluye el secret solo en esta respuesta). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: WebhookSubscriptionDto, @CurrentPrincipal() principal: IntegrationPrincipal) {
    return this.subscriptions.create(principal.sub, body);
  }

  /** 204 sin cuerpo. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentPrincipal() principal: IntegrationPrincipal): Promise<void> {
    await this.subscriptions.remove(principal.sub, id);
  }
}
