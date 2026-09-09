import { LegalPage } from '@/components/legal-page';

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Información legal" title="Política de Privacidad">
      <p>En <strong>Boutique del Este</strong> respetamos la privacidad de nuestros clientes y utilizamos los datos personales únicamente para gestionar correctamente nuestras operaciones comerciales.</p>
      <p>Durante una compra o consulta podemos solicitar información como nombre, teléfono, correo electrónico, dirección de entrega y otros datos necesarios para procesar el pedido.</p>
      <p>Esta información puede utilizarse para:</p>
      <ul>
        <li>procesar y confirmar compras;</li>
        <li>coordinar entregas;</li>
        <li>brindar atención al cliente;</li>
        <li>informar el estado de un pedido;</li>
        <li>prevenir operaciones fraudulentas;</li>
        <li>mejorar nuestros servicios;</li>
        <li>enviar comunicaciones comerciales únicamente cuando corresponda.</li>
      </ul>
      <p>Boutique del Este no comercializa ni vende los datos personales de sus clientes.</p>
      <p>Determinados datos podrán ser compartidos únicamente con proveedores necesarios para realizar una operación, como procesadores de pago, empresas de logística, <strong>UES, Correo Uruguayo</strong>, proveedores tecnológicos o servicios de hosting.</p>
      <p>Aplicamos medidas razonables de seguridad destinadas a proteger la información almacenada.</p>
      <p>El usuario podrá solicitar el acceso, actualización, rectificación o eliminación de sus datos personales mediante nuestros canales oficiales de contacto, de acuerdo con la normativa uruguaya aplicable.</p>
      <p>El sitio puede utilizar cookies y tecnologías similares para recordar preferencias, analizar el funcionamiento de la página y mejorar la experiencia de navegación.</p>
    </LegalPage>
  );
}
