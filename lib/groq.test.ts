import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroqError, chooseModel, parseExtraction, resetModelCache, resolveModel } from '@/lib/groq';
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

describe('elección del modelo', () => {
  it('descarta lo que no sirve para leer texto', () => {
    const chosen = chooseModel([
      { id: 'whisper-large-v3' },
      { id: 'text-embedding-3' },
      { id: 'algo-guard-8b' },
      { id: 'algo-instruct-70b' },
    ]);

    expect(chosen).toBe('algo-instruct-70b');
  });

  it('ignora los modelos dados de baja', () => {
    const chosen = chooseModel([
      { id: 'aaa-instruct', active: false },
      { id: 'zzz-instruct', active: true },
    ]);

    expect(chosen).toBe('zzz-instruct');
  });

  it('entre iguales gana la ventana de contexto más grande: la lista es larga', () => {
    const chosen = chooseModel([
      { id: 'a-instruct', context_window: 8_192 },
      { id: 'b-instruct', context_window: 131_072 },
    ]);

    expect(chosen).toBe('b-instruct');
  });

  it('sin candidatos no adivina', () => {
    expect(chooseModel([{ id: 'whisper-large-v3' }])).toBeUndefined();
  });
});

describe('resolveModel', () => {
  beforeEach(() => resetModelCache());
  afterEach(() => vi.unstubAllGlobals());

  it('respeta GROQ_MODEL sin consultar la lista', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveModel('https://api.groq.test/v1', 'k', 'el-mio')).resolves.toBe('el-mio');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin GROQ_MODEL pregunta qué hay y elige', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'whisper-large-v3' }, { id: 'algo-instruct' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveModel('https://api.groq.test/v1', 'k')).resolves.toBe('algo-instruct');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('no vuelve a preguntar mientras viva el proceso', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'algo-instruct' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await resolveModel('https://api.groq.test/v1', 'k');
    await resolveModel('https://api.groq.test/v1', 'k');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('avisa cuando la cuenta no tiene ningún modelo de texto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'whisper-large-v3' }] }),
    }));

    await expect(resolveModel('https://api.groq.test/v1', 'k')).rejects.toThrow(GroqError);
  });

  it('una clave inválida se reporta como configuración, no como falla de Groq', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid API Key"}}',
    }));

    await expect(resolveModel('https://api.groq.test/v1', 'k')).rejects.toMatchObject({ status: 503 });
  });
});

describe('un modelo rechazado por Groq', () => {
  beforeEach(() => resetModelCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** El 404 que dejó el asistente fuera de servicio en producción. */
  const modelNotFound = {
    ok: false,
    status: 404,
    text: async () =>
      '{"error":{"message":"The model `viejo-inexistente` does not exist","code":"model_not_found"}}',
  };

  async function extractorConEntorno() {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URI', 'postgres://user@localhost:5432/db');
    vi.stubEnv('PAYLOAD_SECRET', 'x'.repeat(32));
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('GROQ_MODEL', 'viejo-inexistente');
    vi.stubEnv('GROQ_BASE_URL', 'https://api.groq.test/v1');
    const { createGroqExtractor } = await import('@/lib/groq');
    return createGroqExtractor();
  }

  it('el error dice qué modelos sí existen en la cuenta', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/models')
        ? { ok: true, json: async () => ({ data: [{ id: 'algo-instruct' }, { id: 'otro-instruct' }] }) }
        : modelNotFound,
    ));

    const extract = await extractorConEntorno();

    await expect(extract('una lista')).rejects.toThrow(/algo-instruct, otro-instruct/);
  });

  it('si tampoco se puede leer la lista, apunta a la clave', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/models') ? { ok: false, status: 401, text: async () => '' } : modelNotFound,
    ));

    const extract = await extractorConEntorno();

    await expect(extract('una lista')).rejects.toThrow(/GROQ_API_KEY/);
  });
});
