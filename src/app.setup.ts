import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * Configuración compartida por main.ts y los tests e2e, para que ambos
 * corran contra el mismo pipeline (prefijo, seguridad, validación, filtros).
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(helmet());

  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:4300').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Plataforma I+D — API')
    .setDescription('Backend de la plataforma de Innovación y Desarrollo de Blackbird Labs.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
