#!/usr/bin/env bash
# Refresh published Magento static copies of Kkkonrad_Fastcheckout frontend assets.
# Prevents the storefront from serving stale pub/static assets after module web/ changes.
#
# Usage (from Magento root or module root):
#   app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
#   ./bin/sync-frontend-static.sh   # when cwd is the module
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_SRC="${MODULE_DIR}/view/frontend/web"

if [[ ! -d "${WEB_SRC}" ]]; then
  echo "ERROR: missing ${WEB_SRC}" >&2
  exit 1
fi

# Magento root: walk up until pub/static exists, or use MAGENTO_ROOT.
MAGENTO_ROOT="${MAGENTO_ROOT:-}"
if [[ -z "${MAGENTO_ROOT}" ]]; then
  probe="${MODULE_DIR}"
  for _ in 1 2 3 4 5 6 7 8; do
    if [[ -d "${probe}/pub/static/frontend" ]]; then
      MAGENTO_ROOT="${probe}"
      break
    fi
    probe="$(dirname "${probe}")"
  done
fi

if [[ -z "${MAGENTO_ROOT}" || ! -d "${MAGENTO_ROOT}/pub/static/frontend" ]]; then
  echo "ERROR: cannot locate Magento pub/static/frontend (set MAGENTO_ROOT)" >&2
  exit 1
fi

if [[ -f "${MAGENTO_ROOT}/pub/static/frontend/sri-hashes.json" ]]; then
  echo "ERROR: Magento Subresource Integrity is active; direct asset sync would invalidate SRI hashes." >&2
  echo "       Clean only existing pub/static/.../Kkkonrad_Fastcheckout targets, then run" >&2
  echo "       bin/magento setup:static-content:deploy -f for the required locales." >&2
  exit 1
fi

SYNCED=0
while IFS= read -r -d '' dest; do
  mkdir -p "${dest}/js" "${dest}/css" "${dest}/template" 2>/dev/null || true
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${WEB_SRC}/js/" "${dest}/js/"
    [[ -d "${WEB_SRC}/css" ]] && rsync -a --delete "${WEB_SRC}/css/" "${dest}/css/" || true
    [[ -d "${WEB_SRC}/template" ]] && rsync -a --delete "${WEB_SRC}/template/" "${dest}/template/" || true
  else
    cp -a "${WEB_SRC}/js/." "${dest}/js/"
    [[ -d "${WEB_SRC}/css" ]] && cp -a "${WEB_SRC}/css/." "${dest}/css/" || true
    [[ -d "${WEB_SRC}/template" ]] && cp -a "${WEB_SRC}/template/." "${dest}/template/" || true
  fi
  echo "synced ${dest}"
  SYNCED=$((SYNCED + 1))
done < <(find "${MAGENTO_ROOT}/pub/static/frontend" -type d -path '*/Kkkonrad_Fastcheckout' -print0 2>/dev/null)

if [[ "${SYNCED}" -eq 0 ]]; then
  echo "WARN: no pub/static/.../Kkkonrad_Fastcheckout trees found; nothing to sync."
  echo "       Run static-content:deploy first, or load the storefront once in developer mode."
  exit 0
fi

# Magento uses this value verbatim in asset URLs; intentionally omit a newline.
printf '%s' "$(date +%s)" > "${MAGENTO_ROOT}/pub/static/deployed_version.txt"

echo "OK: synced ${SYNCED} Kkkonrad_Fastcheckout static tree(s)."
