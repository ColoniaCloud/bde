import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceUpdates } from '@/collections/PriceUpdates';

/**
 * Los hooks son el circuito de dos tiempos: qué dispara una lectura y qué
 * dispara una escritura de precios. Se prueban directamente porque un error
 * acá es o un precio escrito sin querer o un registro que no se puede rescatar.
 */

const scheduleAnalysis = vi.fn();
const applyPriceUpdate = vi.fn();

vi.mock('@/lib/price-updates', () => ({
  scheduleAnalysis: (...args: unknown[]) => scheduleAnalysis(...args),
  applyPriceUpdate: (...args: unknown[]) => applyPriceUpdate(...args),
}));

type HookArgs = Record<string, unknown>;

const beforeChange = PriceUpdates.hooks?.beforeChange?.[0] as unknown as (
  args: HookArgs,
) => Record<string, unknown>;

const afterChange = PriceUpdates.hooks?.afterChange?.[0] as unknown as (
  args: HookArgs,
) => Promise<unknown>;

const req = { payload: { id: 'payload' } };

beforeEach(() => {
  scheduleAnalysis.mockClear();
  applyPriceUpdate.mockClear();
});

describe('qué dispara una lectura', () => {
  it('al subir el PDF, el registro nace leyendo', () => {
    const context: HookArgs = {};
    const data = beforeChange({ data: { filename: 'lista.pdf' }, operation: 'create', context });

    expect(data.status).toBe('analyzing');
    expect(context.startAnalysis).toBe(true);
  });

  it('volver a poner «recién subido» relee el mismo PDF', () => {
    const context: HookArgs = {};
    const data = beforeChange({ data: { status: 'pending' }, operation: 'update', context });

    expect(data.status).toBe('analyzing');
    expect(context.startAnalysis).toBe(true);
  });

  it('la relectura descarta la propuesta anterior y el error viejo', () => {
    const data = beforeChange({
      data: { status: 'pending', rows: [{ code: 100, newPrice: 1 }], error: 'lo de antes' },
      operation: 'update',
      context: {},
    });

    expect(data.rows).toEqual([]);
    expect(data.error).toBeNull();
  });

  /** El caso que antes no tenía salida: un reinicio en medio de la lectura. */
  it('rescata un registro colgado en «leyendo el PDF»', () => {
    const context: HookArgs = {};
    const data = beforeChange({
      data: { status: 'pending' },
      originalDoc: { status: 'analyzing' },
      operation: 'update',
      context,
    });

    expect(data.status).toBe('analyzing');
    expect(context.startAnalysis).toBe(true);
  });

  it('revisar la propuesta y guardar no vuelve a leer nada', () => {
    const context: HookArgs = {};
    const data = beforeChange({
      data: { status: 'review', rows: [{ code: 100, approved: true }] },
      operation: 'update',
      context,
    });

    expect(data.status).toBe('review');
    expect(data.rows).toHaveLength(1);
    expect(context.startAnalysis).toBeUndefined();
  });

  it('las escrituras del propio análisis no se disparan a sí mismas', () => {
    const context: HookArgs = {};

    for (const status of ['analyzing', 'review', 'failed', 'applied']) {
      beforeChange({ data: { status }, operation: 'update', context });
    }

    expect(context.startAnalysis).toBeUndefined();
  });
});

describe('qué hace el guardado una vez firme', () => {
  it('arranca la lectura en segundo plano, sin esperarla', async () => {
    await afterChange({
      doc: { id: 7, status: 'analyzing' },
      operation: 'create',
      req,
      context: { startAnalysis: true },
    });

    expect(scheduleAnalysis).toHaveBeenCalledWith(req.payload, 7);
    expect(applyPriceUpdate).not.toHaveBeenCalled();
  });

  it('una relectura no escribe ningún precio', async () => {
    await afterChange({
      doc: { id: 8, status: 'analyzing' },
      operation: 'update',
      req,
      context: { startAnalysis: true },
    });

    expect(applyPriceUpdate).not.toHaveBeenCalled();
  });

  it('«aplicar» escribe los precios y se espera: es todo o nada', async () => {
    await afterChange({ doc: { id: 9, status: 'apply' }, operation: 'update', req, context: {} });

    expect(applyPriceUpdate).toHaveBeenCalledWith(9, req);
    expect(scheduleAnalysis).not.toHaveBeenCalled();
  });

  it('lo que escribe el propio análisis no dispara nada', async () => {
    await afterChange({
      doc: { id: 10, status: 'review' },
      operation: 'update',
      req,
      context: { skipAnalysis: true },
    });

    expect(scheduleAnalysis).not.toHaveBeenCalled();
    expect(applyPriceUpdate).not.toHaveBeenCalled();
  });
});
