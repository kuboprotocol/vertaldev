// Serviço de alarme com sons pré-definidos e galeria de áudios personalizados

export interface AlarmSound {
  id: string;
  name: string;
  category: 'preset' | 'custom';
  url?: string; // Para sons customizados da galeria
  duration?: number; // Em segundos
}

export interface ScheduledAlarm {
  id: string;
  time: string; // HH:mm format
  label?: string;
  sound: AlarmSound;
  enabled: boolean;
  repeatDays?: number[]; // 0=Sunday, 1=Monday, etc.
  createdAt: Date;
}

// 18 sons pré-definidos (padrão)
export const PRESET_SOUNDS: AlarmSound[] = [
  { id: 'alarm-1', name: '🔔 Clássico', category: 'preset', duration: 30 },
  { id: 'alarm-2', name: '📯 Trompete Suave', category: 'preset', duration: 25 },
  { id: 'alarm-3', name: '🔊 Sino Alto', category: 'preset', duration: 20 },
  { id: 'alarm-4', name: '🎵 Melodia Acordar', category: 'preset', duration: 35 },
  { id: 'alarm-5', name: '⏰ Tic Tac', category: 'preset', duration: 40 },
  { id: 'alarm-6', name: '🌅 Amanhecer Suave', category: 'preset', duration: 45 },
  { id: 'alarm-7', name: '🎶 Inspiração', category: 'preset', duration: 30 },
  { id: 'alarm-8', name: '⚡ Energético', category: 'preset', duration: 25 },
  { id: 'alarm-9', name: '🔥 Intenso', category: 'preset', duration: 20 },
  { id: 'alarm-10', name: '🌊 Ondas', category: 'preset', duration: 35 },
  { id: 'alarm-11', name: '🎺 Jazz Suave', category: 'preset', duration: 40 },
  { id: 'alarm-12', name: '🎸 Guitarra Acordar', category: 'preset', duration: 30 },
  { id: 'alarm-13', name: '🥁 Bateria Leve', category: 'preset', duration: 25 },
  { id: 'alarm-14', name: '🎹 Piano Delicado', category: 'preset', duration: 45 },
  { id: 'alarm-15', name: '🎼 Sinfonia Suave', category: 'preset', duration: 50 },
  { id: 'alarm-16', name: '📱 Notificação', category: 'preset', duration: 15 },
  { id: 'alarm-17', name: '🚨 Alerta', category: 'preset', duration: 20 },
  { id: 'alarm-18', name: '✨ Mágico', category: 'preset', duration: 30 },
];

// Sistema de alarme no cliente
export class AlarmManager {
  private alarms: Map<string, ScheduledAlarm> = new Map();
  private audioContext: AudioContext | null = null;

  constructor() {
    this.loadAlarms();
  }

  private loadAlarms(): void {
    try {
      const stored = localStorage.getItem('vertal_alarms');
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, alarm]: [string, any]) => {
          this.alarms.set(id, {
            ...alarm,
            createdAt: new Date(alarm.createdAt),
          });
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar alarmes:', e);
    }
  }

  private saveAlarms(): void {
    try {
      const data = Object.fromEntries(this.alarms);
      localStorage.setItem('vertal_alarms', JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao salvar alarmes:', e);
    }
  }

  scheduleAlarm(time: string, sound: AlarmSound, label?: string, repeatDays?: number[]): ScheduledAlarm {
    const alarm: ScheduledAlarm = {
      id: `alarm_${Date.now()}`,
      time,
      label,
      sound,
      enabled: true,
      repeatDays,
      createdAt: new Date(),
    };

    this.alarms.set(alarm.id, alarm);
    this.saveAlarms();
    this.setupAlarmTrigger(alarm);

    return alarm;
  }

  private setupAlarmTrigger(alarm: ScheduledAlarm): void {
    // Setup para verificar e disparar alarme na hora correta
    const checkAlarm = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentTime === alarm.time && alarm.enabled) {
        if (!alarm.repeatDays || alarm.repeatDays.includes(now.getDay())) {
          this.playAlarm(alarm);
        }
      }
    };

    // Verifica a cada minuto
    setInterval(checkAlarm, 60000);
  }

  async playAlarm(alarm: ScheduledAlarm): Promise<void> {
    try {
      // Aqui seria integrado com o sistema de áudio da galeria
      console.log(`🔔 Alarme disparado: ${alarm.label || alarm.sound.name}`);

      // Notificação ao usuário
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Alarme: ${alarm.label || alarm.sound.name}`, {
          icon: '🔔',
          badge: '⏰',
        });
      }
    } catch (e) {
      console.error('Erro ao disparar alarme:', e);
    }
  }

  deleteAlarm(id: string): void {
    this.alarms.delete(id);
    this.saveAlarms();
  }

  updateAlarm(id: string, updates: Partial<ScheduledAlarm>): void {
    const alarm = this.alarms.get(id);
    if (alarm) {
      this.alarms.set(id, { ...alarm, ...updates });
      this.saveAlarms();
    }
  }

  getAlarms(): ScheduledAlarm[] {
    return Array.from(this.alarms.values()).sort((a, b) => a.time.localeCompare(b.time));
  }

  // Integração com galeria de sons personalizados
  addCustomSound(sound: AlarmSound): void {
    if (sound.category === 'custom' && sound.url) {
      PRESET_SOUNDS.push(sound);
    }
  }
}

// Hook React para gerenciar alarmes
import { useState, useCallback, useEffect } from 'react';

export function useAlarmManager() {
  const [manager] = useState(() => new AlarmManager());
  const [alarms, setAlarms] = useState<ScheduledAlarm[]>([]);

  useEffect(() => {
    setAlarms(manager.getAlarms());
  }, [manager]);

  const scheduleAlarm = useCallback(
    (time: string, sound: AlarmSound, label?: string, repeatDays?: number[]) => {
      const alarm = manager.scheduleAlarm(time, sound, label, repeatDays);
      setAlarms(manager.getAlarms());
      return alarm;
    },
    [manager]
  );

  const deleteAlarm = useCallback(
    (id: string) => {
      manager.deleteAlarm(id);
      setAlarms(manager.getAlarms());
    },
    [manager]
  );

  const updateAlarm = useCallback(
    (id: string, updates: Partial<ScheduledAlarm>) => {
      manager.updateAlarm(id, updates);
      setAlarms(manager.getAlarms());
    },
    [manager]
  );

  return {
    alarms,
    scheduleAlarm,
    deleteAlarm,
    updateAlarm,
    presetSounds: PRESET_SOUNDS,
  };
}

import * as React from 'react';
