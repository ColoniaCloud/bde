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

Las variables se validan al arrancar con Zod. Una variable presente pero malformada
(un `SMTP_PORT` que no es un puerto, un `ORDER_COPY_EMAIL` que no es un correo)
detiene la aplicación con un mensaje que dice cuál es. Las opcionales pueden faltar:
la funcionalidad que dependa de ellas responde 503 en lugar de romper la tienda.

### Obligatorias

`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` son necesarias
**en tiempo de build**, no solo al ejecutar: se incrustan en el bundle del navegador.
Si faltan, `npm run build` falla. Antes eran valores fijos dentro de `lib/supabase.ts`;
ahora hay que declararlas en el entorno.

### Para las órdenes de compra

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
