import { createElement, useEffect, type CSSProperties } from 'react';
import { defineVertalClock } from '@/embed/clock/element';

export interface VertalClockProps {
  lang?: 'pt' | 'en';
  tab?: 'clock' | 'alarm' | 'stopwatch' | 'timer';
  theme?: 'auto' | 'light' | 'dark';
  /** Dentro do app o toque aparece pelo ClockRinger (em qualquer tela), então fica desligado aqui. */
  ringUI?: 'on' | 'off';
  className?: string;
  style?: CSSProperties;
}

defineVertalClock();

/** O Vertal Clock dentro do app: o mesmo elemento <vertal-clock> do widget incorporável. */
export function VertalClock({ lang = 'pt', tab = 'clock', theme = 'dark', ringUI = 'off', className, style }: VertalClockProps) {
  useEffect(() => defineVertalClock(), []);
  return createElement('vertal-clock', { lang, tab, theme, 'ring-ui': ringUI, class: className, style });
}

export default VertalClock;
