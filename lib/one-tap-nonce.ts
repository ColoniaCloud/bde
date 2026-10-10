import 'server-only';

/** Cookie y vigencia del nonce de «Continuar como…», compartidas por sus dos rutas. */
export const NONCE_COOKIE = 'google_nonce';
export const NONCE_COOKIE_PATH = '/api/auth/google';
// One Tap puede quedar abierto mientras la persona mira la tienda: más margen
// que los diez minutos del flujo por redirección.
export const NONCE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
