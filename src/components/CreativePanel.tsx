import React, { useState } from 'react';
import { Sparkles, Zap, Image, Music, Code, Video, Pen } from 'lucide-react';
import ChatWidget from './ChatWidget';

interface CreativeItem {
  id: string;
  type: 'text' | 'image' | 'audio' | 'code' | 'video';
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export default function CreativePanel() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  const creativeItems: CreativeItem[] = [
    {
      id: 'writing',
      type: 'text',
      title: 'Escritor IA',
      description: 'Crie textos, artigos e conteúdo com IA',
      icon: <Pen className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'image',
      type: 'image',
      title: 'Gerador de Imagens',
      description: 'Crie imagens profissionais com IA',
      icon: <Image className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'audio',
      type: 'audio',
      title: 'Produtor de Áudio',
      description: 'Crie músicas e áudio com IA',
      icon: <Music className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
    },
    {
      id: 'code',
      type: 'code',
      title: 'Gerador de Código',
      description: 'Crie código profissional com IA',
      icon: <Code className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'video',
      type: 'video',
      title: 'Criador de Vídeos',
      description: 'Crie vídeos e animações com IA',
      icon: <Video className="w-6 h-6" />,
      color: 'from-indigo-500 to-blue-500',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Painel Criativo</h1>
                <p className="text-sm text-slate-400">Crie conteúdo incrível com IA</p>
              </div>
            </div>
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 transition-all"
            >
              <Zap className="w-4 h-4" />
              Chat IA
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Chat Widget */}
        {showChat && (
          <div className="mb-12">
            <ChatWidget onClose={() => setShowChat(false)} />
          </div>
        )}

        {/* Creative Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {creativeItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedType(item.id)}
              className="group relative overflow-hidden rounded-xl transition-all duration-300 hover:scale-105"
            >
              {/* Background Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-100 transition-opacity`} />

              {/* Card Content */}
              <div className="relative p-6 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 group-hover:border-slate-600 rounded-xl h-full flex flex-col items-center justify-center text-center">
                {/* Icon */}
                <div className={`p-3 rounded-lg bg-gradient-to-br ${item.color} mb-4 group-hover:scale-110 transition-transform`}>
                  <div className="text-white">{item.icon}</div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-white transition-colors">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  {item.description}
                </p>

                {/* Arrow */}
                <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Featured Section */}
        <div className="mt-16 relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-3xl" />
          <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 md:p-12">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold text-white mb-4">
                Crie Sem Limites
              </h2>
              <p className="text-slate-400 mb-6">
                Use nossa IA avançada para criar conteúdo profissional em segundos. Desde textos até vídeos, tudo em um único lugar.
              </p>
              <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/20 transition-all font-semibold">
                Começar Agora
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
