import { describe, expect, it } from 'vitest';
import { ATTENTION_THRESHOLD_PERCENT, buildPriceDiff, type CatalogueEntry } from '@/lib/price-diff';

const catalogue: CatalogueEntry[] = [
  { code: 100, name: 'Perfume A', price: 1000 },
  { code: 200, name: 'Crema B', price: 500 },
  { code: 300, name: 'Shampoo C', price: 250 },
];

const row = (result: ReturnType<typeof buildPriceDiff>, code: number) =>
  result.rows.find((item) => item.code === code);

describe('buildPriceDiff', () => {
  describe('cambios normales', () => {
    it('propone actualizar y llega pre-marcado', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100 }], catalogue);
      const update = row(result, 100)!;

      expect(update.action).toBe('update');
      expect(update.currentPrice).toBe(1000);
      expect(update.newPrice).toBe(1100);
      expect(update.changePercent).toBe(10);
      expect(update.approved).toBe(true);
      expect(update.requiresAttention).toBe(false);
    });

    it('un precio igual no genera fila', () => {
      const result = buildPriceDiff([{ code: 100, price: 1000 }], catalogue);
      expect(row(result, 100)).toBeUndefined();
      expect(result.counts.unchanged).toBe(1);
    });

    it('calcula bien una baja de precio', () => {
      const result = buildPriceDiff([{ code: 200, price: 450 }], catalogue);
      expect(row(result, 200)!.changePercent).toBe(-10);
    });
  });

  describe('la barrera del ±25 %', () => {
    it(`una suba mayor a ${ATTENTION_THRESHOLD_PERCENT}% NO llega pre-marcada`, () => {
      const result = buildPriceDiff([{ code: 100, price: 1300 }], catalogue);
      const update = row(result, 100)!;

      expect(update.changePercent).toBe(30);
      expect(update.approved).toBe(false);
      expect(update.requiresAttention).toBe(true);
      expect(update.note).toContain('30%');
    });

    it('una baja brusca tampoco: vender por debajo del costo es el riesgo real', () => {
      const result = buildPriceDiff([{ code: 100, price: 100 }], catalogue);
      const update = row(result, 100)!;

      expect(update.changePercent).toBe(-90);
      expect(update.approved).toBe(false);
    });

    it('justo en el umbral todavía se considera seguro', () => {
      const result = buildPriceDiff([{ code: 100, price: 1250 }], catalogue);
      expect(row(result, 100)!.changePercent).toBe(25);
      expect(row(result, 100)!.approved).toBe(true);
    });

    it('un punto por encima ya no lo es', () => {
      const result = buildPriceDiff([{ code: 100, price: 1251 }], catalogue);
      expect(row(result, 100)!.approved).toBe(false);
    });
  });

  describe('descarta lecturas que no son de fiar', () => {
    it.each([
      ['un precio con decimales', 1100.5],
      ['un precio cero', 0],
      ['un precio negativo', -100],
      ['un precio absurdo', 99_999_999],
      ['algo que no es número', 'mil' as unknown as number],
      ['NaN', Number.NaN],
    ])('%s', (_label, price) => {
      const result = buildPriceDiff([{ code: 100, price }], catalogue);
      const discarded = row(result, 100)!;

      expect(discarded.action).toBe('discarded');
      expect(discarded.approved).toBe(false);
      expect(discarded.newPrice).toBeNull();
    });

    it('una lectura con poca confianza', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100, confidence: 0.3 }], catalogue);
      expect(row(result, 100)!.action).toBe('discarded');
      expect(row(result, 100)!.note).toContain('poco confiable');
    });

    it('una confianza alta sí se procesa', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100, confidence: 0.95 }], catalogue);
      expect(row(result, 100)!.action).toBe('update');
    });

    it('un código repetido en el PDF es ambiguo y no se resuelve solo', () => {
      const result = buildPriceDiff(
        [{ code: 100, price: 1100 }, { code: 100, price: 1200 }],
        catalogue,
      );
      const rows = result.rows.filter((item) => item.code === 100);

      expect(rows).toHaveLength(2);
      expect(rows.some((item) => item.action === 'discarded')).toBe(true);
      expect(rows.find((item) => item.action === 'discarded')!.note).toContain('más de una vez');
    });
  });

  describe('productos que no coinciden', () => {
    it('un código que no está en el catálogo se propone, no se crea', () => {
      const result = buildPriceDiff([{ code: 999, name: 'Nuevo', price: 700 }], catalogue);
      const created = row(result, 999)!;

      expect(created.action).toBe('create');
      expect(created.approved).toBe(false);
      expect(created.requiresAttention).toBe(true);
    });

    it('un producto del catálogo ausente del PDF se propone sin stock, nunca se borra', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100 }], catalogue, { detectMissing: true });

      for (const code of [200, 300]) {
        const missing = row(result, code)!;
        expect(missing.action).toBe('missing');
        expect(missing.approved).toBe(false);
        expect(missing.note).toContain('sin stock');
      }
    });
  });

  describe('resumen y orden', () => {
    it('cuenta cada categoría', () => {
      const result = buildPriceDiff(
        [
          { code: 100, price: 1100 },
          { code: 200, price: 500 },
          { code: 300, price: 5000 },
          { code: 999, price: 700 },
          { code: 888, price: -1 },
        ],
        catalogue,
      );

      expect(result.counts.update).toBe(2);
      expect(result.counts.unchanged).toBe(1);
      expect(result.counts.create).toBe(1);
      expect(result.counts.discarded).toBe(1);
      expect(result.counts.missing).toBe(0);
    });

    it('lo que exige atención va primero', () => {
      const result = buildPriceDiff(
        [{ code: 100, price: 1050 }, { code: 200, price: 5000 }],
        catalogue,
      );
      expect(result.rows[0].requiresAttention).toBe(true);
    });

    it('un PDF vacío no propone tocar precios, sólo marca ausencias', () => {
      const result = buildPriceDiff([], catalogue, { detectMissing: true });
      expect(result.counts.update).toBe(0);
      expect(result.counts.missing).toBe(3);
      expect(result.rows.every((item) => !item.approved)).toBe(true);
    });
  });

  describe('listas parciales', () => {
    it('por defecto NO marca ausentes: una lista parcial no es evidencia de falta de stock', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100 }], catalogue);

      expect(result.counts.missing).toBe(0);
      expect(result.rows.every((row) => row.action !== 'missing')).toBe(true);
    });

    it('con detectMissing sí los marca', () => {
      const result = buildPriceDiff([{ code: 100, price: 1100 }], catalogue, { detectMissing: true });
      expect(result.counts.missing).toBe(2);
    });

    it('un PDF de 4 productos sobre un catálogo grande no genera cientos de filas por defecto', () => {
      const big = Array.from({ length: 500 }, (_, i) => ({
        code: 1000 + i,
        name: `Producto ${i}`,
        price: 100,
      }));
      const result = buildPriceDiff([{ code: 1000, price: 110 }], big);

      expect(result.rows).toHaveLength(1);
    });
  });

  it('ninguna fila que exija atención llega pre-marcada, en ningún caso', () => {
    const result = buildPriceDiff(
      [
        { code: 100, price: 9999 },
        { code: 200, price: 1 },
        { code: 300, price: 250 },
        { code: 777, price: 100 },
        { code: 666, price: 0 },
      ],
      catalogue,
    );

    for (const item of result.rows) {
      if (item.requiresAttention) expect(item.approved).toBe(false);
    }
  });
});
