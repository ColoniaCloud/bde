import * as migration_20260909_113512_initial from './20260909_113512_initial';
import * as migration_20260909_120901_orders from './20260909_120901_orders';
import * as migration_20260909_121000_order_sequence from './20260909_121000_order_sequence';
import * as migration_20260909_123000_rate_limits from './20260909_123000_rate_limits';

export const migrations = [
  {
    up: migration_20260909_113512_initial.up,
    down: migration_20260909_113512_initial.down,
    name: '20260909_113512_initial',
  },
  {
    up: migration_20260909_120901_orders.up,
    down: migration_20260909_120901_orders.down,
    name: '20260909_120901_orders'
  },
  {
    up: migration_20260909_121000_order_sequence.up,
    down: migration_20260909_121000_order_sequence.down,
    name: '20260909_121000_order_sequence'
  },
  {
    up: migration_20260909_123000_rate_limits.up,
    down: migration_20260909_123000_rate_limits.down,
    name: '20260909_123000_rate_limits'
  },
];
