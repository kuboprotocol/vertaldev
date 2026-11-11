import React, { useEffect, useRef } from 'react';
import { VertalClockElement, defineVertalClock } from '@/embed/clock/element';

export interface VertalClockProps {
  lang?: 'pt' | 'en';
  tab?: 'relógio' | 'alarme' | 'cronômetro' | 'timer';
  theme?: 'auto' | 'light' | 'dark';
  ringUI?: 'on' | 'off';
  className?: string;
}

export const VertalClock = React.forwardRef<VertalClockElement, VertalClockProps>(
  ({ lang = 'pt', tab = 'relógio', theme = 'auto', ringUI = 'on', className }, ref) => {
    const localRef = useRef<VertalClockElement>(null);

    useEffect(() => {
      defineVertalClock();
    }, []);

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a' }}>
        <vertal-clock
          ref={ref || localRef}
          lang={lang}
          tab={tab}
          theme={theme}
          ring-ui={ringUI}
          className={className}
          style={{ width: '100%', height: '100%', display: 'block', flex: 1, minHeight: 0 }}
        />
      </div>
    );
  }
);

VertalClock.displayName = 'VertalClock';
