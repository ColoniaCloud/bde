'use client';

import Link from 'next/link';
import { currency, type Product } from '@/lib/catalog';
import { useStore } from '@/components/store-provider';
import { ProductImage } from '@/components/product-image';

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, favorites, toggleFavorite } = useStore();
  const saved = favorites.includes(product.id);

  return <article className="product-card">
    <div className="product-image">
      {product.tag && <span className="product-tag">{product.tag}</span>}
      {!!product.discount && <span className="discount">-{product.discount}%</span>}
      <button className={`heart ${saved ? 'saved' : ''}`} aria-label={saved ? 'Quitar de favoritos' : 'Guardar en favoritos'} onClick={() => toggleFavorite(product.id)}>{saved ? '♥' : '♡'}</button>
      <Link className="product-image-link" href={`/productos/${product.sku}`} aria-label={`Ver ${product.name}`}>
        <ProductImage src={product.image} alt={product.name} loading="lazy" />
        <span className="view-product">ver producto</span>
      </Link>
    </div>
    <div className="product-info">
      <span className="product-brand">{product.brand}</span>
      <h3><Link href={`/productos/${product.sku}`}>{product.name}</Link></h3>
      <p className="product-description">{product.description}</p>
      <div className="price">{product.oldPrice && <del>{currency.format(product.oldPrice)}</del>}<strong>{currency.format(product.price)}</strong></div>
      <small className="installments">6 cuotas de {currency.format(Math.ceil(product.price / 6))}</small>
      <button className="add-button" onClick={() => addToCart(product)}>agregar a mi bolsa</button>
    </div>
  </article>;
}
