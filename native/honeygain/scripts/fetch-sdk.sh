#!/usr/bin/env bash
# Coloca os binários do Honeygain SDK no lugar certo SEM commitá-los.
#
# O Honeygain não publica o SDK em registro público: baixe no dashboard
# (https://sdk.honeygain.com/dashboard → seu app → Download SDK) e rode:
#
#   bash native/honeygain/scripts/fetch-sdk.sh electron ~/Downloads/honeygain-electron-sdk.tgz
#   bash native/honeygain/scripts/fetch-sdk.sh android  ~/Downloads/hgsdk.aar
#
# Alternativa para CI: defina HONEYGAIN_ELECTRON_SDK_URL / HONEYGAIN_ANDROID_SDK_URL com um link
# privado (ex.: bucket com URL assinada) e rode sem o 2º argumento.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
target="${1:-}"
src="${2:-}"

fetch() { # $1 = url, $2 = destino
  curl -fSL --retry 3 -o "$2" "$1"
}

case "$target" in
  electron)
    dest="$here/electron/vendor/honeygain-electron-sdk.tgz"
    mkdir -p "$(dirname "$dest")"
    if [[ -n "$src" ]]; then cp "$src" "$dest"
    elif [[ -n "${HONEYGAIN_ELECTRON_SDK_URL:-}" ]]; then fetch "$HONEYGAIN_ELECTRON_SDK_URL" "$dest"
    else echo "Informe o .tgz baixado do dashboard ou HONEYGAIN_ELECTRON_SDK_URL" >&2; exit 1; fi
    echo "OK: $dest  (depois: cd native/honeygain/electron && npm install ./vendor/honeygain-electron-sdk.tgz)"
    ;;
  android)
    dest="$here/android/app/libs/hgsdk.aar"
    mkdir -p "$(dirname "$dest")"
    if [[ -n "$src" ]]; then cp "$src" "$dest"
    elif [[ -n "${HONEYGAIN_ANDROID_SDK_URL:-}" ]]; then fetch "$HONEYGAIN_ANDROID_SDK_URL" "$dest"
    else echo "Informe o hgsdk.aar baixado do dashboard ou HONEYGAIN_ANDROID_SDK_URL" >&2; exit 1; fi
    echo "OK: $dest"
    ;;
  *)
    echo "uso: $0 electron|android [arquivo-baixado]" >&2
    exit 2
    ;;
esac
