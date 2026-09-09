import * as migration_20260909_113512_initial from './20260909_113512_initial';
import * as migration_20260909_120901_orders from './20260909_120901_orders';
import * as migration_20260909_121000_order_sequence from './20260909_121000_order_sequence';
import * as migration_20260909_123000_rate_limits from './20260909_123000_rate_limits';
import * as migration_20260909_234723_price_updates from './20260909_234723_price_updates';
import * as migration_20260909_235337_complete_list from './20260909_235337_complete_list';

export const migrations = [
  {
    up: migration_20260909_113512_initial.up,
    down: migration_20260909_113512_initial.down,
    name: '20260909_113512_initial',
  },
  {
    up: migration_20260909_120901_orders.up,
    down: migration_20260909_120901_orders.down,
    name: '20260909_120901_orders',
  },
  {
    up: migration_20260909_121000_order_sequence.up,
    down: migration_20260909_121000_order_sequence.down,
    name: '20260909_121000_order_sequence',
  },
  {
    up: migration_20260909_123000_rate_limits.up,
    down: migration_20260909_123000_rate_limits.down,
    name: '20260909_123000_rate_limits',
  },
  {
    up: migration_20260909_234723_price_updates.up,
    down: migration_20260909_234723_price_updates.down,
    name: '20260909_234723_price_updates',
  },
  {
    up: migration_20260909_235337_complete_list.up,
    down: migration_20260909_235337_complete_list.down,
    name: '20260909_235337_complete_list'
  },
];
