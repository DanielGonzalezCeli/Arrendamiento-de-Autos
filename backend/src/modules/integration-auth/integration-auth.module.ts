import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AffiliateGuard } from './affiliate.guard';
import { ApiClient } from './entities/api-client.entity';
import { Affiliate } from './entities/affiliate.entity';
import { IntegrationAuthGuard } from './integration-auth.guard';
import { IntegrationKeysService } from './integration-keys.service';
import { IntegrationThrottlerGuard } from './integration-throttler.guard';
import { OAuthTokenController } from './oauth-token.controller';

/** Seguridad de la API de integración: OAuth2 (RS256 + scopes), X-Affiliate-Id y rate limit. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Affiliate, ApiClient])],
  controllers: [OAuthTokenController],
  providers: [IntegrationKeysService, IntegrationAuthGuard, AffiliateGuard, IntegrationThrottlerGuard],
  exports: [IntegrationKeysService, IntegrationAuthGuard, AffiliateGuard, IntegrationThrottlerGuard, TypeOrmModule],
})
export class IntegrationAuthModule {}
