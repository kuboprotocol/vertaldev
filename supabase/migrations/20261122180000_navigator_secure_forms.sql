-- Vertal Navigator: formulários seguros (login/senha/2FA/telefone/conector inline no chat).
-- Só amplia os tipos aceitos em navigator_audit.kind. Nenhum valor é gravado: o detalhe
-- (host, nome do segredo) continua cifrado pelo Worker (navigatorAuditVault.ts).
-- Idempotente.
alter table public.navigator_audit drop constraint if exists navigator_audit_kind_check;
alter table public.navigator_audit add constraint navigator_audit_kind_check check (kind in (
  'session_start', 'session_end', 'task', 'secret_used', 'totp_used', 'code_entered',
  'approval_granted', 'approval_denied', 'auto_approved', 'takeover', 'release',
  'settings_changed', 'totp_consent',
  'login_entered', 'secret_saved', 'phone_entered', 'connector_chosen'
));
