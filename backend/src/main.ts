import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();
  // 0.0.0.0: acepta conexiones de otras máquinas (prueba conjunta por Tailscale), no solo de localhost.
  await app.listen(app.get(ConfigService).get<number>('PORT'), '0.0.0.0');
}
bootstrap();
