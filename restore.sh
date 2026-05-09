#!/usr/bin/env bash
# Restaura el SDD al estado del último backup, borrando código generado por los modelos.
# Uso: bash restore.sh [nombre-del-backup]
# Si no se pasa argumento, usa el último backup registrado en .last-backup

set -euo pipefail

cd "$(dirname "$0")"

BACKUP="${1:-}"
if [[ -z "$BACKUP" ]]; then
  if [[ -f .last-backup ]]; then
    BACKUP="$(cat .last-backup)"
  else
    echo "ERROR: no se especificó backup y no existe .last-backup" >&2
    echo "Backups disponibles:" >&2
    ls -d .backup-* 2>/dev/null || echo "  (ninguno)" >&2
    exit 1
  fi
fi

if [[ ! -d "$BACKUP" ]]; then
  echo "ERROR: backup '$BACKUP' no existe" >&2
  exit 1
fi

echo "Restaurando desde: $BACKUP"
echo ""
echo "Esto va a:"
echo "  1. BORRAR todo el contenido de cada subcarpeta de modelo (deepseek/, kimi/, mimo/, minimax/, glm/, codex/, claude/)"
echo "  2. RESTAURAR README.md y .ai/ (KICKSTART + spec + plan + constitution) en cada subcarpeta"
echo "  3. RESTAURAR el .ai/ del root"
echo ""
read -p "¿Continuar? (escribí 'admin' para confirmar): " CONFIRM

if [[ "$CONFIRM" != "admin" ]]; then
  echo "Cancelado."
  exit 0
fi

# Borrar contenido de cada subcarpeta de modelo
for model in deepseek kimi mimo minimax glm codex claude; do
  echo "Limpiando $model/..."
  rm -rf "$model"
  mkdir -p "$model"
done

# Borrar y restaurar .ai/ del root
rm -rf .ai
cp -R "$BACKUP/.ai" .

# Restaurar contenido de cada subcarpeta desde el backup
for model in deepseek kimi mimo minimax glm codex claude; do
  echo "Restaurando $model/..."
  cp -R "$BACKUP/$model/.ai" "$model/"
  cp "$BACKUP/$model/README.md" "$model/"
done

echo ""
echo "✅ Restauración completa. Estado limpio igual que el backup '$BACKUP'."
echo ""
echo "Verificación:"
find . -name ".ai" -type d -not -path "./.backup-*/*" | sort
