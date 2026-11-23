-- Vertal Navigator: pagamentos (paywall/assinatura/checkout) com aprovação inline e o modo
-- "automatizar tudo" com teto. Padrão continua SEMPRE PERGUNTAR. Idempotente.
-- Depende de 20261122180000_navigator_secure_forms.sql.

-- 1) Novos tipos de auditoria (detalhe cifrado pelo Worker; nunca número de cartão).
alter table public.navigator_audit drop constraint if exists navigator_audit_kind_check;
alter table public.navigator_audit add constraint navigator_audit_kind_check check (kind in (
  'session_start', 'session_end', 'task', 'secret_used', 'totp_used', 'code_entered',
  'approval_granted', 'approval_denied', 'auto_approved', 'takeover', 'release',
  'settings_changed', 'totp_consent',
  'login_entered', 'secret_saved', 'phone_entered', 'connector_chosen',
  'payment', 'auto_action'
));

-- 2) Pré-aprovação nas configurações: teto por loja num período, lojas permitidas, assinatura recorrente.
alter table public.navigator_settings add column if not exists auto_approve_period_cents integer not null default 0;
alter table public.navigator_settings add column if not exists auto_approve_period_days integer not null default 30;
alter table public.navigator_settings add column if not exists auto_approve_merchants text[] not null default '{}';
alter table public.navigator_settings add column if not exists auto_approve_recurring boolean not null default false;
alter table public.navigator_settings drop constraint if exists navigator_settings_period_caps;
alter table public.navigator_settings add constraint navigator_settings_period_caps check (
  auto_approve_period_cents between 0 and 500000
  and auto_approve_period_days between 1 and 366
  and coalesce(array_length(auto_approve_merchants, 1), 0) <= 10
);

-- 3) "Automatizar tudo" desta sessão/tarefa (só com toque do usuário; tetos em centavos, sem dados sensíveis).
alter table public.navigator_sessions add column if not exists automation jsonb;
alter table public.navigator_sessions drop constraint if exists navigator_sessions_automation_size;
alter table public.navigator_sessions add constraint navigator_sessions_automation_size check (automation is null or pg_column_size(automation) <= 2048);
