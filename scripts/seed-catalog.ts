/**
 * Carga el catálogo de app/catalog-data.ts en la base.
 *
 *   npm run catalog:seed          — sincroniza categorías y productos
 *   npm run catalog:seed -- --dry — informa qué haría, sin escribir
 *
 * Es idempotente: identifica cada producto por su código de Natura, así que
 * correrlo dos veces actualiza en lugar de duplicar. No borra nada; un producto
 * que ya no esté en el archivo se informa pero se deja como está, porque puede
 * haber sido dado de alta desde el panel.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import { categories as sourceCategories } from '../lib/catalog.js';
import { products as sourceProducts } from '../app/catalog-data.js';

const dryRun = process.argv.includes('--dry');

function log(...parts: unknown[]) {
  console.log(...parts);
}

const payload = await getPayload({ config });

// ── Categorías ───────────────────────────────────────────────────────────────
// El adaptador de Postgres usa ids numéricos.
const categoryIdByName = new Map<string, number>();
let categoriesCreated = 0;
let categoriesUpdated = 0;

for (const [index, category] of sourceCategories.entries()) {
  const existing = await payload.find({
    collection: 'categories',
    where: { slug: { equals: category.slug } },
    limit: 1,
  });

  const data = {
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    tone: category.tone,
    description: category.description,
    order: index,
  };

  if (existing.docs.length > 0) {
    const current = existing.docs[0];
    categoryIdByName.set(category.name, current.id);
    if (!dryRun) {
      await payload.update({ collection: 'categories', id: current.id, data });
    }
    categoriesUpdated += 1;
  } else {
    if (dryRun) {
      categoriesCreated += 1;
      continue;
    }
    const created = await payload.create({ collection: 'categories', data });
    categoryIdByName.set(category.name, created.id);
    categoriesCreated += 1;
  }
}

log(`Categorías: ${categoriesCreated} creadas, ${categoriesUpdated} actualizadas.`);

if (dryRun && categoriesCreated > 0) {
  log('Simulación: sin categorías en la base no se pueden simular los productos.');
  log('Corré sin --dry para cargar el catálogo.');
  process.exit(0);
}

// ── Productos ────────────────────────────────────────────────────────────────
let created = 0;
let updated = 0;
const skipped: string[] = [];

for (const product of sourceProducts) {
  const categoryId = categoryIdByName.get(product.category);

  if (!categoryId) {
    // Preferimos saltear y avisar antes que inventar una categoría: un producto
    // mal clasificado desaparece de su sección sin que nadie lo note.
    skipped.push(`${product.sku} (categoría desconocida: «${product.category}»)`);
    continue;
  }

  const data = {
    code: product.id,
    brand: product.brand,
    name: product.name,
    category: categoryId,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    discount: product.discount ?? null,
    status: 'available' as const,
    tag: product.tag ?? null,
    image: product.image,
    description: product.description,
    details: product.details.map((text) => ({ text })),
  };

  const existing = await payload.find({
    collection: 'products',
    where: { code: { equals: product.id } },
    limit: 1,
  });

  if (existing.docs.length > 0) {
    if (!dryRun) {
      await payload.update({ collection: 'products', id: existing.docs[0].id, data });
    }
    updated += 1;
  } else {
    if (!dryRun) {
      await payload.create({ collection: 'products', data });
    }
    created += 1;
  }
}

log(`Productos: ${created} creados, ${updated} actualizados, ${skipped.length} salteados.`);
for (const entry of skipped) log(`  saltado: ${entry}`);

if (!dryRun) {
  const total = await payload.count({ collection: 'products' });
  log(`Total en la base: ${total.totalDocs} productos.`);

  if (total.totalDocs !== sourceProducts.length) {
    log(`Atención: el archivo tiene ${sourceProducts.length}. La diferencia puede ser`);
    log('normal si hay productos dados de alta desde el panel.');
  }
}

log(dryRun ? 'Simulación terminada: no se escribió nada.' : 'Listo.');
process.exit(0);
