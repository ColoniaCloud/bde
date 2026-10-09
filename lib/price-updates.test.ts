import { describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';
import { analyzePriceUpdate, scheduleAnalysis } from '@/lib/price-updates';

/**
 * El análisis dejó de correr dentro del pedido que sube el PDF: ahora arranca
 * cuando la transacción del alta confirmó y escribe el resultado en el propio
 * registro. Lo que se prueba acá es eso, sin base ni red.
 */

type StoredDoc = { id: number; filename?: string; completeList?: boolean; status?: string };

/** Lo que la capa de datos recibe en cada llamada, que es lo que se inspecciona. */
type Call = { collection?: string; req?: unknown; data?: Record<string, unknown> };

function fakePayload(document: StoredDoc | null, products: { code: number; name: string; brand: string; price: number }[] = []) {
  const updates: Record<string, unknown>[] = [];

  const payload = {
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    findByID: vi.fn(async (_args: Call) => document),
    find: vi.fn(async (args: Call) =>
      args.collection === 'products' ? { docs: products } : { docs: document ? [document] : [] },
    ),
    update: vi.fn(async (args: Call) => {
      updates.push(args.data ?? {});
      return args.data;
    }),
  };

  return { payload: payload as unknown as Payload, updates, spies: payload };
}

const catalogo = [{ code: 100, name: 'Perfume A', brand: 'Natura', price: 1_000 }];

describe('analyzePriceUpdate', () => {
  it('deja la propuesta lista para revisar sin escribir ningún precio', async () => {
    const { payload, updates, spies } = fakePayload({ id: 1, filename: 'lista.pdf' }, catalogo);

    await analyzePriceUpdate(payload, 1, {
      readDocument: async () => '100 Perfume A $ 1100\nuna lista con texto suficiente',
      extractor: async () => ({ items: [{ code: 100, price: 1_100 }] }),
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'review' });
    // Nada tocó la colección de productos.
    expect(spies.update.mock.calls.every(([args]) => args.collection === 'price-updates')).toBe(true);
  });

  it('un PDF escaneado se explica en lugar de devolver una propuesta vacía', async () => {
    const { payload, updates } = fakePayload({ id: 2, filename: 'escaneado.pdf' }, catalogo);

    await analyzePriceUpdate(payload, 2, {
      readDocument: async () => '   ',
      extractor: async () => ({ items: [] }),
    });

    expect(updates[0]).toMatchObject({ status: 'failed' });
    expect(String(updates[0].error)).toMatch(/texto seleccionable/);
  });

  it('un error del modelo queda escrito en el registro, no perdido', async () => {
    const { payload, updates } = fakePayload({ id: 3, filename: 'lista.pdf' }, catalogo);

    await analyzePriceUpdate(payload, 3, {
      readDocument: async () => 'una lista con texto suficiente para pasar el control',
      extractor: async () => {
        throw new Error('Groq rechazó el modelo «viejo»');
      },
    });

    expect(updates[0]).toMatchObject({ status: 'failed' });
    expect(String(updates[0].error)).toMatch(/rechazó el modelo/);
  });

  it('no corre dentro de la transacción de quien sube el archivo', async () => {
    const { payload, spies } = fakePayload({ id: 4, filename: 'lista.pdf' }, catalogo);

    await analyzePriceUpdate(payload, 4, {
      readDocument: async () => 'una lista con texto suficiente para pasar el control',
      extractor: async () => ({ items: [{ code: 100, price: 1_100 }] }),
    });

    for (const [args] of spies.update.mock.calls) expect(args.req).toBeUndefined();
    for (const [args] of spies.findByID.mock.calls) expect(args.req).toBeUndefined();
  });
});

describe('scheduleAnalysis', () => {
  it('espera a que confirme el alta antes de leer el documento', async () => {
    const { payload, updates } = fakePayload({ id: 5, filename: 'lista.pdf' }, catalogo);

    await scheduleAnalysis(payload, 5, {
      readDocument: async () => 'una lista con texto suficiente para pasar el control',
      extractor: async () => ({ items: [{ code: 100, price: 1_100 }] }),
    });

    expect(updates[0]).toMatchObject({ status: 'review' });
  });

  it('ignora el req de quien llama: la transacción del alta es de la que hay que salir', async () => {
    const { payload, spies } = fakePayload({ id: 6, filename: 'lista.pdf' }, catalogo);

    await scheduleAnalysis(payload, 6, {
      req: { transactionID: 'tx-del-alta' } as never,
      readDocument: async () => 'una lista con texto suficiente para pasar el control',
      extractor: async () => ({ items: [] }),
    });

    for (const [args] of spies.update.mock.calls) expect(args.req).toBeUndefined();
  });

  it('si el alta se revirtió, no analiza nada y lo deja anotado', async () => {
    const { payload, updates, spies } = fakePayload(null);

    await scheduleAnalysis(payload, 7, {
      readDocument: async () => {
        throw new Error('no debería leerse');
      },
    });

    expect(updates).toHaveLength(0);
    expect(spies.logger.warn).toHaveBeenCalledOnce();
  }, 10_000);

  it('un fallo alrededor del análisis igual deja el registro en «falló», no colgado en «leyendo»', async () => {
    const { payload, updates, spies } = fakePayload({ id: 8, filename: 'lista.pdf' }, catalogo);
    spies.findByID.mockRejectedValueOnce(new Error('la base se cayó'));

    await scheduleAnalysis(payload, 8, { extractor: async () => ({ items: [] }) });

    expect(spies.logger.error).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ status: 'failed' });
  });
});
