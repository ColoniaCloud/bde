/** Formato de precios, compartido entre servidor y cliente. */
export const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});
