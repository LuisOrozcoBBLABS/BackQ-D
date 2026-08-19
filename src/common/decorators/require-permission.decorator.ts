import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige uno o más permisos para entrar al handler. La evaluación ocurre en el
 * servidor (PermissionsGuard); el front ya no es la única barrera.
 */
export const RequirePermission = (...permisos: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permisos);
