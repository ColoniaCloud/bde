# Publicación en el VPS

La tienda usa Next.js y requiere Node.js 22.13 o superior.

El VPS es el unico destino de despliegue soportado: `npm run build` y `npm start` usan Next.js
directamente. No hay build alternativo para Cloudflare Workers ni para Vercel.

## Instalación

```bash
npm ci
npm run build
npm start
```

En producción conviene ejecutar `npm start` con PM2 o systemd y publicar la aplicación mediante Nginx con HTTPS.

## Variables privadas

Copiar `.env.example` a `.env.production` y completar los valores reales. Ese archivo no se sube a GitHub.

Para enviar las órdenes de compra se necesitan:

- `SMTP_HOST`, `SMTP_PORT` y `SMTP_SECURE`
- `SMTP_USER` y `SMTP_PASS`
- `ORDER_FROM_EMAIL`: dirección desde la cual se envían los comprobantes
- `ORDER_COPY_EMAIL`: correo de Freddy que recibe una copia privada de cada orden
- `ORDER_DATA_DIR`: carpeta persistente donde se conserva el último número emitido

Ejemplo recomendado para la numeración:

```bash
sudo mkdir -p /var/lib/boutiquedeleste
sudo chown -R USUARIO_DE_LA_APP:USUARIO_DE_LA_APP /var/lib/boutiquedeleste
```

La carpeta elegida no debe borrarse durante las actualizaciones. La primera orden será la `0001` y las siguientes continuarán correlativamente.

## Dominio

Configurar `SITE_URL=https://boutiquedeleste.com`, el dominio principal y `www.boutiquedeleste.com` en Nginx, y emitir el certificado SSL antes de activar los pagos.
