#!/bin/sh
# Start command do template vertal-browser: sobe a tela virtual (Xvfb) e o navd.
# Chromium, x11vnc e websockify só sobem no /init (com as senhas da sessão).
export DISPLAY=:99
if ! pgrep -x Xvfb >/dev/null; then
  Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
fi
if ! pgrep -f /opt/navigator/navd.py >/dev/null; then
  nohup /usr/local/bin/python3 /opt/navigator/navd.py >/tmp/navd.log 2>&1 &
fi
