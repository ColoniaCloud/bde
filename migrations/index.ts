import * as migration_20260909_113512_initial from './20260909_113512_initial';

export const migrations = [
  {
    up: migration_20260909_113512_initial.up,
    down: migration_20260909_113512_initial.down,
    name: '20260909_113512_initial'
  },
];
