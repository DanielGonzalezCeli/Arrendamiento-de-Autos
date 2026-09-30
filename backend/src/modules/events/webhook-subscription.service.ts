import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SecretBox } from '../../common/crypto/secret-box';
import { DomainError, ProblemCode } from '../../domain/domain-error';
import { webhookUrlProblem } from '../../domain/webhook-rules';
import { isUuid } from '../orders/uuid';
import { WebhookSubscription } from './entities/webhook-subscription.entity';

export interface NewSubscription {
  id: string;
  url: string;
  events: string[];
  secret?: string;
}

/** Suscripción tal como se devuelve: el secret solo aparece al crearla (luego nunca). */
export interface SubscriptionView {
  id: string;
  url: string;
  events: string[];
  secret?: string;
}

/**
 * Suscripciones a webhooks (GET/POST/DELETE /webhooks). Cada sistema solo ve y borra las suyas (owner = sub).
 * El secret HMAC se guarda cifrado; si el cliente no lo envía, se genera y se devuelve UNA vez.
 */
@Injectable()
export class WebhookSubscriptionService {
  private readonly box: SecretBox;
  private readonly allowInsecureUrls: boolean;

  constructor(
    @InjectRepository(WebhookSubscription) private readonly subscriptions: Repository<WebhookSubscription>,
    config: ConfigService,
  ) {
    this.box = SecretBox.fromConfig(config.get('DATA_ENCRYPTION_KEY'), config.getOrThrow('USER_JWT_SECRET'));
    // En desarrollo y tests se permiten receptores locales (http://127.0.0.1…); en producción no (anti-SSRF).
    this.allowInsecureUrls = config.get('NODE_ENV') !== 'production';
  }

  async list(ownerSub: string): Promise<SubscriptionView[]> {
    const rows = await this.subscriptions.find({ where: { ownerSub, active: true }, order: { createdAt: 'ASC' } });
    return rows.map((s) => ({ id: s.id, url: s.url, events: s.events }));
  }

  async create(ownerSub: string, input: NewSubscription): Promise<SubscriptionView> {
    const urlProblem = webhookUrlProblem(input.url, this.allowInsecureUrls);
    if (urlProblem) throw DomainError.validation(`URL de webhook no permitida: ${urlProblem}`, [{ name: 'url', reason: urlProblem }]);

    // El id lo envía el cliente (WebhookSubscription.id es requerido en el contrato).
    if (await this.subscriptions.exists({ where: { id: input.id } })) {
      throw new DomainError(ProblemCode.ValidationFailed, 409, 'Conflicto', 'Ya existe una suscripción con ese id');
    }

    const secret = input.secret ?? randomBytes(32).toString('base64url');
    const saved = await this.subscriptions.save(this.subscriptions.create({
      id: input.id,
      ownerSub,
      url: input.url,
      events: [...new Set(input.events)],
      secretEncrypted: this.box.encrypt(secret),
      active: true,
    }));
    return { id: saved.id, url: saved.url, events: saved.events, secret };
  }

  async remove(ownerSub: string, id: string): Promise<void> {
    const subscription = isUuid(id) ? await this.subscriptions.findOne({ where: { id, ownerSub } }) : null;
    if (!subscription) throw DomainError.notFound('La suscripción no existe');
    // Borrado físico: las entregas pendientes se eliminan en cascada (FK ON DELETE CASCADE).
    await this.subscriptions.delete({ id });
  }

  /** Para el dispatcher: secret en claro de una suscripción. */
  revealSecret(subscription: WebhookSubscription): string {
    return this.box.decrypt(subscription.secretEncrypted!);
  }
}
