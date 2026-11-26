-- Desativa o sistema de shortlinks (vídeos curtos com crédito diário) sem apagar nada.
-- O painel de recompensas mudou para /recompensas e mantém só vídeo premiado, Vertal Node,
-- TERRA ADS e saldo. Tabelas, funções e dados de shortlinks ficam intactos (reversível).

-- 1) Para o cron diário que creditava recompensas de shortlinks.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'calculate-shortlink-rewards-daily') then
    perform cron.unschedule('calculate-shortlink-rewards-daily');
  end if;
end
$$;

-- 2) Ninguém mais credita por shortlink: só o postgres executa a função de cálculo.
revoke execute on function public.calculate_shortlink_rewards(uuid, date) from public, anon, authenticated, service_role;

-- 3) Bloqueia criação/edição de shortlinks pelos clientes (leitura e dados continuam).
revoke insert, update on table public.shortlinks from anon, authenticated;

comment on table public.shortlinks is
  'DESATIVADO em 2026-11-26: sistema de shortlinks removido do painel de recompensas (/recompensas). Dados mantidos; sem criação nem recompensa.';
