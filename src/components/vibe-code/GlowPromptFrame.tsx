import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Moldura animada para campos de prompt do vibe code.
 * Implementação própria (inspirada no padrão de inputs de IA do 21st.dev,
 * sem copiar código de terceiros): um halo em gradiente que gira de leve
 * e fica mais intenso enquanto o agente está trabalhando.
 * Respeita prefers-reduced-motion (sem animação nesse caso).
 */
export function GlowPromptFrame({
  active = false,
  className,
  children,
}: {
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("relative rounded-xl p-[1px]", className)} data-active={active || undefined}>
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xl opacity-40 blur-[6px] transition-opacity duration-500",
          active && "opacity-90",
        )}
        style={{
          background:
            "conic-gradient(from 0deg, rgba(201,148,26,0.0), rgba(201,148,26,0.55), rgba(255,255,255,0.12), rgba(201,148,26,0.0))",
        }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={reduce ? undefined : { duration: active ? 3 : 8, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative rounded-xl bg-background">{children}</div>
    </div>
  );
}

export default GlowPromptFrame;
