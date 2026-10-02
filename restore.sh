#!/usr/bin/env bash
# Reinicia los directorios de los modelos desde los insumos canónicos actuales.

set -euo pipefail

readonly MODELS=(claude codex deepseek glm kimi mimo minimax nan)
declare -A MODEL_LABELS=(
  [claude]='Claude'
  [codex]='Codex / GPT'
  [deepseek]='DeepSeek'
  [glm]='GLM'
  [kimi]='Kimi'
  [mimo]='MiMo'
  [minimax]='MiniMax'
  [nan]='Nan'
)
readonly INPUTS=(
  'KICKSTART.md'
  'constitution.md'
  'design.md'
  'evaluation.md'
  'specs/app-presupuestos.yaml'
  'plans/app-presupuestos.yaml'
)

ROOT="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CANON="$ROOT/.ai"
STAGE=''
REPLACEMENT_STARTED=false
ROLLBACK_SUCCEEDED=false
declare -A HAD_ORIGINAL=()
declare -A INSTALLED=()

usage() {
  cat <<'EOF'
Uso: bash restore.sh [--dry-run|--help]

Recrea los ocho directorios de modelos con los insumos canónicos actuales de
.ai/. No utiliza backups ni modifica el .ai/ raíz ni rutas no relacionadas.

Opciones:
  --dry-run  valida y enumera los destinos sin solicitar confirmación ni modificar datos
  --help     muestra esta ayuda
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

validate_sources() {
  local path

  for path in "$CANON" "$CANON/specs" "$CANON/plans"; do
    [[ ! -L "$path" && -d "$path" ]] || fail "el directorio canónico '$path' debe ser un directorio real."
  done

  for path in "${INPUTS[@]}"; do
    path="$CANON/$path"
    [[ ! -L "$path" && -f "$path" && -r "$path" ]] || fail "el insumo canónico '$path' debe ser un archivo regular legible."
  done
}

validate_target() {
  local model="$1"
  local target="$ROOT/$model"

  [[ ! -L "$target" ]] || fail "el destino '$model' no puede ser un enlace simbólico."
  [[ ! -e "$target" || -d "$target" ]] || fail "el destino '$model' debe ser un directorio o no existir."
}

validate_all_targets() {
  local model
  for model in "${MODELS[@]}"; do
    validate_target "$model"
  done
}

write_readme() {
  local model="$1"
  local destination="$2"
  local label="${MODEL_LABELS[$model]}"

  cat > "$destination/README.md" <<EOF
# $label

Este directorio corresponde al participante $label (\`$model/\`).

- Entrada local: \`.ai/KICKSTART.md\`.
- Los insumos canónicos están copiados de forma aislada en \`.ai/\`.
- Estado: v4 DRAFT; la implementación permanece pendiente.
- El entorno común, el lockfile y la configuración de proveedor quedan diferidos.
EOF
}

prepare_model() {
  local model="$1"
  local destination="$STAGE/prepared/$model"
  local input

  mkdir -p -- "$destination/.ai/specs" "$destination/.ai/plans"
  for input in "${INPUTS[@]}"; do
    [[ ! -L "$CANON/$input" && -f "$CANON/$input" && -r "$CANON/$input" ]] || fail "el insumo canónico '$CANON/$input' dejó de ser seguro."
    cp -- "$CANON/$input" "$destination/.ai/$input"
  done
  ln -s -- '.ai/KICKSTART.md' "$destination/AGENTS.md"
  write_readme "$model" "$destination"
}

rollback() {
  local model target
  local rollback_failed=false

  for model in "${MODELS[@]}"; do
    target="$ROOT/$model"
    if [[ "${INSTALLED[$model]:-}" == true && -d "$target" && ! -L "$target" ]]; then
      if ! mv -T -- "$target" "$STAGE/failed/$model"; then
        echo "ERROR: no se pudo apartar el reemplazo parcial '$model'." >&2
        rollback_failed=true
      fi
    fi
    if [[ "${HAD_ORIGINAL[$model]:-}" == true ]]; then
      if [[ -e "$target" || -L "$target" ]]; then
        echo "ERROR: no se pudo restaurar el directorio original '$model': el destino está ocupado; se conserva en '$STAGE/original/$model'." >&2
        rollback_failed=true
      elif ! mv -T -- "$STAGE/original/$model" "$target"; then
        echo "ERROR: no se pudo restaurar el directorio original '$model'." >&2
        rollback_failed=true
      fi
    fi
  done

  if [[ "$rollback_failed" == true ]]; then
    echo "ERROR: se conservó la preparación y los datos de recuperación en '$STAGE'." >&2
  else
    ROLLBACK_SUCCEEDED=true
  fi
}

cleanup() {
  local status=$?

  if [[ -n "$STAGE" ]]; then
    if [[ "$status" -eq 0 || "$REPLACEMENT_STARTED" == false || "$ROLLBACK_SUCCEEDED" == true ]]; then
      rm -rf -- "$STAGE"
    else
      echo "ERROR: se conservó el directorio de recuperación '$STAGE'." >&2
    fi
  fi
  exit "$status"
}

case "$#" in
  0)
    mode='reset'
    ;;
  1)
    case "$1" in
      --help)
        usage
        exit 0
        ;;
      --dry-run)
        mode='dry-run'
        ;;
      *)
        fail "argumento no admitido: '$1'. Use --help para consultar el uso."
        ;;
    esac
    ;;
  *)
    fail 'no se admiten argumentos múltiples ni backups heredados. Use --help para consultar el uso.'
    ;;
esac

validate_sources
validate_all_targets

if [[ "$mode" == 'dry-run' ]]; then
  echo 'Simulación: se validarían y recrearían estos destinos:'
  printf '  - %s/\n' "${MODELS[@]}"
  echo 'No se solicitará confirmación ni se modificarán datos.'
  exit 0
fi

echo 'Esta operación reemplazará TODOS los contenidos de los ocho directorios de modelos, incluidos archivos ocultos:'
printf '  - %s/\n' "${MODELS[@]}"
echo 'El .ai/ raíz y las rutas no relacionadas se preservarán.'
if ! IFS= read -r -p "¿Continuar? Escriba 'admin' para confirmar: " CONFIRM; then
  echo 'Cancelado: no se recibió confirmación.'
  exit 0
fi
if [[ "$CONFIRM" != 'admin' ]]; then
  echo 'Cancelado.'
  exit 0
fi

# La segunda prevalidación reduce la ventana entre la confirmación y la preparación.
validate_sources
validate_all_targets
STAGE="$(mktemp -d "$ROOT/.restore-stage.XXXXXX")"
trap cleanup EXIT
mkdir -p -- "$STAGE/prepared" "$STAGE/original" "$STAGE/failed"

for model in "${MODELS[@]}"; do
  prepare_model "$model"
done

# Se apartan los originales antes de instalar los reemplazos, para poder revertirlos.
for model in "${MODELS[@]}"; do
  target="$ROOT/$model"
  validate_target "$model"
  if [[ -e "$target" ]]; then
    REPLACEMENT_STARTED=true
    if ! mv -T -- "$target" "$STAGE/original/$model"; then
      rollback
      fail "no se pudo apartar el directorio existente '$model'."
    fi
    HAD_ORIGINAL[$model]=true
  fi
done

for model in "${MODELS[@]}"; do
  target="$ROOT/$model"
  [[ ! -L "$target" && ! -e "$target" ]] || {
    rollback
    fail "el destino '$model' cambió durante la preparación."
  }
  REPLACEMENT_STARTED=true
  if ! mv -T -- "$STAGE/prepared/$model" "$target"; then
    rollback
    fail "no se pudo instalar el directorio preparado '$model'."
  fi
  INSTALLED[$model]=true
done

rm -rf -- "$STAGE"
STAGE=''
echo 'Reinicio completo: los ocho directorios de modelos fueron preparados desde el canon actual.'
