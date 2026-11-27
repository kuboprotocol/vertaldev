-- VERTAL · e-mail de boas-vindas v2 — SQL PROPOSTO, NÃO APLICADO.
-- Opcional: só acelera a checagem de dedupe ("já recebeu boas-vindas?") no email_send_log.
-- O recurso funciona sem isto. Aplicar só com o OK do Laércio, de forma deliberada (o deploy não roda migrações).
create index concurrently if not exists email_send_log_welcome_dedupe_idx
  on public.email_send_log (recipient_email, template_name)
  where status = 'sent';
