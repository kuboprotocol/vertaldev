#!/bin/sh
# Start command do template vertal-browser: sobe a tela virtual (Xvfb) e o navd.
# Chromium, x11vnc e websockify só sobem no /init (com as senhas da sessão).
export DISPLAY=:99
# Anti-telemetria (o navd.py também força estas variáveis antes de importar o browser-use).
export ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_VERSION_CHECK=false \
  BROWSER_USE_CLOUD_HINTS=false BROWSER_USE_CALCULATE_COST=false BROWSER_USE_LOGGING_LEVEL=warning DO_NOT_TRACK=1
if ! pgrep -x Xvfb >/dev/null; then
  Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
fi
if ! pgrep -f /opt/navigator/navd.py >/dev/null; then
  nohup /usr/local/bin/python3 /opt/navigator/navd.py >/tmp/navd.log 2>&1 &
fi
