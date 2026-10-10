import { describe, expect, it } from 'vitest';
import { MAX_FAVORITES, mergeFavorites, normalizeFavorites, sameFavorites } from '@/lib/favorites';

describe('normalizeFavorites', () => {
  it('deja los códigos válidos en su orden', () => {
    expect(normalizeFavorites([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('saca repetidos', () => {
    expect(normalizeFavorites([5, 5, 7, 5])).toEqual([5, 7]);
  });

  it('acepta códigos escritos como texto, como los de un JSON viejo', () => {
    expect(normalizeFavorites(['12', 13])).toEqual([12, 13]);
  });

  it('descarta lo que no es un código', () => {
    expect(normalizeFavorites([0, -4, 1.5, Number.NaN, '', 'abc', null, {}, [], 8])).toEqual([8]);
  });

  it.each([null, undefined, 'texto', 42, { 0: 1 }])('si no es una lista devuelve una vacía (%s)', (input) => {
    expect(normalizeFavorites(input)).toEqual([]);
  });

  it(`corta en ${MAX_FAVORITES}`, () => {
    const many = Array.from({ length: MAX_FAVORITES + 50 }, (_, index) => index + 1);
    expect(normalizeFavorites(many)).toHaveLength(MAX_FAVORITES);
  });
});

describe('mergeFavorites', () => {
  it('pone primero los de la cuenta y suma los que sólo estaban en el dispositivo', () => {
    expect(mergeFavorites([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it('con la cuenta vacía quedan los del dispositivo', () => {
    expect(mergeFavorites([], [9, 8])).toEqual([9, 8]);
  });

  it('tolera datos rotos de cualquiera de los dos lados', () => {
    expect(mergeFavorites('roto', [4])).toEqual([4]);
    expect(mergeFavorites([4], null)).toEqual([4]);
  });
});

describe('sameFavorites', () => {
  it('compara contenido y orden', () => {
    expect(sameFavorites([1, 2], [1, 2])).toBe(true);
    expect(sameFavorites([1, 2], [2, 1])).toBe(false);
    expect(sameFavorites([1], [1, 2])).toBe(false);
  });
});
