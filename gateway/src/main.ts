import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { GatewayConfig, loadConfig } from './config';
import { configureGateway } from './gateway.setup';

/** Crea el gateway listo para escuchar (lo usan main y los tests). */
export async function createGateway(config: GatewayConfig) {
  // bodyParser: false → el cuerpo llega intacto al microservicio (el gateway no lo lee ni lo transforma).
  const app = await NestFactory.create(AppModule.register(config), {
    bodyParser: false,
    logger: config.logLevel === 'silent' ? false : ['error', 'warn', 'log'],
  });
  configureGateway(app, config);
  return app;
}

async function bootstrap() {
  const config = loadConfig();
  const app = await createGateway(config);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  const routes = Object.entries(config.services).map(([name, url]) => `${name} → ${url}`).join(', ');
  new Logger('Gateway').log(`API Gateway en el puerto ${config.port}; servicios: ${routes}`);
}

if (require.main === module) bootstrap();
