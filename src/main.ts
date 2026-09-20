import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  await app.listen(port);
  Logger.log(`HTTP ${port}`, 'Bootstrap');
}

void bootstrap();
