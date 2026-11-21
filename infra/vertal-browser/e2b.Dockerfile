# Template E2B "vertal-browser" (Vertal Navigator, fase 1).
#
# Chromium do Playwright (hoje um build "Chrome for Testing", que lê as políticas
# em /etc/opt/chrome_for_testing/policies; gravamos também nos caminhos do Chrome e
# do Chromium para quando o Playwright trocar o build) com CDP em 127.0.0.1:9222 + Xvfb + x11vnc + noVNC
# (websockify, porta 6080) para a tela ao vivo + Python com browser-use 0.13.14
# (MIT, ações estruturadas — o gate de pagamento depende disso) e Playwright.
# O navd (porta 8787) é o daemon que o Worker do vertal.dev controla.
# F5: também roda a coleta web com o Scrapling (POST /scrape; ver docs/VERTAL_SCRAPLING.md).
#
# Não use direto: build-template.mjs troca os marcadores __*_B64__ pelos
# arquivos desta pasta (o build self-hosted não aceita COPY sem túnel 5008).
# Este build não aplica ENV aos RUN; variáveis vão inline em cada RUN.
FROM python:3.12-slim-bookworm

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
  xvfb x11vnc novnc websockify procps ca-certificates curl sudo \
  fonts-liberation fonts-dejavu-core fonts-noto-color-emoji && \
  rm -rf /var/lib/apt/lists/*

RUN /usr/local/bin/pip install --no-cache-dir browser-use==0.13.14 playwright==1.65.2

# O node embutido no Playwright precisa da libatomic (não vem na imagem slim).
RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends libatomic1 && \
  rm -rf /var/lib/apt/lists/*

RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers DEBIAN_FRONTEND=noninteractive \
  /usr/local/bin/python -m playwright install --with-deps --no-shell chromium && \
  rm -rf /var/lib/apt/lists/* && \
  ln -sf "$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)" /usr/local/bin/vertal-chromium && \
  chmod -R a+rX /opt/pw-browsers && /usr/local/bin/vertal-chromium --version

# F5: Scrapling 0.5.1 (BSD-3-Clause, https://github.com/D4Vinci/Scrapling) com os fetchers
# (curl_cffi, playwright, patchright, browserforge, protego), usado como DEPENDÊNCIA (não
# vendorizado), num venv PRÓPRIO: os fetchers pedem anyio>=4.14 e o browser-use 0.13.14
# fixa anyio==4.12.1 (conflito no mesmo Python). O navd chama /opt/navigator/scraped.py
# com /opt/scrapling/bin/python. O modo stealth usa o MESMO Chromium do Playwright
# (executable_path): nenhum navegador extra é baixado (sem `scrapling install`).
# Camada depois do Chromium para não invalidar o cache das camadas pesadas.
RUN /usr/local/bin/python -m venv /opt/scrapling && \
  /opt/scrapling/bin/pip install --no-cache-dir "scrapling[fetchers]==0.5.1" && \
  /opt/scrapling/bin/python -c "import scrapling, protego; from scrapling.fetchers import AsyncFetcher, StealthyFetcher, AsyncRemoteSession; print('scrapling', scrapling.__version__)" && \
  chmod -R a+rX /opt/scrapling

RUN (id user >/dev/null 2>&1 || useradd --create-home --shell /bin/bash user) && \
  mkdir -p /opt/navigator /etc/chromium/policies/managed /etc/opt/chrome/policies/managed /etc/opt/chrome_for_testing/policies/managed /home/user/.vertal-profile && \
  echo '__NAVD_B64__' | base64 -d > /opt/navigator/navd.py && \
  echo '__START_B64__' | base64 -d > /opt/navigator/start.sh && \
  echo '__SCRAPED_B64__' | base64 -d > /opt/navigator/scraped.py && \
  echo '__POLICY_B64__' | base64 -d > /etc/chromium/policies/managed/vertal.json && \
  cp /etc/chromium/policies/managed/vertal.json /etc/opt/chrome/policies/managed/vertal.json && \
  cp /etc/chromium/policies/managed/vertal.json /etc/opt/chrome_for_testing/policies/managed/vertal.json && \
  chmod 755 /opt/navigator/start.sh && \
  chmod 644 /opt/navigator/navd.py /opt/navigator/scraped.py /etc/chromium/policies/managed/vertal.json /etc/opt/chrome/policies/managed/vertal.json \
    /etc/opt/chrome_for_testing/policies/managed/vertal.json && \
  chown -R user:user /home/user && /usr/local/bin/python3 -m py_compile /opt/navigator/navd.py && /opt/scrapling/bin/python -m py_compile /opt/navigator/scraped.py

USER user
WORKDIR /home/user
