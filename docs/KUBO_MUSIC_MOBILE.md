# Músicas do Kubo no celular (/recompensas)

## O que acontece no Android/iPhone
- O embed do Spotify só toca com som depois de um toque **dentro** do player (a página nunca chama `play()` no celular).
- Sem login no Spotify **naquele navegador** (o normal no celular: a pessoa usa o app), o embed toca uma **prévia** de ~15 s
  (medido em 27/11/2026: `playback_update.duration` 15–29 s nas 5 faixas). No fim da prévia o embed fica parado em
  `position == duration` com `isPaused: false`.
- Antes desta correção o servidor exigia 28 s por faixa, então no celular nenhuma faixa contava, e o painel não passava
  para a próxima faixa no fim da prévia.

## Correção
- Cliente manda `preview_seconds` no `music-report`; o servidor conta a faixa com a prévia inteira menos 2 s
  (mínimo 12 s), sempre limitado pelo relógio desde o `music-start` (`musicThresholdSeconds`).
- Fim da faixa detectado pela posição; aviso de prévia, de player travado e de navegador dentro de app.
- Diagnóstico: `node scripts/diagnostics/spotify-embed-mobile.mjs`.

## Player com os MP3 do próprio Kubo (opcional, desligado)
1. Subir os 5 masters no Supabase Storage, bucket público `kubo-music` (migração `20261128000100`), com o nome
   `<track_id>.mp3`:
   - `21WDwktTTX1IYwsrnN7mk9.mp3` Milagre em Códgo
   - `02ph1xmr2fPzONA7uXS6I7.mp3` Kubo é Vida
   - `0ksUwTc8HCB7KbJ0yHEPvx.mp3` Vibe Elevvada
   - `5o4iRiBgxjFTyIeYbctSq3.mp3` Deus no Comando
   - `3ArhPi46d9w8jR6jobBL6y.mp3` Vibe que não para
2. Definir `VITE_KUBO_OWN_AUDIO=mobile` (só celular) ou `all` no build da Cloudflare e publicar.
3. Se um arquivo faltar, o painel volta sozinho para o Spotify. Nunca usar URLs de prévia do Spotify (p.scdn.co).
