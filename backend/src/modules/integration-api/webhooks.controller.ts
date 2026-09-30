import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotImplementedException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AutosScope, IntegrationAuthGuard, RequireScopes } from '../integration-auth/integration-auth.guard';

const PENDING = 'Webhooks en construcción (Fase 12 del plan)';

/** API de integración — "Webhooks". Seguridad ya aplicada; la lógica llega en la Fase 12. */
@ApiExcludeController()
@Controller('webhooks')
@UseGuards(IntegrationAuthGuard)
@RequireScopes(AutosScope.Webhooks)
export class WebhooksController {
  @Get()
  list() {
    throw new NotImplementedException(PENDING);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() _body: unknown) {
    throw new NotImplementedException(PENDING);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') _id: string) {
    throw new NotImplementedException(PENDING);
  }
}
