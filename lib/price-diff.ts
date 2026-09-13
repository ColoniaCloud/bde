/**
 * Compara lo que el modelo leyó del PDF contra el catálogo y arma la propuesta
 * que revisa una persona.
 *
 * Es lógica pura a propósito: es la barrera entre un modelo de lenguaje y los
 * precios reales de la tienda, así que tiene que poder probarse a fondo sin
 * base de datos ni llamadas a la API.
 *
 * Ninguna fila se aplica sola. Lo que hace este módulo es decidir cuáles llegan
 * pre-marcadas y cuáles exigen que alguien las tilde a mano.
 */

/** Variación a partir de la cual el cambio exige un tilde individual. */
export const ATTENTION_THRESHOLD_PERCENT = 25;

/** Por debajo de esto, la lectura del modelo no se propone siquiera. */
export const MIN_CONFIDENCE = 0.7;

/** Rango de precios plausible en pesos uruguayos para esta tienda. */
export const MIN_PRICE = 1;
export const MAX_PRICE = 1_000_000;

export type ExtractedItem = {
  code: number;
  name?: string;
  price: number;
  confidence?: number;
};

export type CatalogueEntry = {
  code: number;
  name: string;
  price: number;
};

export type RowAction = 'update' | 'create' | 'missing' | 'discarded';

export type DiffRow = {
  code: number;
  name: string;
  action: RowAction;
  currentPrice: number | null;
  newPrice: number | null;
  changePercent: number | null;
  /** Pre-marcada sólo si es un cambio seguro. El resto lo tilda una persona. */
  approved: boolean;
  requiresAttention: boolean;
  note: string;
};

export type DiffSummary = {
  rows: DiffRow[];
  counts: Record<RowAction, number> & { unchanged: number; attention: number };
};

function changePercent(from: number, to: number) {
  if (from <= 0) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

function invalidPriceReason(price: unknown): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return 'el precio no es un número';
  if (!Number.isInteger(price)) return 'el precio tiene decimales';
  if (price < MIN_PRICE) return `el precio es menor a ${MIN_PRICE}`;
  if (price > MAX_PRICE) return `el precio supera ${MAX_PRICE}`;
  return null;
}

export type DiffOptions = {
  /**
   * Marcar como ausentes los productos del catálogo que no estén en el PDF.
   *
   * Sólo tiene sentido si el PDF es la lista COMPLETA. Con una lista parcial
   * —sólo perfumería, por ejemplo— generaría cientos de filas de ruido y el
   * riesgo real de marcar medio catálogo sin stock por accidente. Por eso es
   * opt-in explícito y no algo que el sistema adivine.
   */
  detectMissing?: boolean;
};

/**
 * @param extracted  Lo que el modelo leyó del PDF.
 * @param catalogue  Lo que hay hoy en la base.
 */
export function buildPriceDiff(
  extracted: ExtractedItem[],
  catalogue: CatalogueEntry[],
  { detectMissing = false }: DiffOptions = {},
): DiffSummary {
  const byCode = new Map(catalogue.map((entry) => [entry.code, entry]));
  const seen = new Set<number>();
  const rows: DiffRow[] = [];
  let unchanged = 0;

  for (const item of extracted) {
    // Un código repetido en el PDF es ambiguo: se descarta en lugar de elegir uno.
    if (seen.has(item.code)) {
      rows.push({
        code: item.code,
        name: item.name ?? '',
        action: 'discarded',
        currentPrice: byCode.get(item.code)?.price ?? null,
        newPrice: null,
        changePercent: null,
        approved: false,
        requiresAttention: true,
        note: 'el código aparece más de una vez en el PDF',
      });
      continue;
    }
    seen.add(item.code);

    const current = byCode.get(item.code);
    const priceProblem = invalidPriceReason(item.price);
    const lowConfidence = item.confidence !== undefined && item.confidence < MIN_CONFIDENCE;

    if (priceProblem || lowConfidence) {
      rows.push({
        code: item.code,
        name: item.name ?? current?.name ?? '',
        action: 'discarded',
        currentPrice: current?.price ?? null,
        newPrice: null,
        changePercent: null,
        approved: false,
        requiresAttention: true,
        note: priceProblem ?? `lectura poco confiable (${item.confidence})`,
      });
      continue;
    }

    if (!current) {
      // Un producto que no está en el catálogo se propone, nunca se crea solo.
      rows.push({
        code: item.code,
        name: item.name ?? '',
        action: 'create',
        currentPrice: null,
        newPrice: item.price,
        changePercent: null,
        approved: false,
        requiresAttention: true,
        note: 'no está en el catálogo: revisá antes de darlo de alta',
      });
      continue;
    }

    if (current.price === item.price) {
      unchanged += 1;
      continue;
    }

    const percent = changePercent(current.price, item.price);
    const attention = percent !== null && Math.abs(percent) > ATTENTION_THRESHOLD_PERCENT;

    rows.push({
      code: item.code,
      name: current.name,
      action: 'update',
      currentPrice: current.price,
      newPrice: item.price,
      changePercent: percent,
      approved: !attention,
      requiresAttention: attention,
      note: attention ? `variación de ${percent}%: confirmá que sea correcta` : '',
    });
  }

  // Lo que está en el catálogo y no aparece en el PDF: se propone marcarlo sin
  // stock, nunca borrarlo. Un producto ausente puede ser un error de lectura.
  for (const entry of detectMissing ? catalogue : []) {
    if (seen.has(entry.code)) continue;
    rows.push({
      code: entry.code,
      name: entry.name,
      action: 'missing',
      currentPrice: entry.price,
      newPrice: null,
      changePercent: null,
      approved: false,
      requiresAttention: true,
      note: 'no aparece en el PDF: se propone marcarlo sin stock',
    });
  }

  const counts = {
    update: rows.filter((row) => row.action === 'update').length,
    create: rows.filter((row) => row.action === 'create').length,
    missing: rows.filter((row) => row.action === 'missing').length,
    discarded: rows.filter((row) => row.action === 'discarded').length,
    unchanged,
    attention: rows.filter((row) => row.requiresAttention).length,
  };

  // Primero lo que exige atención: es lo que hay que mirar de verdad.
  rows.sort((a, b) => Number(b.requiresAttention) - Number(a.requiresAttention));

  return { rows, counts };
}
