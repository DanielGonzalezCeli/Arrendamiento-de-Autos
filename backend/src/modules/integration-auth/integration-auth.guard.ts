import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrationKeysService, scopesFromPayload } from './integration-keys.service';

/** Scopes del contrato (securitySchemes.OAuth2Security). */
export enum AutosScope {
  Read = 'autos:read',
  Book = 'autos:book',
  Cancel = 'autos:cancel',
  Webhooks = 'autos:webhooks',
}

/** Sistema o usuario que llama a la API de integración. `sub` es el ownerId de las órdenes (contrato). */
export interface IntegrationPrincipal {
  sub: string;
  scopes: string[];
  affiliateId?: number;
}

const SCOPES_KEY = 'autos_scopes';

/** Declara el scope OAuth2 que exige un endpoint (igual que `security` en el YAML). */
export const RequireScopes = (...scopes: AutosScope[]) => SetMetadata(SCOPES_KEY, scopes);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IntegrationPrincipal => context.switchToHttp().getRequest().integrationPrincipal,
);

/**
 * Autenticación ENTRE SISTEMAS (Booking Hub → nuestra API). Independiente del login web.
 * 401: sin token, expirado, firma/emisor/audiencia inválidos. 403: token válido sin el scope requerido.
 */
@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly keys: IntegrationKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const [scheme, token] = (request.headers.authorization as string | undefined)?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Falta el access token (Authorization: Bearer)');

    let principal: IntegrationPrincipal;
    try {
      const payload = await this.keys.verify(token);
      const affiliateId = Number((payload as { affiliate_id?: unknown }).affiliate_id);
      principal = {
        sub: String(payload.sub),
        scopes: scopesFromPayload(payload),
        ...(Number.isInteger(affiliateId) && affiliateId > 0 ? { affiliateId } : {}),
      };
    } catch {
      throw new UnauthorizedException('Access token inválido o expirado');
    }

    const required = this.reflector.getAllAndOverride<AutosScope[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const missing = (required ?? []).filter((scope) => !principal.scopes.includes(scope));
    if (missing.length) throw new ForbiddenException(`El token no tiene el scope requerido: ${missing.join(', ')}`);

    request.integrationPrincipal = principal;
    return true;
  }
}
