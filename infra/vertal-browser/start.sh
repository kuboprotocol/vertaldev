#!/bin/sh
# Start command do template vertal-browser: sobe a tela virtual (Xvfb) e o navd.
# Chromium, x11vnc e websockify só sobem no /init (com as senhas da sessão).
export DISPLAY=:99
# Anti-telemetria (o navd.py também força estas variáveis antes de importar o browser-use).
export ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_VERSION_CHECK=false \
  BROWSER_USE_CLOUD_HINTS=false BROWSER_USE_CALCULATE_COST=false BROWSER_USE_LOGGING_LEVEL=warning DO_NOT_TRACK=1
# Áudio: PulseAudio com um sink nulo ("vertal"). O Chromium toca nele; o navd captura
# o monitor com ffmpeg e entrega ao Worker (GET /audio), que manda ao celular do usuário.
export XDG_RUNTIME_DIR=/tmp/vertal-xdg
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
if ! pgrep -x pulseaudio >/dev/null; then
  pulseaudio --daemonize=yes --exit-idle-time=-1 --disallow-exit -n \
    --load="module-native-protocol-unix" \
    --load="module-null-sink sink_name=vertal sink_properties=device.description=Vertal" >/dev/null 2>&1 || true
  pactl set-default-sink vertal >/dev/null 2>&1 || true
fi
if ! pgrep -x Xvfb >/dev/null; then
  Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
fi
if ! pgrep -f /opt/navigator/navd.py >/dev/null; then
  nohup /usr/local/bin/python3 /opt/navigator/navd.py >/tmp/navd.log 2>&1 &
fi
