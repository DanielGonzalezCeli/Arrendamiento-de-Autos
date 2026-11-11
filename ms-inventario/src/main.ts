import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

/** Sin CORS: a este servicio solo lo llaman RabbitMQ (eventos) y ms-reservas (API interna), nunca un navegador. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).get<number>('PORT')!, '0.0.0.0');
}
bootstrap();
