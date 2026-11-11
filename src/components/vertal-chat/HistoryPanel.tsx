// Histórico global de todos os artefatos criados em todas as conversas
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { conversationService } from '@/services/conversationService';
import { decodeMessage, KIND_LABEL, type Artifact, type ArtifactKind } from '@/lib/chatAgent/artifacts';
import { ArtifactCard } from './ArtifactViews';
import { Loader2, Search, Filter } from 'lucide-react';

interface ArtifactWithConversation extends Artifact {
  conversationId: string;
  conversationTitle: string;
  createdAt: string;
}

export function HistoryPanel() {
  const { user } = useAuth();
  const [artifacts, setArtifacts] = useState<ArtifactWithConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ArtifactKind | 'all'>('all');

  useEffect(() => {
    async function loadHistories() {
      if (!user?.id) return;
      try {
        setLoading(true);
        const conversations = await conversationService.listConversations(user.id, { archived: false, limit: 100, offset: 0 });
        const allArtifacts: ArtifactWithConversation[] = [];

        for (const conv of conversations) {
          const messages = await conversationService.loadConversation(conv.id);
          for (const msg of messages) {
            if (msg.role === 'assistant') {
              const { extras } = decodeMessage(msg.content);
              for (const artifact of extras.artifacts) {
                allArtifacts.push({
                  ...artifact,
                  conversationId: conv.id,
                  conversationTitle: conv.title,
                  createdAt: msg.created_at,
                });
              }
            }
          }
        }

        // Ordenar por data descrescente
        setArtifacts(allArtifacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (error) {
        console.error('Erro ao carregar histórico:', error);
      } finally {
        setLoading(false);
      }
    }

    loadHistories();
  }, [user?.id]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((a) => {
      const matchesType = selectedType === 'all' || a.kind === selectedType;
      const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [artifacts, selectedType, searchQuery]);

  const groupedArtifacts = useMemo(() => {
    const groups = new Map<string, ArtifactWithConversation[]>();
    for (const artifact of filteredArtifacts) {
      const date = new Date(artifact.createdAt);
      const key = date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(artifact);
    }
    return groups;
  }, [filteredArtifacts]);

  const artifactTypes = useMemo(() => {
    const types = new Set(artifacts.map((a) => a.kind));
    return Array.from(types).sort();
  }, [artifacts]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header com filtros */}
      <div className="border-b border-border/50 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar artefatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Filtros por tipo */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              selectedType === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'border border-border/60 text-foreground hover:border-primary/50'
            }`}
          >
            Tudo ({artifacts.length})
          </button>
          {artifactTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                selectedType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/60 text-foreground hover:border-primary/50'
              }`}
            >
              {KIND_LABEL[type]} ({artifacts.filter((a) => a.kind === type).length})
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <p>Nenhum artefato encontrado</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groupedArtifacts.entries()).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold text-muted-foreground mb-3 sticky top-0 bg-background py-2">
                  {date}
                </h3>
                <div className="space-y-2">
                  {items.map((artifact) => (
                    <div key={`${artifact.conversationId}-${artifact.id}`} className="space-y-1">
                      <ArtifactCard
                        artifact={artifact}
                        onOpen={() => {
                          // TODO: navegar para a conversa e abrir o artefato
                        }}
                      />
                      <p className="text-xs text-muted-foreground px-1">
                        em "{artifact.conversationTitle}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
