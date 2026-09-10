# Variables de entorno

Referencia completa de la configuración del proyecto.

Las variables se validan al arrancar con Zod (`lib/env.server.ts` para las
privadas, `lib/env.public.ts` para las que viajan al navegador). Una variable
**presente pero malformada** detiene la aplicación con un mensaje que dice cuál
es; una **ausente** sólo desactiva la función que depende de ella.

Dónde va cada archivo:

| Archivo | Ubicación | Para qué |
|---|---|---|
| `.env.production` | raíz del proyecto | la aplicación |
| `.env` | junto a `docker-compose.yml` | PostgreSQL en Docker |
| `.env.local` | raíz del proyecto | desarrollo local |

Ninguno se sube a git: `.gitignore` ignora todo `.env*` salvo `.env.example`.

---

## Obligatorias

Sin estas cinco el proyecto no arranca o no compila.

### `DATABASE_URI`

Cadena de conexión a PostgreSQL. **Sin ella la aplicación no arranca.**

```
DATABASE_URI=postgres://boutique:CONTRASEÑA@127.0.0.1:5432/boutique
```

La contraseña tiene que coincidir con `POSTGRES_PASSWORD` del `.env` de Docker.

### `PAYLOAD_SECRET`

Firma las sesiones del panel de administración. Mínimo 32 caracteres.

```bash
openssl rand -base64 48
```

> Si la cambiás, **se cierran todas las sesiones abiertas** del panel. No es
> destructivo, pero hay que volver a entrar.

### `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

URL y clave publicable del proyecto de Supabase, que resuelve el ingreso con
Google.

Son necesarias **en tiempo de compilación**, no sólo al ejecutar: Next.js las
incrusta en el bundle del navegador. Si faltan, **`npm run build` falla** con un
mensaje que nombra la que falta.

> El prefijo `NEXT_PUBLIC_` significa que son visibles para cualquiera que abra
> la tienda. Es correcto: la clave publicable está pensada para eso. No pongas
> ahí ninguna clave secreta.

### `POSTGRES_PASSWORD`

Va en el `.env` de `docker-compose.yml`, no en el de la aplicación. Sin ella el
contenedor se niega a levantar, a propósito.

```
POSTGRES_DB=boutique
POSTGRES_USER=boutique
POSTGRES_PASSWORD=...
```

---

## Recomendadas

Funciona sin ellas, pero con la funcionalidad recortada.

### `SITE_URL`

Dirección pública de la tienda. De acá salen las URLs de retorno y de webhook
que se le mandan a Mercado Pago.

```
SITE_URL=https://boutiquedeleste.com
```

En desarrollo, si falta, se usa `http://localhost:3000`. **En producción, si
falta, el checkout con Mercado Pago responde 503**: no se puede armar una URL de
retorno válida.

---

## Correo (opcional, en bloque)

Envía el comprobante al cliente y una copia oculta a la casilla interna.

| Variable | Ejemplo | Notas |
|---|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` | |
| `SMTP_PORT` | `465` | por defecto 587 |
| `SMTP_SECURE` | `true` | sólo `true` lo activa; con el puerto 465 se asume |
| `SMTP_USER` | `ventas@boutiquedeleste.com` | |
| `SMTP_PASS` | | contraseña de la casilla |
| `ORDER_FROM_EMAIL` | `ventas@boutiquedeleste.com` | si falta, se usa `SMTP_USER` |
| `ORDER_COPY_EMAIL` | | recibe copia oculta de cada pedido y los recordatorios |

**Si falta cualquiera de `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` u `ORDER_COPY_EMAIL`
no se emiten comprobantes.** El pedido igual queda guardado en la base y aparece
en el panel marcado como «comprobante no enviado», así que **no se pierde la
venta**.

---

## Mercado Pago (opcional, en bloque)

| Variable | De dónde sale |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Panel de Mercado Pago → Tus integraciones → Credenciales |
| `MERCADOPAGO_WEBHOOK_SECRET` | Se define al dar de alta el webhook |

El webhook apunta a `https://boutiquedeleste.com/api/mercado-pago/webhook`.

Si faltan, **el botón de pago responde 503** con un mensaje entendible y el
cliente puede seguir por WhatsApp. La verificación ocurre *antes* de reservar un
número de orden, así que una tienda mal configurada no deja huecos en la
numeración correlativa.

> Empezá con las credenciales de prueba (`TEST-...`) antes de las de producción.

---

## Asistente de precios (opcional)

| Variable | Notas |
|---|---|
| `GROQ_API_KEY` | Clave de la API de Groq |
| `GROQ_MODEL` | Por defecto `qwen/qwen3.6-27b` |
| `GROQ_BASE_URL` | Sólo para apuntar a un proxy o simulador en pruebas |

Sin `GROQ_API_KEY`, subir un PDF deja el registro en estado «Falló» con el
motivo; el resto de la tienda sigue igual.

**Groq depreca modelos con frecuencia** — `llama-4-scout` quedó obsoleto en junio
de 2026. Confirmá el identificador antes de cada despliegue:

```bash
curl -s https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY" | grep -o '"id":"[^"]*"'
```

Verificado el 2026-09-10: `qwen/qwen3.6-27b` y `qwen/qwen3.8-27b` existen y los
dos soportan `json_schema` y visión. Son intercambiables sin tocar código.

---

## Tareas programadas (opcional)

| Variable | Por defecto | Qué controla |
|---|---|---|
| `RECONCILE_AFTER_HOURS` | `2` | Antigüedad mínima de una orden pendiente para reconsultarla |
| `PRICE_REMINDER_DAYS` | `20` | Días sin actualizar precios antes de avisar |

---

## Sólo para comandos puntuales

No van en ningún `.env`. Se pasan en la línea al crear el primer usuario del
panel; los siguientes se dan de alta desde `/admin`.

```bash
ADMIN_EMAIL=freddy@boutiquedeleste.com \
ADMIN_PASSWORD='una-clave-de-al-menos-12-caracteres' \
ADMIN_NAME='Freddy' \
npm run admin:create
```

---

## Qué pasa si falta cada una

| Falta | Consecuencia |
|---|---|
| `DATABASE_URI` o `PAYLOAD_SECRET` | **La aplicación no arranca** |
| `NEXT_PUBLIC_SUPABASE_*` | **`npm run build` falla** |
| `POSTGRES_PASSWORD` | El contenedor de la base no levanta |
| `SITE_URL` (en producción) | El checkout con Mercado Pago responde 503 |
| Cualquiera del bloque SMTP | No se emiten comprobantes; **el pedido igual se guarda** |
| Cualquiera de Mercado Pago | El botón de pago responde 503; WhatsApp sigue andando |
| `GROQ_API_KEY` | Subir un PDF queda en «Falló»; el resto no se afecta |
| Las de tareas programadas | Se usan los valores por defecto |

---

## Notas de seguridad

- **Sólo las dos `NEXT_PUBLIC_*` llegan al navegador.** Verificado sobre el
  bundle compilado: `PAYLOAD_SECRET`, la contraseña de Postgres, `GROQ_API_KEY`
  y el host SMTP no aparecen en `.next/static`.
- `lib/env.server.ts` está marcado con `server-only`, así que si alguna vez un
  componente de cliente lo importara por error, **el build falla** en lugar de
  filtrar la configuración.
- Una variable vacía (`SMTP_HOST=`) cuenta como ausente, que es la forma
  habitual de dejar algo sin configurar en un `.env`.
- El puerto de PostgreSQL se publica en `127.0.0.1` a propósito: la base no debe
  ser alcanzable desde internet.

## Ver también

- `.env.example` — plantilla lista para copiar
- `DEPLOYMENT.md` — pasos de publicación, migraciones y crons
