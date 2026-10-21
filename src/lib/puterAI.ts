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

// Every model below is called through OpenRouter by the creative-router edge function.
export const PUTER_MODELS = [
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  { id: "moonshotai/kimi-k2", label: "Kimi K2" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];
