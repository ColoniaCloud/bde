'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ProductCard } from '@/components/product-card';
import { ProductImage } from '@/components/product-image';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';
import { useStore } from '@/components/store-provider';
import { categorySlug, currency, products, type Product } from '@/lib/catalog';

export function ProductDetail({ product }: { product: Product }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const { addToCart, favorites, toggleFavorite } = useStore();
  const routeCategory = categorySlug(product.category);
  const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);
  const saved = favorites.includes(product.id);
  return <main><StoreHeader /><div className="breadcrumbs section-shell"><Link href="/">Inicio</Link><span>›</span><Link href={`/categoria/${routeCategory}`}>{product.category}</Link><span>›</span><strong>{product.brand}</strong></div><section className="product-detail section-shell"><div className="detail-gallery"><button className="zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Ampliar imagen de ${product.name}`}>{!!product.discount && <span className="discount">-{product.discount}%</span>}<ProductImage src={product.image} alt={product.name} /><span className="zoom-hint">⌕ tocar para ampliar</span></button><p>Seleccioná la imagen para verla en tamaño completo.</p></div><div className="detail-info">{product.tag && <span className="detail-tag">{product.tag}</span>}<span className="product-brand">{product.brand}</span><h1>{product.name}</h1><p className="detail-description">{product.description}</p><div className="detail-price">{product.oldPrice && <del>{currency.format(product.oldPrice)}</del>}<strong>{currency.format(product.price)}</strong>{product.oldPrice && <span>Ahorrás {currency.format(product.oldPrice - product.price)}</span>}</div><p className="detail-installments">Precio en pesos uruguayos · Stock sujeto a confirmación</p><div className="detail-actions"><button className="primary-action" onClick={() => addToCart(product)}>agregar a mi bolsa</button><button className={`favorite-action ${saved ? 'saved' : ''}`} aria-label={saved ? 'Quitar de favoritos' : 'Agregar a favoritos'} onClick={() => toggleFavorite(product.id)}>{saved ? '♥' : '♡'}</button></div><div className="detail-delivery"><span>◇</span><div><strong>Envío en un máximo de 48 horas</strong><p>Maldonado y Punta del Este</p></div></div></div></section><section className="product-content section-shell"><article><span>detalles</span><h2>Conocé el producto</h2><ul>{product.details.map((detail) => <li key={detail}>✓ {detail}</li>)}</ul></article><article><span>compra simple</span><h2>Agregalo a tu pedido</h2><p>Sumalo a tu bolsa y envianos el pedido. Confirmamos disponibilidad, precio final y entrega cuando recibimos tu consulta.</p></article></section>{related.length > 0 && <section className="products-section section-shell related-products"><div className="section-heading"><div><p>otras opciones</p><h2>Productos relacionados</h2></div></div><div className="product-grid">{related.map((item) => <ProductCard product={item} key={item.id} />)}</div></section>}<StoreFooter /><Dialog open={zoomOpen} onOpenChange={setZoomOpen}><DialogContent className="zoom-dialog" aria-describedby="zoom-description"><DialogTitle className="zoom-title">{product.name}</DialogTitle><DialogDescription id="zoom-description" className="zoom-description">Vista ampliada del producto</DialogDescription><ProductImage src={product.image} alt={`Vista ampliada de ${product.name}`} /></DialogContent></Dialog></main>;
}
