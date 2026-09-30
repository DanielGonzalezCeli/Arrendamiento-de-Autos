import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './entities/outbox-event.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { MaintenanceService } from './maintenance.service';
import { OutboxService } from './outbox.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookSubscriptionService } from './webhook-subscription.service';

/** EDA: outbox transaccional, suscripciones y entrega de webhooks, y tareas periódicas. */
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, WebhookSubscription, WebhookDelivery])],
  providers: [OutboxService, WebhookSubscriptionService, WebhookDispatcherService, MaintenanceService],
  exports: [OutboxService, WebhookSubscriptionService, WebhookDispatcherService, MaintenanceService],
})
export class EventsModule {}
