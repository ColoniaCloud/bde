/**
 * Íconos que se pueden elegir para una categoría. El panel los ofrece en un
 * desplegable y components/category-icon.tsx los dibuja.
 *
 * Sumar uno: agregarlo acá, mapearlo en category-icon.tsx y crear una
 * migración (`npx payload migrate:create`), porque en la base es un enum.
 */
export const CATEGORY_ICONS = [
  { value: 'sparkles', label: 'Destellos' },
  { value: 'bath', label: 'Bañera' },
  { value: 'sun', label: 'Sol' },
  { value: 'waves', label: 'Ondas' },
  { value: 'palette', label: 'Paleta' },
  { value: 'baby', label: 'Bebé' },
  { value: 'lightbulb', label: 'Lamparita' },
  { value: 'house', label: 'Casa' },
  { value: 'gift', label: 'Regalo' },
] as const;

export type CategoryIconName = (typeof CATEGORY_ICONS)[number]['value'];
