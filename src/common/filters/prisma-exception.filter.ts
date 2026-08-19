import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Traduce errores de Prisma a HTTP con significado, para que el front no reciba 500 genéricos.
 * P2002 = único duplicado, P2025 = registro no encontrado, P2003 = FK en uso.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    switch (exception.code) {
      case 'P2002': {
        const campos = (exception.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'valor';
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Ya existe un registro con ese ${campos}.`,
        });
        return;
      }
      case 'P2025':
        res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'El registro no existe.',
        });
        return;
      case 'P2003':
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'El registro está referenciado por otros datos.',
        });
        return;
      default:
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error de base de datos.',
        });
    }
  }
}
