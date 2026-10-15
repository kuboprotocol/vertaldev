/**
 * Creative Router Integration (v2)
 * Primary orchestrator for KUBO Vibe Creative Panel.
 */
import { supabase } from "@/integrations/supabase/client";

export const CREATIVE_ROUTER_FN = "creative-router";

export async function creativeInvoke(tool: string, payload: any) {
  const { data, error } = await supabase.functions.invoke(CREATIVE_ROUTER_FN, {
    body: { tool, ...payload }
  });
  if (error) throw error;
  return data;
}

export const PUTER_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (Premium)" },
];
