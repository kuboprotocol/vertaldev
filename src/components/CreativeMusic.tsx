import React, { useState } from 'react';
import { useMusicGenerator } from '@/hooks/useMusicGenerator';
import { MUSIC_GENRES, MUSIC_MOODS, getMusicCost } from '@/config/musicPricing';
import { Download, Trash2, Loader, Play, Music } from 'lucide-react';
import './CreativeMusic.css';

interface CreativeMusicProps {
  creditsAvailable: number;
}

export function CreativeMusic({ creditsAvailable }: CreativeMusicProps) {
  const {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateMusic,
    updateTheme,
    deleteGallery,
    exportGallery,
    clearError,
    loadGallery,
    clearCurrentGallery,
    getMusicCost: getCost,
  } = useMusicGenerator(creditsAvailable);

  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<keyof typeof MUSIC_GENRES>('pop');
  const [mood, setMood] = useState<'happy' | 'sad' | 'energetic' | 'calm' | 'melancholic'>(
    'happy'
  );
  const [selectedTheme, setSelectedTheme] = useState<
    'modern' | 'retro' | 'minimalist' | 'vibrant' | 'dark'
  >('modern');

  const cost = getCost(1);
  const canGenerate = prompt.trim().length > 0 && cost <= creditsAvailable;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    try {
      await generateMusic(prompt, MUSIC_GENRES[genre].label, genre, mood);
      setPrompt('');
    } catch (err) {
      console.error('Erro ao gerar música:', err);
    }
  };

  const handleExport = (format: 'json' | 'html' | 'm3u') => {
    const data = exportGallery(format);
    if (!data) return;

    let filename = `musica-${Date.now()}`;
    let type = 'text/plain';

    if (format === 'json') {
      type = 'application/json';
      filename += '.json';
    } else if (format === 'html') {
      type = 'text/html';
      filename += '.html';
    } else if (format === 'm3u') {
      type = 'audio/x-mpegurl';
      filename += '.m3u';
    }

    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (currentGallery) {
    return (
      <div className="creative-music">
        <div className="music-editor">
          <div className="editor-header">
            <h2>🎵 Galeria de Músicas</h2>
            <button
              className="btn-back"
              onClick={clearCurrentGallery}
            >
              ← Voltar
            </button>
          </div>

          <div className="gallery-view">
            <div className="gallery-info">
              <h3>{currentGallery.title}</h3>
              <p className="gallery-description">{currentGallery.description}</p>
              <div className="gallery-meta">
                <span>🎵 {currentGallery.songs.length} música(s)</span>
                <span>💳 {currentGallery.creditsUsed} créditos usados</span>
              </div>
            </div>

            <div className="songs-container">
              {currentGallery.songs.map((song) => (
                <div key={song.id} className="song-item">
                  <div className="song-header">
                    <div className="song-title-info">
                      <h4>{song.title.substring(0, 40)}</h4>
                      <p className="song-genre">{song.genre} • {song.style}</p>
                    </div>
                    <button className="btn-play">
                      <Play size={16} /> Ouvir
                    </button>
                  </div>
                  <div className="song-meta">
                    <span>⏱️ {(song.duration / 60).toFixed(1)} min</span>
                    <span>😊 {song.mood}</span>
                    <span>📝 Letras incluídas</span>
                  </div>
                  {song.lyrics && (
                    <div className="song-lyrics-preview">
                      <p>{song.lyrics.substring(0, 150)}...</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="gallery-toolbar">
              <div className="toolbar-group">
                <label>Tema da Galeria:</label>
                <div className="theme-buttons">
                  {(['modern', 'retro', 'minimalist', 'vibrant', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      className={`theme-btn ${selectedTheme === t ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTheme(t);
                        updateTheme(t);
                      }}
                    >
                      {t === 'modern' && '🎨'}
                      {t === 'retro' && '📻'}
                      {t === 'minimalist' && '⚪'}
                      {t === 'vibrant' && '✨'}
                      {t === 'dark' && '🌙'}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="toolbar-group">
                <label>Exportar:</label>
                <div className="export-buttons">
                  <button className="btn-export" onClick={() => handleExport('json')}>
                    <Download size={16} /> JSON
                  </button>
                  <button className="btn-export" onClick={() => handleExport('html')}>
                    <Download size={16} /> HTML
                  </button>
                  <button className="btn-export" onClick={() => handleExport('m3u')}>
                    <Download size={16} /> M3U
                  </button>
                </div>
              </div>

              <div className="toolbar-group">
                <button
                  className="btn-delete"
                  onClick={() => {
                    deleteGallery(currentGallery.id);
                  }}
                >
                  <Trash2 size={16} /> Deletar Galeria
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="creative-music">
      <div className="generator-panel">
        <h2>🎵 Gerador de Músicas com IA</h2>

        {error && (
          <div className="error-box">
            <strong>❌ Erro:</strong> {error}
            <button className="btn-dismiss" onClick={clearError}>
              ✕
            </button>
          </div>
        )}

        <div className="form-group">
          <label>Descrição/Ideia da Música:</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Uma música alegre sobre amizade com influência de pop dos anos 80..."
            className="textarea-input"
            rows={3}
            disabled={isGenerating}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Gênero:</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as keyof typeof MUSIC_GENRES)}
              disabled={isGenerating}
            >
              {Object.entries(MUSIC_GENRES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Humor:</label>
            <select
              value={mood}
              onChange={(e) =>
                setMood(
                  e.target.value as 'happy' | 'sad' | 'energetic' | 'calm' | 'melancholic'
                )
              }
              disabled={isGenerating}
            >
              {Object.entries(MUSIC_MOODS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Custo:</label>
          <div className="cost-info">
            <div className="cost-badge">
              {cost > creditsAvailable ? (
                <>
                  ❌ Créditos insuficientes: {cost} necessários, {creditsAvailable} disponíveis
                </>
              ) : (
                <>
                  ✅ {cost} crédito(s) - R${(cost * 0.40).toFixed(2)}
                </>
              )}
            </div>
          </div>
        </div>

        <button
          className="btn-generate"
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader size={18} className="spinner" /> Gerando...
            </>
          ) : (
            '🎵 Gerar Música'
          )}
        </button>
      </div>

      {galleries.length > 0 && (
        <div className="recent-galleries">
          <h3>📚 Galerias Recentes</h3>
          <div className="galleries-list">
            {galleries.slice(0, 5).map((gallery) => (
              <div key={gallery.id} className="gallery-card" onClick={() => loadGallery(gallery.id)}>
                <div className="gallery-card-icon">🎵</div>
                <div className="gallery-card-info">
                  <h4>{gallery.title.substring(0, 30)}...</h4>
                  <p>
                    {gallery.songs.length} música{gallery.songs.length !== 1 ? 's' : ''} •{' '}
                    {gallery.creditsUsed} créditos
                  </p>
                  <button
                    className="btn-delete-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGallery(gallery.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
