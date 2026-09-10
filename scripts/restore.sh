#!/usr/bin/env bash
#
# Restauración desde un respaldo.
#
#   ./scripts/restore.sh ruta/al/boutique-AAAAMMDD-HHMMSS.sql.gz
#
# PISA los datos actuales de la base apuntada por DATABASE_URI. Pide
# confirmación salvo que se pase --yes.
set -euo pipefail

FILE="${1:-}"
CONFIRM="${2:-}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: ./scripts/restore.sh <archivo.sql.gz> [--yes]" >&2
  exit 1
fi

if [ -z "${DATABASE_URI:-}" ]; then
  echo "Falta DATABASE_URI." >&2
  exit 1
fi

if ! gzip -t "$FILE" 2>/dev/null; then
  echo "El archivo está corrupto o no es un .gz válido." >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "Esto REEMPLAZA el contenido de la base en DATABASE_URI."
  read -r -p "Escribí 'restaurar' para continuar: " answer
  [ "$answer" = "restaurar" ] || { echo "Cancelado."; exit 1; }
fi

echo "Restaurando desde $FILE"
gunzip -c "$FILE" | psql --quiet --set ON_ERROR_STOP=on "$DATABASE_URI"

echo "Listo. Comprobación rápida:"
psql --quiet --tuples-only --no-align "$DATABASE_URI" -c \
  "SELECT 'productos: ' || COUNT(*) FROM products
   UNION ALL SELECT 'pedidos: ' || COUNT(*) FROM orders
   UNION ALL SELECT 'usuarios del panel: ' || COUNT(*) FROM users;"
echo
echo "Si la tienda ya emitió órdenes, verificá la secuencia de numeración:"
echo "  psql \"\$DATABASE_URI\" -c \"SELECT last_value FROM order_number_seq;\""
