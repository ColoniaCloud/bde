/**
 * Datos de entrega: teléfono, dirección, ciudad y referencias.
 *
 * Todos son opcionales: la entrega se puede seguir coordinando por WhatsApp.
 * Los usan el checkout (quedan en el pedido) y la cuenta (se guardan para la
 * próxima compra). Es lógica pura para poder probarla sin base.
 */

export type Delivery = {
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
};

export class DeliveryError extends Error {}

const LIMITS = { phone: 30, address: 160, city: 80, notes: 300 } as const;

function clean(value: unknown, max: number, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new DeliveryError(`El campo ${field} no es válido.`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text === '') return undefined;
  if (text.length > max) throw new DeliveryError(`El campo ${field} es demasiado largo (máximo ${max} caracteres).`);
  return text;
}

/** Valida y ordena lo que llega del navegador. Lo vacío queda como ausente. */
export function normalizeDelivery(input: unknown): Delivery {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new DeliveryError('Los datos de entrega no son válidos.');

  const raw = input as Record<string, unknown>;
  const phone = clean(raw.phone, LIMITS.phone, 'teléfono');
  if (phone !== undefined) {
    // Formatos uruguayos y extranjeros: dígitos con +, espacios, guiones o paréntesis.
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[\d\s()-]+$/.test(phone) || digits.length < 6 || digits.length > 15) {
      throw new DeliveryError('Revisá el teléfono: tiene que tener entre 6 y 15 dígitos.');
    }
  }

  const delivery: Delivery = {
    phone,
    address: clean(raw.address, LIMITS.address, 'dirección'),
    city: clean(raw.city, LIMITS.city, 'ciudad'),
    notes: clean(raw.notes, LIMITS.notes, 'referencias'),
  };

  return Object.fromEntries(Object.entries(delivery).filter(([, value]) => value !== undefined)) as Delivery;
}

/**
 * Lee lo que ya está guardado (en la cuenta o en un pedido) sin volver a
 * validarlo: lo pudo haber cargado alguien desde el panel, y mostrarlo nunca
 * debería fallar.
 */
export function storedDelivery(value: unknown): Delivery {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' && field.trim() !== '' ? field.trim() : undefined);
  const delivery: Delivery = { phone: text(raw.phone), address: text(raw.address), city: text(raw.city), notes: text(raw.notes) };
  return Object.fromEntries(Object.entries(delivery).filter(([, field]) => field !== undefined)) as Delivery;
}

/** Una línea legible para el correo, el panel y el mensaje de WhatsApp. */
export function describeDelivery(delivery: Delivery): string[] {
  const lines: string[] = [];
  if (delivery.phone) lines.push(`Teléfono: ${delivery.phone}`);
  const place = [delivery.address, delivery.city].filter(Boolean).join(', ');
  if (place) lines.push(`Entrega: ${place}`);
  if (delivery.notes) lines.push(`Referencias: ${delivery.notes}`);
  return lines;
}

export const DELIVERY_LIMITS = LIMITS;
