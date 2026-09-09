# Publicación en el VPS

La tienda usa Next.js y requiere Node.js 22.13 o superior.

El VPS es el unico destino de despliegue soportado: `npm run build` y `npm start` usan Next.js
directamente. No hay build alternativo para Cloudflare Workers ni para Vercel.

## Base de datos

El catálogo y el panel de administración viven en PostgreSQL 16.

```bash
# Definí POSTGRES_PASSWORD en un .env junto al docker-compose.yml
docker compose up -d
```

Sólo la base corre en Docker; la aplicación va por fuera, con PM2 o systemd. El
puerto se publica en `127.0.0.1` a propósito: la base no debe verse desde internet.

**Hacé backups desde el primer día.** Un volcado diario y una restauración probada
de verdad, porque acá pasan a vivir el catálogo y, desde la fase 3, los pedidos:

```bash
docker exec boutique-db pg_dump -U boutique boutique | gzip > backup-$(date +%F).sql.gz
```

## Instalación

```bash
npm ci
npm run payload migrate   # crea o actualiza el esquema
npm run build
npm start
```

`payload migrate` es obligatorio en cada publicación que traiga cambios de
esquema, y hay que correrlo **antes** de `npm start`.

En producción conviene ejecutar `npm start` con PM2 o systemd y publicar la aplicación mediante Nginx con HTTPS.

## Primera puesta en marcha

```bash
# 1. Cargar el catálogo desde app/catalog-data.ts (idempotente: se puede repetir)
npm run catalog:seed

# 2. Crear el primer usuario del panel
ADMIN_EMAIL=freddy@boutiquedeleste.com ADMIN_PASSWORD='...' ADMIN_NAME='Freddy' npm run admin:create
```

El panel queda en `/admin`. Los usuarios siguientes se dan de alta desde ahí.

Nginx debe reenviar `/admin` y `/api/payload` a la aplicación como cualquier otra
ruta. Conviene además limitar `/admin` por IP si el acceso es siempre desde los
mismos lugares.

## Variables privadas

Copiar `.env.example` a `.env.production` y completar los valores reales. Ese archivo no se sube a GitHub.

Las variables se validan al arrancar con Zod. Una variable presente pero malformada
(un `SMTP_PORT` que no es un puerto, un `ORDER_COPY_EMAIL` que no es un correo)
detiene la aplicación con un mensaje que dice cuál es. Las opcionales pueden faltar:
la funcionalidad que dependa de ellas responde 503 en lugar de romper la tienda.

### Obligatorias

`DATABASE_URI` y `PAYLOAD_SECRET` son necesarias siempre: sin ellas la aplicación
no arranca. `PAYLOAD_SECRET` firma las sesiones del panel —generala con
`openssl rand -base64 48`— y si la cambiás, se cierran todas las sesiones abiertas.

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
