#!/usr/bin/env bash
#
# Respaldo de la base y de los archivos subidos.
#
#   ./scripts/backup.sh [directorio-destino]
#
# Pensado para un cron diario. Guarda el volcado comprimido de PostgreSQL y los
# archivos que se subieron desde el panel, y borra los respaldos más viejos que
# RETENTION_DAYS.
set -euo pipefail

DEST="${1:-${BACKUP_DIR:-/var/backups/boutiquedeleste}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

if [ -z "${DATABASE_URI:-}" ]; then
  echo "Falta DATABASE_URI." >&2
  exit 1
fi

mkdir -p "$DEST"

DB_FILE="$DEST/boutique-$STAMP.sql.gz"
echo "Volcando la base en $DB_FILE"
# --clean --if-exists deja el volcado listo para restaurar sobre una base con datos.
pg_dump --clean --if-exists --no-owner --no-privileges "$DATABASE_URI" | gzip -9 > "$DB_FILE"

# Un volcado vacío o truncado es peor que ninguno: se detecta acá y no el día
# que haya que restaurar.
if ! gzip -t "$DB_FILE" 2>/dev/null; then
  echo "El volcado quedó corrupto. Se elimina." >&2
  rm -f "$DB_FILE"
  exit 1
fi

SIZE=$(stat -c %s "$DB_FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "El volcado pesa $SIZE bytes: demasiado poco para ser válido." >&2
  rm -f "$DB_FILE"
  exit 1
fi

# Los archivos subidos viven en disco, no en la base.
for dir in public/media private/price-updates; do
  if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    NAME=$(echo "$dir" | tr '/' '-')
    echo "Archivando $dir"
    tar -czf "$DEST/$NAME-$STAMP.tar.gz" "$dir"
  fi
done

echo "Eliminando respaldos de más de $RETENTION_DAYS días"
find "$DEST" -name 'boutique-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
find "$DEST" -name '*-price-updates-*.tar.gz' -o -name '*-media-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Listo. $(du -h "$DB_FILE" | cut -f1) en $DB_FILE"
