import Link from 'next/link';
import { CatalogUpdateStatus } from '@/components/catalog-update-status';

export function StoreFooter() {
  return <footer>
    <Link className="wordmark footer-logo" href="/"><img src="/LOG%20OK%20blanco.svg" alt="Boutique del Este" /></Link>
    <div><strong>comprá</strong><Link href="/#productos">Promociones</Link><Link href="/categoria/perfumeria">Perfumería</Link><Link href="/categoria/cuerpo-y-bano">Cuidado personal</Link><Link href="/categoria/regalos">Regalos</Link></div>
    <div><strong>ayuda</strong><Link href="/terminos-y-condiciones">Términos y Condiciones</Link><Link href="/politica-de-privacidad">Política de Privacidad</Link><Link href="/cambios-y-devoluciones">Cambios y Devoluciones</Link><Link href="/envios-y-entregas">Envíos y Entregas</Link></div>
    <div><strong>boutique del este</strong><Link href="/#inicio">Nuestra selección</Link><Link href="/#productos">Marcas y productos</Link><a href="https://wa.me/59892143420">Asesoramiento</a><Link href="/#inicio">Cómo comprar</Link></div>
    <div className="country"><span>Uruguay · UYU</span><small>Maldonado y Punta del Este: entrega en hasta 48 h · Interior: despachamos en hasta 48 h por UES o Correo Uruguayo</small></div>
    <p className="legal"><Link href="/terminos-y-condiciones">Términos y Condiciones</Link><span> · </span><Link href="/politica-de-privacidad">Política de Privacidad</Link><span> · </span><Link href="/cambios-y-devoluciones">Cambios y Devoluciones</Link><span> · </span><Link href="/envios-y-entregas">Envíos y Entregas</Link></p>
    <CatalogUpdateStatus />
  </footer>;
}
