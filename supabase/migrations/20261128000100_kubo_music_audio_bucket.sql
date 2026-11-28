-- Bucket público com os MP3 do próprio Kubo (masters do artista), para o player alternativo do
-- painel /recompensas (src/lib/kuboOwnAudio.ts, flag VITE_KUBO_OWN_AUDIO, desligada por padrão).
-- Arquivo: <track_id do Spotify>.mp3 (ex.: 21WDwktTTX1IYwsrnN7mk9.mp3).
-- Leitura pública pelo endpoint /storage/v1/object/public/...; envio só pelo painel/service role
-- (nenhuma policy de INSERT/UPDATE/DELETE para anon/authenticated).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kubo-music', 'kubo-music', true, 26214400, ARRAY['audio/mpeg', 'audio/mp4', 'audio/aac'])
ON CONFLICT (id) DO NOTHING;
