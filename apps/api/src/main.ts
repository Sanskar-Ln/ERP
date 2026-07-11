/**
 * API entrypoint. Serves REST under /api/v1 with Swagger docs at /api/docs.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Money columns are BigInt paise in PostgreSQL. All real amounts fit far
// inside Number.MAX_SAFE_INTEGER (~₹90 trillion), so JSON serialization
// converts BigInt → number, throwing loudly if a value ever exceeds the
// safe range instead of silently corrupting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function (): number {
  const n = Number(this);
  if (!Number.isSafeInteger(n)) throw new RangeError(`BigInt ${this} exceeds safe JSON integer range`);
  return n;
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors(); // web admin & mobile clients are separate origins

  const config = new DocumentBuilder()
    .setTitle('Jewellery ERP API')
    .setDescription('Multi-tenant jewellery & gems ERP — REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port} — docs at /api/docs`);
}

void bootstrap();
