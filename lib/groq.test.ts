import { describe, expect, it } from 'vitest';
import { GroqError, parseExtraction } from '@/lib/groq';
import { buildPriceDiff, type CatalogueEntry } from '@/lib/price-diff';

describe('parseExtraction', () => {
  it('acepta una respuesta bien formada', () => {
    const result = parseExtraction('{"items":[{"code":100,"name":"A","price":1200,"confidence":0.9}]}');
    expect(result.items).toEqual([{ code: 100, name: 'A', price: 1200, confidence: 0.9 }]);
  });

  it('acepta números que vienen como texto', () => {
    // Los modelos alternan entre 1200 y "1200" para el mismo campo.
    const result = parseExtraction('{"items":[{"code":"100","price":"1200"}]}');
    expect(result.items[0]).toMatchObject({ code: 100, price: 1200 });
  });

  it.each([
    ['no es JSON', 'lo siento, no pude leer el documento'],
    ['JSON pero sin items', '{"productos":[]}'],
    ['items no es arreglo', '{"items":"varios"}'],
    ['una fila sin código', '{"items":[{"price":100}]}'],
    ['una fila sin precio', '{"items":[{"code":100}]}'],
    ['un código no numérico', '{"items":[{"code":"ABC","price":100}]}'],
    ['una confianza fuera de rango', '{"items":[{"code":1,"price":1,"confidence":7}]}'],
  ])('rechaza cuando %s', (_label, content) => {
    expect(() => parseExtraction(content)).toThrow(GroqError);
  });

  it('una respuesta vacía es válida: significa que no leyó nada', () => {
    expect(parseExtraction('{"items":[]}').items).toEqual([]);
  });
});

describe('el PDF es contenido no confiable', () => {
  const catalogue: CatalogueEntry[] = [
    { code: 100, name: 'Perfume A', price: 1000 },
    { code: 200, name: 'Crema B', price: 500 },
  ];

  it('un PDF que logre hacer que el modelo devuelva precios de $1 no los aplica solo', () => {
    // Aunque una inyección en el documento consiguiera atravesar el prompt, el
    // diff es la segunda barrera: una caída del 99,9 % exige revisión humana.
    const injected = parseExtraction('{"items":[{"code":100,"price":1},{"code":200,"price":1}]}');
    const { rows } = buildPriceDiff(injected.items, catalogue);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.approved).toBe(false);
      expect(row.requiresAttention).toBe(true);
    }
  });

  it('un producto inventado que no está en el catálogo no se crea solo', () => {
    const invented = parseExtraction('{"items":[{"code":999999,"name":"Regalo","price":1}]}');
    const { rows } = buildPriceDiff(invented.items, catalogue);
    const created = rows.find((row) => row.code === 999999)!;

    expect(created.action).toBe('create');
    expect(created.approved).toBe(false);
  });

  it('un precio absurdamente alto se descarta antes de llegar a la revisión', () => {
    const absurd = parseExtraction('{"items":[{"code":100,"price":99999999}]}');
    const { rows } = buildPriceDiff(absurd.items, catalogue);

    expect(rows[0].action).toBe('discarded');
    expect(rows[0].newPrice).toBeNull();
  });
});
