import { useState, useCallback } from 'react';
import { Clock, X, Play, Trash2 } from 'lucide-react';
import { useAlarmManager, PRESET_SOUNDS } from '@/lib/alarm/alarmService';

interface AlarmPanelProps {
  onSend: (time: string, soundId: string, label: string, repeatDays?: number[]) => void;
  onClose: () => void;
}

export function AlarmPanel({ onSend, onClose }: AlarmPanelProps) {
  const { alarms, scheduleAlarm, deleteAlarm, presetSounds } = useAlarmManager();
  const [time, setTime] = useState('07:00');
  const [selectedSoundId, setSelectedSoundId] = useState('alarm-1');
  const [label, setLabel] = useState('Meu Alarme');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [showCustomLabel, setShowCustomLabel] = useState(false);

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  const toggleRepeatDay = (day: number) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSchedule = useCallback(() => {
    if (time.trim()) {
      scheduleAlarm(time, presetSounds.find((s) => s.id === selectedSoundId) || presetSounds[0], label, repeatDays.length > 0 ? repeatDays : undefined);
      onSend(time, selectedSoundId, label, repeatDays.length > 0 ? repeatDays : undefined);
    }
  }, [time, selectedSoundId, label, repeatDays, scheduleAlarm, presetSounds, onSend]);

  const handlePlaySound = () => {
    const sound = presetSounds.find((s) => s.id === selectedSoundId);
    if (sound) {
      // Simular toque de som (em produção, seria reproduzido um áudio real)
      console.log(`🔔 Reproduzindo: ${sound.name}`);
    }
  };

  return (
    <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg border border-orange-200 p-6 shadow-lg">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-orange-600 p-3 rounded-full">
            <Clock className="text-white" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Agendar Alarme</h3>
            <p className="text-xs text-gray-600">Configure hora, som e repetição</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-full transition"
        >
          <X size={20} />
        </button>
      </div>

      {/* Seleção de Hora */}
      <div className="mb-6 p-4 bg-white rounded-lg border border-orange-300">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Horário do Alarme</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-lg font-bold focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* Seleção de Som */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Som do Alarme (18 opções)</label>
        <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-orange-300 p-3 space-y-2">
          {presetSounds.map((sound) => (
            <button
              key={sound.id}
              onClick={() => setSelectedSoundId(sound.id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between ${
                selectedSoundId === sound.id
                  ? 'bg-orange-500 text-white border border-orange-600'
                  : 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              <span className="text-sm font-medium">{sound.name}</span>
              {selectedSoundId === sound.id && (
                <span className="text-xs bg-orange-600 px-2 py-1 rounded">Selecionado</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handlePlaySound}
          className="mt-3 w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm font-semibold"
        >
          <Play size={16} /> Ouvir Som
        </button>
      </div>

      {/* Rótulo Personalizado */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Descrição do Alarme</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: Despertar, Reunião, Treino"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* Repetição */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Repetir nos dias</label>
        <div className="flex gap-2 flex-wrap">
          {daysOfWeek.map((day, index) => (
            <button
              key={index}
              onClick={() => toggleRepeatDay(index)}
              className={`px-3 py-2 rounded-lg font-semibold text-sm transition ${
                repeatDays.includes(index)
                  ? 'bg-orange-500 text-white border border-orange-600'
                  : 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {repeatDays.length > 0
            ? `Repetir: ${daysOfWeek.filter((_, i) => repeatDays.includes(i)).join(', ')}`
            : 'Sem repetição (apenas uma vez)'}
        </p>
      </div>

      {/* Resumo */}
      <div className="mb-6 p-4 bg-orange-100 rounded-lg border border-orange-300">
        <p className="text-sm text-orange-900">
          <strong>⏰ Resumo:</strong> Alarme agendado para <strong>{time}</strong> ({label}) •{' '}
          {presetSounds.find((s) => s.id === selectedSoundId)?.name || 'Som padrão'}
          {repeatDays.length > 0 && ` • Repetir: ${daysOfWeek.filter((_, i) => repeatDays.includes(i)).join(', ')}`}
        </p>
      </div>

      {/* Botão Agendar */}
      <div className="flex gap-3">
        <button
          onClick={handleSchedule}
          className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
        >
          <Clock size={20} /> Agendar Alarme
        </button>
      </div>

      {/* Lista de Alarmes Agendados */}
      {alarms.length > 0 && (
        <div className="mt-6 pt-6 border-t border-orange-300">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Alarmes Agendados</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-orange-200"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{alarm.time}</p>
                  <p className="text-xs text-gray-600">{alarm.label || 'Alarme'}</p>
                </div>
                <button
                  onClick={() => deleteAlarm(alarm.id)}
                  className="p-2 hover:bg-red-100 rounded-lg transition text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-orange-100 rounded-lg border border-orange-200">
        <p className="text-xs text-orange-900">
          💡 <strong>Dica:</strong> Alarmes são salvos no seu navegador. Escolha entre 18 sons pré-definidos ou adicione seus próprios sons da galeria.
        </p>
      </div>
    </div>
  );
}
