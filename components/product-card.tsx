'use client';

import Link from 'next/link';
import { ProductImage } from '@/components/product-image';
import { useStore } from '@/components/store-provider';
import { currency } from '@/lib/format';
import type { StoreProduct } from '@/lib/products';

export function ProductCard({ product }: { product: StoreProduct }) {
  const { addToCart, favorites, toggleFavorite } = useStore();
  const saved = favorites.includes(product.code);
  const sellable = product.status === 'available';

  return <article className="product-card">
    <div className="product-image">
      {product.tag && <span className="product-tag">{product.tag}</span>}
      {!!product.discount && <span className="discount">-{product.discount}%</span>}
      <button
        className={`heart ${saved ? 'saved' : ''}`}
        aria-label={saved ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        onClick={() => toggleFavorite(product.code)}
      >{saved ? '♥' : '♡'}</button>
      <Link className="product-image-link" href={`/productos/${product.code}`} aria-label={`Ver ${product.name}`}>
        <ProductImage src={product.image} alt={product.name} loading="lazy" />
        <span className="view-product">ver producto</span>
      </Link>
    </div>
    <div className="product-info">
      <span className="product-brand">{product.brand}</span>
      <h3><Link href={`/productos/${product.code}`}>{product.name}</Link></h3>
      <p className="product-description">{product.description}</p>
      <div className="price">
        {product.oldPrice && <del>{currency.format(product.oldPrice)}</del>}
        <strong>{currency.format(product.price)}</strong>
      </div>
      <small className="installments">6 cuotas de {currency.format(Math.ceil(product.price / 6))}</small>
      {sellable
        ? <button className="add-button" onClick={() => addToCart(product)}>agregar a mi bolsa</button>
        : <Link className="add-button" href={`/productos/${product.code}`}>
            {product.status === 'out-of-stock' ? 'sin stock' : 'consultar'}
          </Link>}
    </div>
  </article>;
}
