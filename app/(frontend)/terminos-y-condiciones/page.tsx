import { LegalPage } from '@/components/legal-page';

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Información legal" title="Términos y Condiciones">
      <p>Boutique del Este es una tienda online que comercializa productos de perfumería, belleza, cuidado personal y otras categorías disponibles en nuestro catálogo.</p>
      <p>Al realizar una compra en nuestro sitio web, el cliente declara haber leído y aceptado estos Términos y Condiciones.</p>
      <p>Los precios publicados están expresados en <strong>pesos uruguayos (UYU)</strong>, salvo que se indique expresamente lo contrario. La disponibilidad de los productos se encuentra sujeta a confirmación de stock.</p>
      <p>Una compra se considera confirmada una vez recibido y validado el pago correspondiente. En caso de producirse un error evidente en el precio, descripción, disponibilidad o información de un producto, Boutique del Este se comunicará con el cliente antes de procesar el pedido.</p>
      <p>Las imágenes de los productos son ilustrativas. Pueden existir pequeñas diferencias de presentación, packaging o tonalidad respecto del producto recibido debido a actualizaciones realizadas por fabricantes o proveedores.</p>
      <p>Las promociones y descuentos serán válidos durante el período informado o hasta agotar stock.</p>
      <p>Boutique del Este se reserva el derecho de actualizar el contenido del sitio, precios, productos y presentes condiciones cuando sea necesario, sin afectar derechos ya adquiridos por compras previamente confirmadas.</p>
      <p>Para consultas relacionadas con pedidos, pagos o productos, el cliente podrá comunicarse mediante nuestros canales oficiales de atención.</p>
      <p>Las relaciones de consumo se regirán por la normativa vigente de la República Oriental del Uruguay.</p>
    </LegalPage>
  );
}
