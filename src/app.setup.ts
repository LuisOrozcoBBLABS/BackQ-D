import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * Configuración compartida por main.ts y los tests e2e, para que ambos
 * corran contra el mismo pipeline (prefijo, seguridad, validación, filtros).
 */
export function configureApp(app: INestApplication): void {
  // Detras de un reverse proxy, sin esto req.ip es la IP del proxy para TODOS,
  // asi que el throttler ve un solo cliente y el limite de login de 5/min deja
  // de ser por atacante y pasa a ser global: cinco peticiones por minuto dejan
  // sin login a toda la organizacion.
  // El 1 cuenta UN salto de confianza y es deliberado. Con `true` cualquiera
  // podria falsear su IP inyectando X-Forwarded-For y saltarse el limite, que
  // es la vulnerabilidad opuesta. Ajustar al numero real de proxies delante.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(helmet());

  app.enableCors({
    // El trim importa: "http://a.com, http://b.com" produce " http://b.com"
    // con espacio, que nunca hace match y falla en runtime sin explicacion.
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:4300')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
    credentials: true,
    // Sin esto el navegador oculta la cabecera y el front no puede paginar.
    exposedHeaders: ['X-Total-Count'],
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
    .setTitle('Plataforma R&D — API')
    .setDescription('Backend de la plataforma de Innovación y Desarrollo de Blackbird Labs.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
