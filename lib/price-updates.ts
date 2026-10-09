import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Payload, PayloadRequest } from 'payload';
import { createGroqExtractor, GroqError, type PriceExtractor } from '@/lib/groq';
import { buildPriceDiff, type CatalogueEntry, type DiffRow } from '@/lib/price-diff';

/**
 * Orquestación del asistente de precios: leer el PDF, armar la propuesta y,
 * después de que una persona la revise, escribir los precios aprobados.
 */

const UPLOAD_DIR = 'private/price-updates';

/**
 * Cuánto se espera a que confirme la transacción del alta antes de darse por
 * vencido. El análisis corre con su propia conexión, así que hasta que el
 * `INSERT` no esté confirmado el documento no existe para él.
 */
const COMMIT_POLL_MS = 150;
const COMMIT_ATTEMPTS = 20;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lo inyectable del análisis: la red y el disco, para poder probar el resto. */
export type AnalysisOptions = {
  /**
   * Cuando el análisis corre dentro de la transacción de quien llama. En
   * segundo plano va sin `req`: la transacción del alta ya cerró y el trabajo
   * necesita su propia conexión.
   */
  req?: PayloadRequest;
  extractor?: PriceExtractor;
  readDocument?: (filename: string) => Promise<string>;
};

/** Texto plano del PDF. Sin capa de texto no hay nada que extraer. */
export async function extractDocumentText(filename: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const buffer = await readFile(path.join(process.cwd(), UPLOAD_DIR, filename));
  const document = await getDocumentProxy(new Uint8Array(buffer));
  // `mergePages` devuelve el documento entero como una sola cadena.
  const { text } = await extractText(document, { mergePages: true });

  return text;
}

async function catalogueEntries(payload: Payload, req?: PayloadRequest): Promise<CatalogueEntry[]> {
  const result = await payload.find({
    collection: 'products',
    limit: 0,
    pagination: false,
    depth: 0,
    select: { code: true, name: true, price: true, brand: true },
    req,
  });

  return result.docs.map((doc) => ({
    code: doc.code,
    name: `${doc.brand} ${doc.name}`,
    price: doc.price,
  }));
}

/**
 * Lee el PDF y deja la propuesta lista para revisar.
 * Nunca escribe un precio: sólo prepara filas.
 *
 * No corre dentro del pedido que sube el archivo. Leer una lista larga son
 * varios minutos —se parte en tandas y cada tanda es una llamada al modelo—, y
 * hacerlo en el hook del alta dejaba el pedido del panel abierto todo ese rato
 * y, peor, la transacción de PostgreSQL tomada mientras se esperaba la red.
 */
export async function analyzePriceUpdate(payload: Payload, id: number, options: AnalysisOptions = {}) {
  const { req, extractor, readDocument = extractDocumentText } = options;
  const document = await payload.findByID({ collection: 'price-updates', id, depth: 0, req });

  if (!document.filename) {
    return failAnalysis(payload, id, req, 'El archivo no se guardó correctamente.');
  }

  try {
    const text = await readDocument(document.filename);

    if (text.trim().length < 20) {
      // Un PDF escaneado no tiene capa de texto. Se avisa en lugar de devolver
      // una propuesta vacía, que parecería «no hay cambios».
      return failAnalysis(
        payload,
        id,
        req,
        'El PDF no tiene texto seleccionable. Suele pasar con documentos escaneados: pedí la lista en un PDF de texto, o pasala por un OCR antes de subirla.',
      );
    }

    const extract = extractor ?? createGroqExtractor();
    const { items } = await extract(text);
    const catalogue = await catalogueEntries(payload, req);
    const { rows, counts } = buildPriceDiff(items, catalogue, {
      detectMissing: Boolean(document.completeList),
    });

    const summary =
      `${counts.update} a actualizar · ${counts.attention} requieren atención · ` +
      `${counts.create} nuevos · ${document.completeList ? `${counts.missing} ausentes · ` : ''}` +
      `${counts.discarded} descartados · ` +
      `${counts.unchanged} sin cambios`;

    await payload.update({
      collection: 'price-updates',
      id,
      data: { status: 'review', summary, error: null, rows: rows.map(toStoredRow) },
      context: { skipAnalysis: true },
      req,
    });

    return { ok: true as const, counts };
  } catch (error) {
    const message = error instanceof GroqError || error instanceof Error
      ? error.message
      : 'Error desconocido al leer el PDF.';
    return failAnalysis(payload, id, req, message);
  }
}

function toStoredRow(row: DiffRow) {
  return {
    approved: row.approved,
    code: row.code,
    name: row.name,
    action: row.action,
    currentPrice: row.currentPrice,
    newPrice: row.newPrice,
    changePercent: row.changePercent,
    requiresAttention: row.requiresAttention,
    note: row.note,
  };
}

async function failAnalysis(payload: Payload, id: number, req: PayloadRequest | undefined, message: string) {
  await payload.update({
    collection: 'price-updates',
    id,
    data: { status: 'failed', error: message, summary: 'No se pudo leer el PDF' },
    context: { skipAnalysis: true },
    req,
  });

  return { ok: false as const, error: message };
}

/**
 * Espera a que el alta confirme. Con su propia conexión, el documento no
 * existe hasta que la transacción del hook cierra; si nunca cierra (la
 * creación se revirtió) no hay nada que analizar y el trabajo se abandona.
 */
async function waitForCommit(payload: Payload, id: number) {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const found = await payload.find({
      collection: 'price-updates',
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
    });

    if (found.docs[0]) return found.docs[0];
    await delay(COMMIT_POLL_MS);
  }

  return null;
}

/**
 * Lanza el análisis fuera del pedido que subió el PDF.
 *
 * Deliberadamente no se espera: quien sube el archivo recibe la respuesta
 * enseguida con el registro en «Leyendo el PDF», y el resultado —propuesta o
 * error— aparece en el registro cuando termina. Todo lo que puede salir mal
 * queda escrito ahí, así que no hay error que se pierda por no esperarlo.
 */
export function scheduleAnalysis(payload: Payload, id: number, options: AnalysisOptions = {}) {
  // Sin `req`: la transacción del alta es justamente de la que hay que salir.
  const { req: _ignored, ...detached } = options;

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      void runDetachedAnalysis(payload, id, detached).finally(resolve);
    }, 0);
  });
}

async function runDetachedAnalysis(payload: Payload, id: number, options: AnalysisOptions) {
  try {
    const document = await waitForCommit(payload, id);

    if (!document) {
      payload.logger.warn(`Actualización de precios #${id}: el alta no confirmó; no hay nada que analizar.`);
      return;
    }

    await analyzePriceUpdate(payload, id, options);
  } catch (error) {
    // analyzePriceUpdate ya escribe sus propios errores en el registro. Acá se
    // atrapa lo que falle *alrededor* —incluido el propio intento de escribir
    // el error—, para que un registro no quede en «Leyendo el PDF» para
    // siempre sin que nadie se entere.
    payload.logger.error({ err: error }, `Actualización de precios #${id}: el análisis falló fuera del pedido.`);

    await payload
      .update({
        collection: 'price-updates',
        id,
        data: {
          status: 'failed',
          summary: 'No se pudo leer el PDF',
          error: error instanceof Error ? error.message : 'Error desconocido al leer el PDF.',
        },
        context: { skipAnalysis: true },
      })
      .catch(() => undefined);
  }
}

/**
 * Escribe los precios de las filas tildadas.
 *
 * Sólo toca filas con `action: 'update'`: dar de alta un producto nuevo o
 * marcar uno sin stock se hace a mano, porque implica decisiones que el PDF no
 * alcanza a justificar.
 */
export async function applyPriceUpdate(id: number, req: PayloadRequest) {
  const payload = req.payload;
  // Todo ocurre dentro de la transacción del hook: o se aplican todos los
  // precios aprobados, o no se aplica ninguno.
  const document = await payload.findByID({ collection: 'price-updates', id, depth: 0, req });
  const rows = document.rows ?? [];

  const toApply = rows.filter(
    (row) => row.approved && row.action === 'update' && typeof row.newPrice === 'number',
  );

  let applied = 0;
  const failures: string[] = [];

  for (const row of toApply) {
    const found = await payload.find({
      collection: 'products',
      where: { code: { equals: row.code } },
      limit: 1,
      depth: 0,
      req,
    });
    const product = found.docs[0];

    if (!product) {
      failures.push(`${row.code}: ya no está en el catálogo`);
      continue;
    }

    await payload.update({
      collection: 'products',
      id: product.id,
      data: {
        price: row.newPrice!,
        // Queda el rastro de qué cambió, cuándo y desde qué documento.
        priceHistory: [
          ...(product.priceHistory ?? []),
          {
            price: product.price,
            changedAt: new Date().toISOString(),
            source: `price-update #${id} (${document.filename ?? 'sin archivo'})`,
          },
        ],
      },
      req,
    });
    applied += 1;
  }

  const summary = failures.length
    ? `${applied} precios aplicados · ${failures.length} con problemas`
    : `${applied} precios aplicados`;

  await payload.update({
    collection: 'price-updates',
    id,
    data: {
      status: 'applied',
      appliedAt: new Date().toISOString(),
      appliedCount: applied,
      summary,
      error: failures.length ? failures.join('\n') : null,
    },
    context: { skipAnalysis: true },
    req,
  });

  return { applied, failures };
}
