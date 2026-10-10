/**
 * Favoritos de un cliente: una lista de códigos de producto.
 *
 * Viven en el navegador (localStorage) para quien no tiene cuenta y, con
 * sesión, también en la cuenta, así se ven en todos los dispositivos. Es
 * lógica pura para poder probarla sin navegador ni base.
 */

/** Tope razonable: evita que alguien guarde una lista enorme en su cuenta. */
export const MAX_FAVORITES = 200;

/** Deja sólo códigos válidos, sin repetir, en el orden en que llegaron. */
export function normalizeFavorites(input: unknown): number[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<number>();
  for (const value of input) {
    const code = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof code === 'number' && Number.isSafeInteger(code) && code > 0) seen.add(code);
    if (seen.size >= MAX_FAVORITES) break;
  }

  return [...seen];
}

/**
 * Une los favoritos de la cuenta con los del dispositivo al ingresar. Primero
 * van los de la cuenta, después los que sólo estaban en este dispositivo: nada
 * de lo que la persona marcó en uno u otro lado se pierde.
 */
export function mergeFavorites(account: unknown, device: unknown): number[] {
  return normalizeFavorites([...normalizeFavorites(account), ...normalizeFavorites(device)]);
}

export function sameFavorites(a: number[], b: number[]) {
  return a.length === b.length && a.every((code, index) => code === b[index]);
}
