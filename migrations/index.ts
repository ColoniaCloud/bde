import * as migration_20260909_113512_initial from './20260909_113512_initial';
import * as migration_20260909_120901_orders from './20260909_120901_orders';
import * as migration_20260909_121000_order_sequence from './20260909_121000_order_sequence';
import * as migration_20260909_123000_rate_limits from './20260909_123000_rate_limits';
import * as migration_20260909_234723_price_updates from './20260909_234723_price_updates';
import * as migration_20260909_235337_complete_list from './20260909_235337_complete_list';
import * as migration_20260910_012957_customers from './20260910_012957_customers';
import * as migration_20261002_003347_add_product_counters from './20261002_003347_add_product_counters';
import * as migration_20261008_224216_category_parent from './20261008_224216_category_parent';
import * as migration_20261008_224349_category_icon_select from './20261008_224349_category_icon_select';
import * as migration_20261009_230441_payload_3_90_reset_password from './20261009_230441_payload_3_90_reset_password';
import * as migration_20261010_010803_customer_picture from './20261010_010803_customer_picture';

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
    name: '20260909_235337_complete_list',
  },
  {
    up: migration_20260910_012957_customers.up,
    down: migration_20260910_012957_customers.down,
    name: '20260910_012957_customers',
  },
  {
    up: migration_20261002_003347_add_product_counters.up,
    down: migration_20261002_003347_add_product_counters.down,
    name: '20261002_003347_add_product_counters',
  },
  {
    up: migration_20261008_224216_category_parent.up,
    down: migration_20261008_224216_category_parent.down,
    name: '20261008_224216_category_parent',
  },
  {
    up: migration_20261008_224349_category_icon_select.up,
    down: migration_20261008_224349_category_icon_select.down,
    name: '20261008_224349_category_icon_select',
  },
  {
    up: migration_20261009_230441_payload_3_90_reset_password.up,
    down: migration_20261009_230441_payload_3_90_reset_password.down,
    name: '20261009_230441_payload_3_90_reset_password',
  },
  {
    up: migration_20261010_010803_customer_picture.up,
    down: migration_20261010_010803_customer_picture.down,
    name: '20261010_010803_customer_picture'
  },
];
