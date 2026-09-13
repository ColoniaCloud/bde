import type { Access, FieldAccess } from 'payload';

/**
 * Reglas de acceso compartidas.
 *
 * Desde que existe la colección `customers`, `req.user` puede ser un cliente de
 * la tienda o alguien del panel. Escribir `Boolean(req.user)` significaría
 * dejar que un cliente edite el catálogo, así que todas las reglas del panel
 * comprueban la colección de forma explícita.
 */

type MaybeUser = { collection?: string; role?: string } | null | undefined;

function panelUser(user: MaybeUser) {
  return user?.collection === 'users' ? user : null;
}

/** Alguien del panel: administrador o editor de catálogo. */
export const isPanel: Access = ({ req }) => Boolean(panelUser(req.user as MaybeUser));

/** Sólo administrador. */
export const isAdmin: Access = ({ req }) => panelUser(req.user as MaybeUser)?.role === 'admin';

export const isAdminField: FieldAccess = ({ req }) => panelUser(req.user as MaybeUser)?.role === 'admin';

export const isPanelField: FieldAccess = ({ req }) => Boolean(panelUser(req.user as MaybeUser));
