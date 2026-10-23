import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  const host =
    process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
  await app.listen(port, host);
  Logger.log(`HTTP ${host}:${port}`, 'Bootstrap');
}

void bootstrap();
