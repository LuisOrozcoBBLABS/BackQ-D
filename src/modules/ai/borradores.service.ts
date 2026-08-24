import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RequestUser } from '../../common/types/request-user';
import { BorradorDesdeDocumentoDto } from './dto/borrador.dto';
import { extraerTexto } from './extraccion';
import { FormatoDocumento, detectarFormato, nombreSeguro } from './formato';
import { PROVEEDOR_IA, ProveedorIA } from './proveedor';
import { esquemaBorrador, instruccionSistema, promptBorrador } from './prompts/borrador-proyecto';
import { BorradorSaneado, extraerJson, sanearBorrador } from './saneamiento';

/**
 * Los cuatro campos de multer que realmente usamos.
 *
 * No hace falta @types/multer: MulterOptions de @nestjs/platform-express es
 * autocontenida, y agregar un @types solo para tipar un parámetro va contra el
 * ethos del repo (que eligió @node-rs/argon2 para no arrastrar node-gyp).
 */
export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Forma de la respuesta. El detalle que importa: los metadatos van como HERMANOS
 * de `borrador`, nunca adentro.
 *
 * POST /projects valida con forbidNonWhitelisted, así que si el front hiciera
 * `{...respuesta}` en el body comería un 400. Con esta forma,
 * `{...respuesta.borrador}` es exactamente el CreateProjectDto y nada más.
 */
export interface RespuestaBorrador {
  borrador: BorradorSaneado;
  avisos: string[];
  origen: {
    archivo: string;
    formato: FormatoDocumento;
    caracteresLeidos: number;
    truncado: boolean;
  };
  modelo: string;
}

const MAX_CARACTERES_POR_DEFECTO = 24_000;
const MAX_PAGINAS_POR_DEFECTO = 40;

@Injectable()
export class BorradoresService {
  private readonly logger = new Logger(BorradoresService.name);

  constructor(@Inject(PROVEEDOR_IA) private readonly ia: ProveedorIA) {}

  async desdeDocumento(
    archivo: ArchivoSubido | undefined,
    dto: BorradorDesdeDocumentoDto,
    user: RequestUser,
  ): Promise<RespuestaBorrador> {
    const arrancoEn = Date.now();

    if (!archivo?.buffer) {
      throw new BadRequestException('Falta el archivo. Se manda en el campo "archivo".');
    }

    // Antes de tocar el archivo: si el motor está apagado no hay nada que hacer,
    // y no tiene sentido gastar CPU extrayendo texto que nadie va a leer.
    if (!this.ia.configurado) {
      throw new ServiceUnavailableException(
        'El motor de IA no está habilitado en este servidor. Registrá el proyecto a mano por ahora.',
      );
    }

    const reconocido = detectarFormato(archivo.buffer, archivo.mimetype);
    if (!reconocido.ok) throw new BadRequestException(reconocido.motivo);

    const extraido = await extraerTexto(archivo.buffer, reconocido.formato, {
      maxCaracteres: this.maxCaracteres,
      maxPaginasPdf: this.maxPaginas,
    });
    if (!extraido.ok) throw new BadRequestException(extraido.motivo);

    const respuesta = await this.pedirBorrador(extraido.datos.texto, dto.contexto);

    const crudo = extraerJson(respuesta.texto);
    const nombreArchivo = nombreSeguro(archivo.originalname);
    const saneado = sanearBorrador(crudo, { nombreArchivo });

    if (!saneado) {
      // El modelo respondió, pero con algo de lo que no se rescata nada.
      throw new BadGatewayException(
        'El modelo devolvió una respuesta que no se pudo interpretar. Probá de nuevo.',
      );
    }

    const avisos = [...saneado.avisos];
    if (extraido.datos.truncado) {
      avisos.unshift(
        'El documento era muy largo: la IA leyó solo el principio. Revisá que no falte nada importante.',
      );
    }

    /**
     * Política de logs (ver el plan, A9). Se logean números, enums y un UUID.
     * NO se logea: el texto extraído (ni un fragmento, ni un "preview para
     * debug"), el prompt, la respuesta del modelo, ni el NOMBRE DEL ARCHIVO —
     * que es PII ("Acta despido Juan Pérez.pdf"). El nombre sí se devuelve al
     * front, porque es el archivo que esa persona acaba de subir en esa misma
     * sesión: no hay exposición nueva. Pero no entra al log.
     */
    this.logger.log(
      `borrador-proyecto userId=${user.id} formato=${reconocido.formato} ` +
        `caracteres=${extraido.datos.caracteresLeidos} truncado=${extraido.datos.truncado} ` +
        `paginas=${extraido.datos.paginas ?? '-'} duracionMs=${Date.now() - arrancoEn} ` +
        `modelo=${respuesta.modelo} tokens=${respuesta.tokens ?? '-'} avisos=${avisos.length}`,
    );

    return {
      borrador: saneado.borrador,
      avisos,
      origen: {
        archivo: nombreArchivo,
        formato: reconocido.formato,
        caracteresLeidos: extraido.datos.caracteresLeidos,
        truncado: extraido.datos.truncado,
      },
      modelo: respuesta.modelo,
    };
  }

  /**
   * Una sola llamada, con un único reintento si el fallo fue transitorio.
   *
   * Un solo reintento y no más: hay una única key para todo el backend, así que
   * insistir contra un 429 le quema la cuota al resto del equipo.
   */
  private async pedirBorrador(
    texto: string,
    contexto?: string,
  ): Promise<{ texto: string; modelo: string; tokens?: number }> {
    const peticion = {
      instruccionSistema: instruccionSistema(),
      prompt: promptBorrador(texto, contexto),
      esquema: esquemaBorrador(),
    };

    let ultimo = await this.ia.generarJson(peticion);
    if (!ultimo.ok && ultimo.reintentable) {
      ultimo = await this.ia.generarJson(peticion);
    }

    if (!ultimo.ok) {
      // Lo transitorio es 503 (volvé a intentar); lo definitivo también, porque
      // desde el navegador no hay nada que corregir: es configuración nuestra.
      throw new ServiceUnavailableException(ultimo.motivo);
    }

    return { texto: ultimo.texto, modelo: ultimo.modelo, tokens: ultimo.tokens };
  }

  private get maxCaracteres(): number {
    return enteroDelEntorno(process.env.AI_MAX_CARACTERES, MAX_CARACTERES_POR_DEFECTO);
  }

  private get maxPaginas(): number {
    return enteroDelEntorno(process.env.AI_MAX_PAGINAS_PDF, MAX_PAGINAS_POR_DEFECTO);
  }
}

function enteroDelEntorno(crudo: string | undefined, porDefecto: number): number {
  const valor = Number(crudo);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}
