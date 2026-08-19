import { RoleId } from '@prisma/client';

/** Lo que el guard deja en request.user tras validar el access token. */
export interface RequestUser {
  id: string;
  email: string;
  rol: RoleId;
  groupId: string | null;
  permisos: string[];
}
