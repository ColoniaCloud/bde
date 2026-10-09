import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroqError, chooseModel, chunkBudget, parseExtraction, resetModelCache, resolveModel, splitIntoChunks } from '@/lib/groq';
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

    expect(chosen?.id).toBe('algo-instruct-70b');
  });

  it('ignora los modelos dados de baja', () => {
    const chosen = chooseModel([
      { id: 'aaa-instruct', active: false },
      { id: 'zzz-instruct', active: true },
    ]);

    expect(chosen?.id).toBe('zzz-instruct');
  });

  it('entre iguales gana la ventana de contexto más grande: la lista es larga', () => {
    const chosen = chooseModel([
      { id: 'a-instruct', context_window: 8_192 },
      { id: 'b-instruct', context_window: 131_072 },
    ]);

    expect(chosen?.id).toBe('b-instruct');
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

    await expect(resolveModel('https://api.groq.test/v1', 'k', 'el-mio')).resolves.toEqual({ id: 'el-mio' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin GROQ_MODEL pregunta qué hay y elige', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'whisper-large-v3' }, { id: 'algo-instruct' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveModel('https://api.groq.test/v1', 'k')).resolves.toMatchObject({ id: 'algo-instruct' });
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

describe('partir el documento en tandas', () => {
  it('no corta un renglón al medio: una fila partida es un precio mal leído', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `${1000 + i} Producto ${i} $ ${100 + i}`);
    const chunks = splitIntoChunks(lines.join('\n'), 200);

    expect(chunks.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(chunks.some((chunk) => chunk.includes(line))).toBe(true);
    }
  });

  it('ninguna tanda supera el presupuesto', () => {
    const text = Array.from({ length: 400 }, (_, i) => `fila ${i} con algo de texto`).join('\n');

    for (const chunk of splitIntoChunks(text, 500)) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it('un documento chico queda en una sola tanda', () => {
    expect(splitIntoChunks('100 Perfume $ 900\n200 Crema $ 500', 10_000)).toHaveLength(1);
  });

  it('un renglón gigante sin saltos igual se parte', () => {
    const chunks = splitIntoChunks('x'.repeat(2_500), 1_000);

    expect(chunks).toHaveLength(3);
    expect(chunks.join('')).toHaveLength(2_500);
  });

  it('no pierde ni duplica contenido', () => {
    const text = Array.from({ length: 120 }, (_, i) => `linea-${i}`).join('\n');
    const rejoined = splitIntoChunks(text, 100).join('\n');

    expect(rejoined.split('\n').filter(Boolean)).toEqual(text.split('\n'));
  });
});

describe('tamaño de tanda según el modelo', () => {
  it('sin ventana conocida usa un valor prudente', () => {
    expect(chunkBudget()).toBe(10_000);
  });

  it('una ventana enorme no habilita una tanda enorme: el límite es lo que el modelo escribe', () => {
    expect(chunkBudget(1_000_000)).toBe(16_000);
  });

  it('una ventana chica no baja de un mínimo razonable', () => {
    expect(chunkBudget(4_096)).toBe(6_000);
  });
});

describe('lectura por tandas', () => {
  beforeEach(() => resetModelCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function extractorCon(model: string) {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URI', 'postgres://user@localhost:5432/db');
    vi.stubEnv('PAYLOAD_SECRET', 'x'.repeat(32));
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('GROQ_MODEL', model);
    vi.stubEnv('GROQ_BASE_URL', 'https://api.groq.test/v1');
    const { createGroqExtractor } = await import('@/lib/groq');
    return createGroqExtractor();
  }

  const ok = (body: unknown) => ({
    ok: true,
    json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] }),
  });

  it('una lista larga se lee en varios pedidos y se junta', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => ok({ items: [{ code: 100 + call++, price: 500 }] }));
    vi.stubGlobal('fetch', fetchMock);

    const extract = await extractorCon('un-modelo');
    const largo = Array.from({ length: 2_000 }, (_, i) => `${i} Producto ${i} $ 500`).join('\n');
    const { items } = await extract(largo);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(items).toHaveLength(fetchMock.mock.calls.length);
  });

  it('de la segunda tanda en adelante viaja el encabezado: sin él se confunde la columna', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [] })));

    const extract = await extractorCon('un-modelo');
    const largo = ['CODIGO PRODUCTO VENTA COSTO', ...Array.from({ length: 2_000 }, (_, i) => `${i} P${i} 500 300`)]
      .join('\n');
    await extract(largo);

    const bodies = (globalThis.fetch as unknown as { mock: { calls: [string, { body: string }][] } })
      .mock.calls.map(([, init]) => init.body);

    expect(bodies[0]).not.toContain('<encabezado>');
    expect(bodies[1]).toContain('CODIGO PRODUCTO VENTA COSTO');
  });

  it('si una tanda falla, falla todo: media lista con «es la lista completa» marca sin stock lo que sí hay', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () =>
      call++ === 0 ? ok({ items: [{ code: 1, price: 100 }] }) : { ok: false, status: 500, text: async () => 'boom' },
    ));

    const extract = await extractorCon('un-modelo');
    const largo = Array.from({ length: 2_000 }, (_, i) => `${i} Producto ${i} $ 500`).join('\n');

    await expect(extract(largo)).rejects.toThrow(/Tanda 2 de/);
  });

  it('una respuesta cortada por longitud se explica, no se reporta como JSON roto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"items":[{"code":1,' } }] }),
    })));

    const extract = await extractorCon('un-modelo');

    await expect(extract('100 Perfume $ 900')).rejects.toThrow(/se cortó por longitud/);
  });

  it('un PDF descomunal se rechaza con instrucciones, no con cien pedidos a Groq', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const extract = await extractorCon('un-modelo');
    const enorme = Array.from({ length: 80_000 }, (_, i) => `${i} Producto ${i} $ 500`).join('\n');

    await expect(extract(enorme)).rejects.toThrow(/partida en varios PDF/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('límites de tiempo y límite de pedidos', () => {
  beforeEach(() => resetModelCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function extractor() {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URI', 'postgres://user@localhost:5432/db');
    vi.stubEnv('PAYLOAD_SECRET', 'x'.repeat(32));
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    vi.stubEnv('GROQ_MODEL', 'un-modelo');
    vi.stubEnv('GROQ_BASE_URL', 'https://api.groq.test/v1');
    const { createGroqExtractor } = await import('@/lib/groq');
    return createGroqExtractor();
  }

  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] }),
  });

  const tooManyRequests = (retryAfter?: string) => ({
    ok: false,
    status: 429,
    headers: { get: (name: string) => (name === 'retry-after' ? retryAfter ?? null : null) },
    text: async () => '{"error":{"message":"Rate limit reached"}}',
  });

  /** Un fetch colgado dejaba el registro en «Leyendo el PDF» para siempre. */
  it('una conexión colgada se corta y se explica en castellano', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError');
    }));

    const extract = await extractor();

    await expect(extract('100 Perfume $ 900')).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/tiempo de espera/),
    });
  });

  it('una caída de red no se reporta como error del modelo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));

    const extract = await extractor();

    await expect(extract('100 Perfume $ 900')).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/No se pudo contactar a Groq/),
    });
  });

  it('un 429 se espera lo que Groq pide y se reintenta una vez', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => (call++ === 0 ? tooManyRequests('0') : ok({ items: [{ code: 1, price: 10 }] })));
    vi.stubGlobal('fetch', fetchMock);

    const extract = await extractor();
    const { items } = await extract('100 Perfume $ 900');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
  });

  it('no reintenta en ciclo: si sigue limitado, corta y dice cómo retomar', async () => {
    const fetchMock = vi.fn(async () => tooManyRequests('0'));
    vi.stubGlobal('fetch', fetchMock);

    const extract = await extractor();

    await expect(extract('100 Perfume $ 900')).rejects.toThrow(/Volver a leer el PDF/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('una espera larguísima no se hace: se informa y se corta', async () => {
    const fetchMock = vi.fn(async () => tooManyRequests('600'));
    vi.stubGlobal('fetch', fetchMock);

    const extract = await extractor();

    await expect(extract('100 Perfume $ 900')).rejects.toThrow(/más de un minuto/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('la consulta del catálogo de modelos también tiene corte', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError');
    }));
    vi.resetModules();
    const { listModels } = await import('@/lib/groq');

    await expect(listModels('https://api.groq.test/v1', 'k')).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/catálogo de modelos/),
    });
  });
});
