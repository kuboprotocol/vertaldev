-- Vertal Chat · Agendador: ajuste "Idioma" (aditivo).
-- 'auto' (padrão) = idioma da mensagem com que a tarefa foi pedida → navegador → perfil → pt-BR.
alter table public.chat_scheduler_settings add column if not exists lang text not null default 'auto';
