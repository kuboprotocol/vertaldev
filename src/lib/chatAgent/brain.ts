// "Cérebro" do Vertal Chat (busca na web, memória e modo plano), parte pura.
// A fonte única fica nas edge functions; aqui só re-exporta para o navegador e o Vitest.
export * from '../../../supabase/functions/_shared/chatWeb';
export * from '../../../supabase/functions/_shared/chatMemory';
export * from '../../../supabase/functions/_shared/chatPlan';
