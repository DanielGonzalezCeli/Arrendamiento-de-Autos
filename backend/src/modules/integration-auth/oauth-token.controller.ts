import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { ApiClient } from './entities/api-client.entity';
import { IntegrationKeysService } from './integration-keys.service';

interface TokenRequest {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
}

/**
 * Emisor OAuth2 LOCAL (solo RDA1). NO es parte de autos-openapi.yaml: sustituye temporalmente a
 * auth.booking-hub.com. Implementa el grant client_credentials (RFC 6749 §4.4) con errores RFC 6749 §5.2.
 * En RDA2 se desactiva (LOCAL_OAUTH_ISSUER_ENABLED=false) y los tokens los emite el IdP central.
 */
@ApiExcludeController()
@Controller()
export class OAuthTokenController {
  constructor(
    private readonly keys: IntegrationKeysService,
    @InjectRepository(ApiClient) private readonly clients: Repository<ApiClient>,
  ) {}

  @Get('.well-known/jwks.json')
  jwks() {
    this.assertEnabled();
    return this.keys.jwks();
  }

  @Post('oauth2/token')
  @HttpCode(200)
  async token(@Body() body: TokenRequest, @Headers('authorization') authorization: string | undefined, @Res({ passthrough: true }) res: Response) {
    this.assertEnabled();
    res.setHeader('Cache-Control', 'no-store');

    if (body.grant_type !== 'client_credentials') {
      return this.oauthError(res, 400, 'unsupported_grant_type', 'Solo se admite grant_type=client_credentials');
    }

    const credentials = this.readCredentials(body, authorization);
    const client = credentials ? await this.clients.findOne({ where: { clientId: credentials.clientId, active: true } }) : null;
    if (!client || !(await bcrypt.compare(credentials!.clientSecret, client.clientSecretHash))) {
      res.setHeader('WWW-Authenticate', 'Basic realm="autos-api"');
      return this.oauthError(res, 401, 'invalid_client', 'Credenciales de cliente inválidas');
    }

    const requested = body.scope?.split(' ').filter(Boolean) ?? client.scopes;
    const notAllowed = requested.filter((scope) => !client.scopes.includes(scope));
    if (notAllowed.length) {
      return this.oauthError(res, 400, 'invalid_scope', `Scopes no permitidos: ${notAllowed.join(' ')}`);
    }

    const accessToken = await this.keys.sign(`client:${client.clientId}`, requested, {
      client_id: client.clientId,
      ...(client.affiliateId ? { affiliate_id: client.affiliateId } : {}),
    });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: this.keys.tokenTtlSeconds, scope: requested.join(' ') };
  }

  /** Credenciales en el body o en HTTP Basic (RFC 6749 §2.3.1). */
  private readCredentials(body: TokenRequest, authorization?: string): { clientId: string; clientSecret: string } | null {
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separator)),
          clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
        };
      }
    }
    return body.client_id && body.client_secret ? { clientId: body.client_id, clientSecret: body.client_secret } : null;
  }

  private oauthError(res: Response, status: number, error: string, description: string) {
    res.status(status);
    return { error, error_description: description };
  }

  private assertEnabled(): void {
    if (!this.keys.localIssuerEnabled) throw new NotFoundException();
  }
}
