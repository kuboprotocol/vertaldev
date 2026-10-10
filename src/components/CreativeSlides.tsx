/**
 * Creative Slides Generator Component
 * Full-featured slide presentation creator with IA generation
 */

import React, { useState } from 'react';
import { Play, Plus, Download, Trash2, Sparkles, ChevronDown } from 'lucide-react';
import { useSlidesGenerator } from '@/hooks/useSlidesGenerator';
import { SlidesEditor } from './SlidesEditor';
import './CreativeSlides.css';

interface Props {
  creditsAvailable: number;
}

export function CreativeSlides({ creditsAvailable }: Props) {
  const slides = useSlidesGenerator(creditsAvailable);
  const [numSlides, setNumSlides] = useState(5);
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<'professional' | 'creative' | 'casual' | 'academic'>('professional');
  const [theme, setTheme] = useState<'modern' | 'minimal' | 'dark' | 'corporate' | 'creative'>('modern');
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      slides.clearError();
      return;
    }

    try {
      await slides.generatePresentation({
        topic,
        numSlides,
        tone,
        theme,
      });
    } catch (error) {
      console.error('Generation failed:', error);
    }
  };

  const handleExport = (format: 'html' | 'json') => {
    try {
      const content = slides.exportPresentation(format);
      const fileName = `presentation_${Date.now()}.${format === 'html' ? 'html' : 'json'}`;
      const blob = new Blob([content], { type: format === 'html' ? 'text/html' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export presentation');
    }
  };

  const cost = slides.getSlidesCost(numSlides);
  const canGenerate = cost <= creditsAvailable && topic.trim() !== '';

  return (
    <div className="creative-slides-container">
      {!slides.currentPresentation ? (
        // Generator Panel
        <div className="slides-generator-panel">
          <div className="generator-header">
            <div className="generator-icon">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2>Gerador de Apresentações IA</h2>
              <p>Crie slides profissionais em segundos</p>
            </div>
          </div>

          <div className="generator-form">
            {/* Topic Input */}
            <div className="form-group">
              <label>Tema da Apresentação</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex: Inteligência Artificial, Marketing Digital..."
                className="form-input"
              />
            </div>

            {/* Slides Count */}
            <div className="form-group">
              <label>Número de Slides</label>
              <div className="slides-input-group">
                <input
                  type="number"
                  min="3"
                  max="20"
                  value={numSlides}
                  onChange={(e) => setNumSlides(Math.max(3, Math.min(20, parseInt(e.target.value) || 5)))}
                  className="form-input"
                />
                <span className="cost-badge">
                  💳 {cost} crédito{cost > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Tone Selection */}
            <div className="form-group">
              <label>Tom da Apresentação</label>
              <div className="tone-options">
                {(['professional', 'creative', 'casual', 'academic'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`tone-btn ${tone === t ? 'active' : ''}`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selection */}
            <div className="form-group">
              <label>Tema Visual</label>
              <div className="theme-options">
                {(['modern', 'minimal', 'dark', 'corporate', 'creative'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`theme-btn theme-${t} ${theme === t ? 'active' : ''}`}
                    title={t.charAt(0).toUpperCase() + t.slice(1)}
                  />
                ))}
              </div>
            </div>

            {/* Error Message */}
            {slides.error && (
              <div className="error-box">
                <p>{slides.error}</p>
                <button onClick={slides.clearError} className="error-dismiss">
                  ✕
                </button>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={slides.isGenerating || !canGenerate}
              className={`btn-generate ${slides.isGenerating ? 'loading' : ''}`}
            >
              {slides.isGenerating ? (
                <>
                  <span className="spinner" />
                  Gerando apresentação...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Gerar Apresentação
                </>
              )}
            </button>

            {!canGenerate && topic.trim() && (
              <p className="warning-text">
                {cost > creditsAvailable
                  ? `❌ Créditos insuficientes. Precisa de ${cost}, tem ${creditsAvailable}`
                  : ''}
              </p>
            )}
          </div>

          {/* Recent Presentations */}
          {slides.presentations.length > 0 && (
            <div className="recent-presentations">
              <h3>Apresentações Recentes</h3>
              <div className="presentations-grid">
                {slides.presentations.slice(0, 3).map(pres => (
                  <div key={pres.id} className="presentation-card">
                    <div className="card-title">{pres.title}</div>
                    <div className="card-meta">
                      {pres.slides.length} slides • {new Date(pres.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="card-actions">
                      <button
                        onClick={() => slides.loadPresentation(pres.id)}
                        className="btn-small btn-primary"
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => slides.deletePresentation(pres.id)}
                        className="btn-small btn-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Editor Panel
        <>
          <div className="slides-toolbar">
            <div className="toolbar-left">
              <button
                onClick={() => slides.currentPresentation && (slides.currentPresentation = null)}
                className="btn-back"
              >
                ← Voltar
              </button>
              <h3>{slides.currentPresentation.title}</h3>
              <span className="slides-count">{slides.currentPresentation.slides.length} slides</span>
            </div>

            <div className="toolbar-right">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="btn-preview"
              >
                <Play className="w-4 h-4" />
                {showPreview ? 'Editar' : 'Visualizar'}
              </button>

              <div className="export-menu">
                <button className="btn-export">
                  <Download className="w-4 h-4" />
                  Exportar <ChevronDown className="w-4 h-4" />
                </button>
                <div className="export-options">
                  <button onClick={() => handleExport('html')}>HTML</button>
                  <button onClick={() => handleExport('json')}>JSON</button>
                </div>
              </div>
            </div>
          </div>

          {showPreview ? (
            <div className="slides-preview">
              <div className="preview-controls">
                <button className="btn-small">← Anterior</button>
                <span>Slide 1 de {slides.currentPresentation.slides.length}</span>
                <button className="btn-small">Próximo →</button>
              </div>
              <div className="preview-slide">
                {slides.currentPresentation.slides[0] && (
                  <div className={`slide-content theme-${slides.currentPresentation.theme}`}>
                    <h1>{slides.currentPresentation.slides[0].title}</h1>
                    <p>{slides.currentPresentation.slides[0].content}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <SlidesEditor
              presentation={slides.currentPresentation}
              onAddSlide={(type) => slides.addSlide(type)}
              onUpdateSlide={(slideId, updates) => slides.updateSlide(slideId, updates)}
              onDeleteSlide={(slideId) => slides.deleteSlide(slideId)}
              onReorderSlides={(from, to) => slides.reorderSlides(from, to)}
              onThemeChange={(theme) => {
                slides.updateTheme(theme);
                setTheme(theme);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
