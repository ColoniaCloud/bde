# Variables de entorno

Todas van en un archivo `.env.production` en la raíz del proyecto. No se sube a
git.

Se validan al arrancar: una variable **malformada** detiene la aplicación con un
mensaje que dice cuál es; una **ausente** sólo desactiva su función.

---

## 1 · Base de datos y panel · obligatorias

Sin estas dos la aplicación no arranca.

| Variable | Valor |
|---|---|
| `DATABASE_URI` | Cadena de conexión a PostgreSQL |
| `PAYLOAD_SECRET` | Mínimo 32 caracteres. Firma las sesiones del panel |

```bash
DATABASE_URI=postgres://usuario:contraseña@host:5432/boutique
PAYLOAD_SECRET=$(openssl rand -base64 48)
```

Cambiar `PAYLOAD_SECRET` cierra todas las sesiones abiertas del panel.

---

## 2 · Tienda · obligatorias

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase |

Resuelven el ingreso con Google. Se necesitan **al compilar**, no sólo al
ejecutar: si faltan, `npm run build` falla.

Son públicas por diseño: viajan al navegador. No pongas claves secretas con el
prefijo `NEXT_PUBLIC_`.

---

## 3 · Dirección pública · recomendada

| Variable | Valor |
|---|---|
| `SITE_URL` | `https://boutiquedeleste.com` |

De acá salen las URLs de retorno y de webhook que recibe Mercado Pago. En
producción, si falta, el checkout con Mercado Pago responde 503.

---

## 4 · Pagos · opcional, en bloque

| Variable | De dónde sale |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Mercado Pago → Tus integraciones → Credenciales |
| `MERCADOPAGO_WEBHOOK_SECRET` | Se define al dar de alta el webhook |

El webhook apunta a `https://boutiquedeleste.com/api/mercado-pago/webhook`.

Si faltan, el botón de pago responde 503 y el cliente sigue por WhatsApp. No se
consume ningún número de orden.

Empezá con las credenciales de prueba (`TEST-...`).

---

## 5 · Correo · opcional, en bloque

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `ventas@boutiquedeleste.com` |
| `SMTP_PASS` | Contraseña de esa casilla |
| `ORDER_FROM_EMAIL` | Remitente del comprobante |
| `ORDER_COPY_EMAIL` | Recibe copia oculta de cada pedido |

Si falta alguna, no se emiten comprobantes — **pero el pedido igual queda
guardado** y aparece en el panel marcado como «comprobante no enviado».

---

## 6 · Asistente de precios · opcional

| Variable | Valor |
|---|---|
| `GROQ_API_KEY` | Clave de la API de Groq |
| `GROQ_MODEL` | `qwen/qwen3.6-27b` |

Sin la clave, subir un PDF queda en estado «Falló»; el resto de la tienda no se
afecta.

Groq depreca modelos seguido. Confirmá el identificador antes de desplegar:

```bash
curl -s https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY" | grep -o '"id":"[^"]*"'
```

Verificado el 2026-09-10: `qwen/qwen3.6-27b` y `qwen/qwen3.8-27b` sirven los dos
y son intercambiables sin tocar código.

---

## 7 · Tareas programadas · opcional

| Variable | Por defecto | Qué controla |
|---|---|---|
| `RECONCILE_AFTER_HOURS` | `2` | Antigüedad de una orden pendiente antes de reconsultarla |
| `PRICE_REMINDER_DAYS` | `20` | Días sin actualizar precios antes de avisar |
| `BACKUP_DIR` | `/var/backups/boutiquedeleste` | Dónde se guardan los respaldos |
| `RETENTION_DAYS` | `30` | Cuántos días se conservan |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` o `error` |

---

## 8 · Sólo en la línea de comandos

No van en el `.env`. Se usan una vez, para crear el primer usuario del panel:

```bash
ADMIN_EMAIL=freddy@boutiquedeleste.com \
ADMIN_PASSWORD='al-menos-12-caracteres' \
ADMIN_NAME='Freddy' \
npm run admin:create
```

---

## Resumen: qué pasa si falta

| Falta | Consecuencia |
|---|---|
| `DATABASE_URI` · `PAYLOAD_SECRET` | **No arranca** |
| `NEXT_PUBLIC_SUPABASE_*` | **No compila** |
| `SITE_URL` en producción | Mercado Pago responde 503 |
| Bloque SMTP | Sin comprobantes; el pedido se guarda igual |
| Bloque Mercado Pago | Sin botón de pago; WhatsApp sigue |
| `GROQ_API_KEY` | Sin asistente de precios |
| Tareas programadas | Se usan los valores por defecto |

## Nota de seguridad

Sólo las dos `NEXT_PUBLIC_*` llegan al navegador. Verificado sobre el bundle
compilado: `PAYLOAD_SECRET`, la contraseña de la base, `GROQ_API_KEY` y el host
SMTP no aparecen en `.next/static`.

## Ver también

- `.env.example` — plantilla para copiar
- `DEPLOYMENT.md` — publicación, migraciones y tareas programadas
