import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isWelcomeV2FrontEnabled, markWelcomeRequested, shouldRequestWelcome } from '@/lib/vertalWelcome/trigger';

/**
 * Boas-vindas v2: pede o e-mail ao servidor depois da confirmação do e-mail / 1º login.
 * Não desenha nada. Com VITE_VERTAL_WELCOME_EMAIL_V2 desligado (padrão) não faz nada.
 */
export function WelcomeEmailTrigger({ enabled = isWelcomeV2FrontEnabled() }: { enabled?: boolean }) {
  const { user } = useAuth();
  useEffect(() => {
    if (!enabled || !user) return;
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const now = Date.now();
    if (!shouldRequestWelcome(user, now, storage)) return;
    markWelcomeRequested(user.id, storage, now);
    supabase.functions.invoke('send-welcome-email', { body: { userId: user.id, trigger: 'session' } }).catch(() => {});
  }, [enabled, user]);
  return null;
}

export default WelcomeEmailTrigger;
