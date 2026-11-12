import { useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, Send, Copy, Edit2, X } from 'lucide-react';
import { useVoiceRecording } from '@/lib/voice/voiceService';

interface VoicePanelProps {
  onSend: (transcript: string) => void;
  onClose: () => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
}

export function VoicePanel({ onSend, onClose, language = 'pt-BR', onLanguageChange }: VoicePanelProps) {
  const { state, startRecording, stopRecording, setLanguage, isSupported } = useVoiceRecording();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  useEffect(() => {
    if (state.transcript && !isEditing) {
      setEditedText(state.transcript);
    }
  }, [state.transcript, isEditing]);

  const handleStart = useCallback(() => {
    setLanguage(language);
    startRecording();
  }, [startRecording, setLanguage, language]);

  const handleStop = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    if (onLanguageChange) onLanguageChange(newLang);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedText || state.transcript);
  };

  const handleSend = () => {
    const textToSend = editedText || state.transcript;
    if (textToSend.trim()) {
      onSend(textToSend);
    }
  };

  if (!isSupported) {
    return (
      <div className="p-6 bg-red-50 rounded-lg border border-red-200">
        <div className="text-red-800 font-semibold mb-2">🎤 Web Speech API não suportada</div>
        <p className="text-red-700 text-sm">Seu navegador não suporta gravação de voz. Use Chrome, Edge ou Safari.</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-200 p-6 shadow-lg">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-3 rounded-full">
            <Mic className="text-white" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Gravação de Voz</h3>
            <p className="text-xs text-gray-600">Fale para transcrever automaticamente</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-full transition"
        >
          <X size={20} />
        </button>
      </div>

      {/* Seletor de Idioma */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-2">Idioma</label>
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
          disabled={state.isRecording}
        >
          <option value="pt-BR">🇧🇷 Português (Brasil)</option>
          <option value="en-US">🇺🇸 English (US)</option>
          <option value="es-ES">🇪🇸 Español</option>
          <option value="fr-FR">🇫🇷 Français</option>
        </select>
      </div>

      {/* Status de Gravação */}
      <div className="mb-6 p-4 bg-white rounded-lg border-2 border-dashed border-blue-300">
        {state.isRecording && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1">
              <div className="w-1 h-8 bg-red-500 rounded animate-pulse"></div>
              <div className="w-1 h-8 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-1 h-8 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-1 h-8 bg-red-500 rounded animate-pulse" style={{ animationDelay: '0.3s' }}></div>
            </div>
            <span className="text-red-600 font-semibold">Gravando... {state.duration}s</span>
          </div>
        )}

        {/* Transcrição */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">Transcrição</label>
            {state.transcript && (
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 hover:bg-gray-100 rounded transition flex items-center gap-1"
                  title="Copiar"
                >
                  <Copy size={14} /> Copiar
                </button>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs px-2 py-1 hover:bg-gray-100 rounded transition flex items-center gap-1"
                  disabled={state.isRecording}
                >
                  <Edit2 size={14} /> {isEditing ? 'Concluído' : 'Editar'}
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-blue-500 resize-none"
              rows={4}
            />
          ) : (
            <div className="min-h-20 p-3 bg-white rounded-lg border border-gray-300">
              {state.transcript || state.interimTranscript ? (
                <div>
                  <p className="text-gray-900">{state.transcript}</p>
                  {state.interimTranscript && (
                    <p className="text-gray-400 italic">{state.interimTranscript}</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">Sua transcrição aparecerá aqui...</p>
              )}
            </div>
          )}

          {state.confidence > 0 && (
            <div className="text-xs text-gray-600 flex items-center gap-2">
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${state.confidence * 100}%` }}
                />
              </div>
              Confiança: {Math.round(state.confidence * 100)}%
            </div>
          )}
        </div>
      </div>

      {/* Botões de Controle */}
      <div className="flex gap-3">
        <button
          onClick={state.isRecording ? handleStop : handleStart}
          className={`flex-1 px-4 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 text-white ${
            state.isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {state.isRecording ? (
            <>
              <MicOff size={20} /> Parar Gravação
            </>
          ) : (
            <>
              <Mic size={20} /> Começar Gravação
            </>
          )}
        </button>

        {state.transcript && !state.isRecording && (
          <button
            onClick={handleSend}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
          >
            <Send size={20} /> Enviar para Chat
          </button>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-900">
          💡 <strong>Dica:</strong> Sua voz é processada localmente no navegador. Clique em "Enviar para Chat" quando terminar.
        </p>
      </div>
    </div>
  );
}
