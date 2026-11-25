#!/usr/bin/env bash
# Coloca os SDKs de compartilhamento de banda no lugar certo SEM commitá-los (destinos gitignored).
# Nenhum SDK aqui é público: cada um vem do portal do parceiro, logado na conta do Vertal.
#
#   bash native/node-sdks/scripts/fetch-sdk.sh honeygain electron ~/Downloads/honeygain-electron-sdk.tgz
#   bash native/node-sdks/scripts/fetch-sdk.sh honeygain android  ~/Downloads/hgsdk.aar
#   bash native/node-sdks/scripts/fetch-sdk.sh cashraven electron ~/Downloads/cr-sdk-electron.zip
#   bash native/node-sdks/scripts/fetch-sdk.sh cashraven android  [~/Downloads/cr-sdk-android.zip]
#
# Cash Raven Android vem do Maven deles (io.cashraven:cr-sdk:4.1.4) e não precisa de arquivo;
# o .zip só é usado para build offline (o .aar vai para app/libs/, gitignored).
#
# CI: em vez do arquivo, defina uma URL privada (bucket com URL assinada) por SDK:
#   HONEYGAIN_ELECTRON_SDK_URL, HONEYGAIN_ANDROID_SDK_URL,
#   CASHRAVEN_ELECTRON_SDK_URL, CASHRAVEN_ANDROID_SDK_URL
# Opcional: *_SHA256 para conferir o arquivo (Cash Raven 4.1.4 já tem o hash oficial como padrão).
#
# pawns | bright | infatica | earnfm: aguardando aprovação dos parceiros (stubs desligados).
# Este script nunca lê nem imprime API keys.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
provider="${1:-}"
platform="${2:-}"
src="${3:-}"

# Hashes oficiais publicados no portal Cash Raven (SDK 4.1.4).
CASHRAVEN_ELECTRON_SHA256_DEFAULT="96037001afd1599585e0cb3eef51fbef895c40597001e4104db26c223469f028"
CASHRAVEN_ANDROID_SHA256_DEFAULT="310347bce5015137dad8ae36662e9b97330d7162b3a608256dd5fa292a74ce73"

usage() {
  echo "uso: $0 honeygain|cashraven electron|android [arquivo-baixado]" >&2
  exit 2
}

# $1 = destino, $2 = nome da var com a URL; usa $src se informado.
obtain() {
  local dest="$1" url_var="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ -n "$src" ]]; then
    cp "$src" "$dest"
  elif [[ -n "${!url_var:-}" ]]; then
    curl -fsSL --retry 3 -o "$dest" "${!url_var}"
  else
    echo "Informe o arquivo baixado do portal do parceiro ou defina $url_var" >&2
    exit 1
  fi
}

# $1 = arquivo, $2 = hash esperado (vazio = não confere)
verify() {
  local file="$1" expected="${2:-}"
  [[ -z "$expected" ]] && return 0
  local got
  got="$(sha256sum "$file" | awk '{print $1}')"
  if [[ "$got" != "$expected" ]]; then
    echo "SHA-256 não confere para $(basename "$file") (esperado $expected, veio $got)." >&2
    echo "Se for outra versão do SDK, defina o *_SHA256 correspondente." >&2
    exit 1
  fi
}

case "$provider:$platform" in
  honeygain:electron)
    dest="$here/electron/vendor/honeygain-electron-sdk.tgz"
    obtain "$dest" HONEYGAIN_ELECTRON_SDK_URL
    verify "$dest" "${HONEYGAIN_ELECTRON_SHA256:-}"
    echo "OK: $dest  (depois: cd native/node-sdks/electron && npm install --no-save ./vendor/honeygain-electron-sdk.tgz)"
    ;;
  honeygain:android)
    dest="$here/android/app/libs/hgsdk.aar"
    obtain "$dest" HONEYGAIN_ANDROID_SDK_URL
    verify "$dest" "${HONEYGAIN_ANDROID_SHA256:-}"
    echo "OK: $dest  (build com -PNODE_SDK_PROVIDER=honeygain)"
    ;;
  cashraven:electron)
    zip="$here/electron/vendor/cr-sdk-electron.zip"
    obtain "$zip" CASHRAVEN_ELECTRON_SDK_URL
    verify "$zip" "${CASHRAVEN_ELECTRON_SHA256:-$CASHRAVEN_ELECTRON_SHA256_DEFAULT}"
    out="$here/electron/vendor/cashraven-electron"
    rm -rf "$out" && mkdir -p "$out"
    unzip -q "$zip" -d "$out"
    # Se o zip tiver uma pasta raiz única, sobe o conteúdo um nível.
    if [[ ! -f "$out/package.json" ]]; then
      inner="$(find "$out" -mindepth 2 -maxdepth 3 -name package.json -print -quit)"
      [[ -n "$inner" ]] && { tmp="$(mktemp -d)"; mv "$(dirname "$inner")"/* "$tmp"/; rm -rf "$out"; mv "$tmp" "$out"; }
    fi
    echo "OK: $out  (depois: cd native/node-sdks/electron && npm install --no-save ./vendor/cashraven-electron)"
    echo "Leia $out/AGENTS.md e confira as assinaturas usadas em adapters/cashraven.js."
    ;;
  cashraven:android)
    if [[ -z "$src" && -z "${CASHRAVEN_ANDROID_SDK_URL:-}" ]]; then
      echo "Cash Raven Android usa o Maven deles (io.cashraven:cr-sdk:4.1.4); nada a baixar."
      echo "Build: ./gradlew assembleCashravenRelease  (ou -PNODE_SDK_PROVIDER=cashraven)"
      exit 0
    fi
    zip="$here/android/app/libs/cr-sdk-android.zip"
    obtain "$zip" CASHRAVEN_ANDROID_SDK_URL
    verify "$zip" "${CASHRAVEN_ANDROID_SHA256:-$CASHRAVEN_ANDROID_SHA256_DEFAULT}"
    unzip -qo "$zip" '*.aar' -d "$here/android/app/libs/cashraven" || true
    echo "OK: $here/android/app/libs/cashraven (offline; build com -PCASHRAVEN_OFFLINE=1)"
    ;;
  pawns:*|bright:*|infatica:*|earnfm:*)
    echo "Provedor \"$provider\" ainda desativado (aguardando aprovação do parceiro). Ver docs/NODE-SDKS.md." >&2
    exit 1
    ;;
  *)
    usage
    ;;
esac
