import { describe, expect, it } from 'vitest';
import { createState, verifyState } from '@/lib/oauth-state';

const SECRET = 'un-secreto-de-al menos-32-caracteres!!';

describe('state de OAuth', () => {
  it('acepta el que acaba de emitir', () => {
    expect(verifyState(SECRET, createState(SECRET))).toBe(true);
  });

  it('cada uno es distinto: no se puede reutilizar el de otra persona', () => {
    expect(createState(SECRET)).not.toBe(createState(SECRET));
  });

  describe('rechaza', () => {
    it('uno firmado con otro secreto', () => {
      expect(verifyState(SECRET, createState('otro-secreto-distinto-pero-largo'))).toBe(false);
    });

    it('uno con la firma alterada', () => {
      const state = createState(SECRET);
      const tampered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;
      expect(verifyState(SECRET, tampered)).toBe(false);
    });

    it('uno con el nonce cambiado', () => {
      const [, timestamp, signature] = createState(SECRET).split('.');
      expect(verifyState(SECRET, `${'0'.repeat(32)}.${timestamp}.${signature}`)).toBe(false);
    });

    it('uno vencido: diez minutos es el límite', () => {
      const old = createState(SECRET, Date.now() - 11 * 60 * 1000);
      expect(verifyState(SECRET, old)).toBe(false);
    });

    it('uno todavía vigente al filo', () => {
      const almost = createState(SECRET, Date.now() - 9 * 60 * 1000);
      expect(verifyState(SECRET, almost)).toBe(true);
    });

    it('uno con fecha futura: señal de manipulación', () => {
      const future = createState(SECRET, Date.now() + 10 * 60 * 1000);
      expect(verifyState(SECRET, future)).toBe(false);
    });

    it.each([
      ['ausente', null],
      ['vacío', ''],
      ['sin partes', 'basura'],
      ['con dos partes', 'aaa.bbb'],
      ['con cuatro partes', 'a.b.c.d'],
      ['con nonce no hexadecimal', `${'z'.repeat(32)}.${Date.now()}.${'a'.repeat(64)}`],
      ['con firma corta', `${'0'.repeat(32)}.${Date.now()}.abc`],
      ['con marca de tiempo no numérica', `${'0'.repeat(32)}.ayer.${'a'.repeat(64)}`],
    ])('uno %s', (_label, state) => {
      expect(verifyState(SECRET, state)).toBe(false);
    });

    it('una firma del largo correcto pero equivocada, sin explotar', () => {
      const [nonce, timestamp] = createState(SECRET).split('.');
      expect(verifyState(SECRET, `${nonce}.${timestamp}.${'f'.repeat(64)}`)).toBe(false);
    });
  });
});
