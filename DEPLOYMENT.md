# Publicación

La tienda usa Next.js y requiere Node.js 22.13 o superior.

Se publica como un proyecto Node común: `npm run build` y `npm start`, sin Docker
y sin adaptadores. Sirve tanto un hosting Node administrado como un servidor
propio. No hay build alternativo para Cloudflare Workers ni para Vercel.

## Base de datos

El catálogo, los pedidos y el panel viven en PostgreSQL 16.

La aplicación no impone cómo se provee: alcanza con una cadena de conexión en
`DATABASE_URI`. Puede ser un PostgreSQL instalado en el mismo servidor o uno
gestionado aparte.

Si lo instalás vos, dos recomendaciones:

- Que escuche sólo en `127.0.0.1` si la aplicación corre en el mismo servidor.
  La base no debe ser alcanzable desde internet.
- Usuario propio para la aplicación, no `postgres`.

```sql
CREATE DATABASE boutique;
CREATE USER boutique WITH PASSWORD '...';
GRANT ALL PRIVILEGES ON DATABASE boutique TO boutique;
```

**Hacé respaldos desde el primer día**, porque acá viven el catálogo y los
pedidos. Hay dos scripts listos:

```bash
./scripts/backup.sh                      # volcado + archivos subidos
./scripts/restore.sh archivo.sql.gz      # restauración
```

El respaldo verifica que el volcado no haya quedado truncado, y borra los que
superen `RETENTION_DAYS` (30 por defecto). La restauración devuelve también la
secuencia de numeración de órdenes, así que los números no se repiten.

Cron diario sugerido:

```bash
0 4 * * * cd /ruta/al/proyecto && DATABASE_URI='...' ./scripts/backup.sh >> /var/log/boutique-backup.log 2>&1
```

> Probá una restauración de verdad antes de necesitarla. Un respaldo que nunca
> se restauró no es un respaldo.

## Instalación

```bash
npm ci
npm run payload migrate   # crea o actualiza el esquema
npm run build
npm start
```

`payload migrate` es obligatorio en cada publicación que traiga cambios de
esquema, y hay que correrlo **antes** de `npm start`.

Si la aplicación corre en un servidor propio, conviene ejecutar `npm start` con
PM2 o systemd y publicarla detrás de Nginx con HTTPS. En un hosting Node
administrado eso lo resuelve la plataforma: alcanza con declarar las variables de
entorno y el comando de arranque.

## Primera puesta en marcha

```bash
# 1. Cargar el catálogo desde app/catalog-data.ts (idempotente: se puede repetir)
npm run catalog:seed

# 2. Crear el primer usuario del panel
ADMIN_EMAIL=freddy@boutiquedeleste.com ADMIN_PASSWORD='...' ADMIN_NAME='Freddy' npm run admin:create
```

El panel queda en `/admin`. Los usuarios siguientes se dan de alta desde ahí.

`/admin` y `/api/payload` son rutas de la misma aplicación: no necesitan nada
aparte. Si hay un Nginx propio adelante, tiene que reenviarlas como a cualquier
otra; conviene además limitar `/admin` por IP si el acceso es siempre desde los
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

No hay ninguna variable que haga falta **en tiempo de build**: `npm run build`
compila sin base de datos y sin credenciales. Todo se lee al arrancar. Esto vale
también para el catálogo: ninguna página se arma con los datos que haya al
compilar, así que un producto o una categoría que se den de alta en el panel se
ven al instante, sin volver a desplegar.

Tampoco queda ninguna `NEXT_PUBLIC_*`: al retirarse Supabase, el ingreso con
Google pasó a resolverse en el servidor con `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET`, que no llegan al navegador.

La lista completa de variables, por rubro, está en **`ENVIRONMENT.md`**.

### Para las órdenes de compra

- `SMTP_HOST`, `SMTP_PORT` y `SMTP_SECURE`
- `SMTP_USER` y `SMTP_PASS`
- `ORDER_FROM_EMAIL`: dirección desde la cual se envían los comprobantes
- `ORDER_COPY_EMAIL`: correo de Freddy que recibe una copia privada de cada orden

La numeración correlativa la lleva una secuencia de PostgreSQL, no un archivo en
disco. Ya no hace falta una carpeta persistente ni `ORDER_DATA_DIR`.

**Si la tienda ya emitió órdenes antes de esta versión**, hay que adelantar la
secuencia al último número usado ANTES de recibir pedidos nuevos, o se repetirán:

```bash
psql "$DATABASE_URI" -c "SELECT setval('order_number_seq', 123);"   # 123 = último N.º emitido
```

Si es una instalación nueva, no hay nada que hacer: la primera orden será la `0001`.

## Asistente de precios

Cada tanto llega un PDF con la lista de precios. El circuito es de dos tiempos y
**nada se aplica solo**:

1. Subir el PDF en `/admin → Actualizaciones de precios`. El asistente lo lee y
   arma una propuesta.
2. Revisar la propuesta y poner el estado en «Aplicar». Recién ahí se escriben
   los precios de las filas tildadas.

Las filas con una variación mayor al ±25 %, los productos que no están en el
catálogo y las lecturas dudosas **llegan sin tildar a propósito**: hay que
marcarlas a mano una por una.

El tilde **«Es la lista completa»** sólo va si el PDF trae todo el catálogo. Con
él marcado, los productos que no figuren se proponen como sin stock; con una
lista parcial dejalo sin tildar o vas a ver cientos de filas de ruido.

Requiere `GROQ_API_KEY`. Sin ella, subir un PDF deja el registro en estado
«Falló» con el motivo, y el resto de la tienda sigue funcionando igual.

**El PDF tiene que tener texto seleccionable.** Un escaneo sin capa de texto se
rechaza con un mensaje explícito en lugar de devolver una propuesta vacía.

### Recordatorio cada 20 días

```bash
# crontab del usuario de la aplicación
0 9 * * * cd /ruta/al/proyecto && npm run prices:remind >> /var/log/boutique-precios.log 2>&1
```

Sólo avisa por correo; no toca precios. El umbral se ajusta con
`PRICE_REMINDER_DAYS`.

## Conciliación de pagos

Los webhooks se pierden: una caída o un reintento agotado deja una orden pagada
figurando como pendiente. Un cron diario vuelve a preguntarle a Mercado Pago:

```bash
# crontab del usuario de la aplicación
30 3 * * * cd /ruta/al/proyecto && npm run orders:reconcile >> /var/log/boutique-reconcile.log 2>&1
```

## Pedidos

Cada pedido queda guardado en la base con sus líneas a precio congelado y su
historial de estados, y se ve en `/admin`. El comprobante por correo se envía
**después** de guardar: si el SMTP falla, la venta no se pierde y el pedido queda
marcado como «comprobante no enviado» en el panel.

## Dominio

Configurar `SITE_URL=https://boutiquedeleste.com`, apuntar el dominio principal y
`www.boutiquedeleste.com` a la aplicación, y tener el certificado SSL emitido
**antes** de activar los pagos: Mercado Pago no acepta URLs de retorno ni webhooks
sin HTTPS.
