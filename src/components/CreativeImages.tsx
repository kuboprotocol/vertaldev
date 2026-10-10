import React, { useState } from 'react';
import { useImageGenerator } from '@/hooks/useImageGenerator';
import { IMAGE_STYLES, IMAGE_DIMENSIONS, getCostMessage } from '@/config/imagePricing';
import { Download, Trash2, Loader } from 'lucide-react';
import './CreativeImages.css';

interface CreativeImagesProps {
  creditsAvailable: number;
}

export function CreativeImages({ creditsAvailable }: CreativeImagesProps) {
  const {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateImages,
    updateTheme,
    deleteGallery,
    exportGallery,
    clearError,
    loadGallery,
    getImagesCost,
  } = useImageGenerator(creditsAvailable);

  const [prompt, setPrompt] = useState('');
  const [imageCount, setImageCount] = useState(1);
  const [style, setStyle] = useState<'photorealistic' | 'artistic' | 'cartoon' | 'abstract' | 'minimalist'>(
    'photorealistic'
  );
  const [dimension, setDimension] = useState('square');
  const [selectedTheme, setSelectedTheme] = useState<'modern' | 'minimal' | 'dark' | 'corporate' | 'creative'>(
    'modern'
  );

  const cost = getImagesCost(imageCount);
  const canGenerate = prompt.trim().length > 0 && cost <= creditsAvailable;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    try {
      const enhancedPrompt = `${prompt}, ${IMAGE_STYLES[style].prompt}`;
      await generateImages(enhancedPrompt, imageCount);
    } catch (err) {
      console.error('Erro ao gerar imagens:', err);
    }
  };

  const handleExport = (format: 'json' | 'html') => {
    const data = exportGallery(format);
    if (!data) return;

    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `galeria-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (currentGallery) {
    return (
      <div className="creative-images">
        <div className="images-editor">
          <div className="editor-header">
            <h2>📸 Galeria de Imagens</h2>
            <button
              className="btn-back"
              onClick={() => {
                setPrompt('');
                setImageCount(1);
              }}
            >
              ← Voltar
            </button>
          </div>

          <div className="gallery-view">
            <div className="gallery-info">
              <h3>{currentGallery.title}</h3>
              <p className="gallery-description">{currentGallery.description}</p>
              <div className="gallery-meta">
                <span>📊 {currentGallery.images.length} imagem(ns)</span>
                <span>💳 {currentGallery.creditsUsed} créditos usados</span>
              </div>
            </div>

            <div className="images-grid">
              {currentGallery.images.map((image) => (
                <div key={image.id} className="image-item">
                  <img src={image.url} alt={image.prompt} />
                  <p className="image-prompt">{image.prompt}</p>
                </div>
              ))}
            </div>

            <div className="gallery-toolbar">
              <div className="toolbar-group">
                <label>Tema da Galeria:</label>
                <div className="theme-buttons">
                  {(['modern', 'minimal', 'dark', 'corporate', 'creative'] as const).map((t) => (
                    <button
                      key={t}
                      className={`theme-btn ${selectedTheme === t ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTheme(t);
                        updateTheme(t);
                      }}
                    >
                      {t === 'modern' && '🎨'}
                      {t === 'minimal' && '⚪'}
                      {t === 'dark' && '🌙'}
                      {t === 'corporate' && '💼'}
                      {t === 'creative' && '✨'}
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
    <div className="creative-images">
      <div className="generator-panel">
        <h2>🎨 Gerador de Imagens com IA</h2>

        {error && (
          <div className="error-box">
            <strong>❌ Erro:</strong> {error}
            <button className="btn-dismiss" onClick={clearError}>
              ✕
            </button>
          </div>
        )}

        <div className="form-group">
          <label>Descrição da Imagem:</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Um elefante em uma savana ao pôr do sol..."
            className="textarea-input"
            rows={3}
            disabled={isGenerating}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Número de Imagens:</label>
            <input
              type="number"
              min="1"
              max="4"
              value={imageCount}
              onChange={(e) => setImageCount(parseInt(e.target.value) || 1)}
              disabled={isGenerating}
            />
          </div>

          <div className="form-group">
            <label>Dimensões:</label>
            <select value={dimension} onChange={(e) => setDimension(e.target.value)} disabled={isGenerating}>
              {Object.entries(IMAGE_DIMENSIONS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Estilo Artístico:</label>
          <div className="style-buttons">
            {Object.entries(IMAGE_STYLES).map(([key, { name }]) => (
              <button
                key={key}
                className={`style-btn ${style === key ? 'active' : ''}`}
                onClick={() => setStyle(key as typeof style)}
                disabled={isGenerating}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Custo:</label>
          <div className="cost-badge">{getCostMessage(imageCount, creditsAvailable)}</div>
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
            '✨ Gerar Imagens'
          )}
        </button>
      </div>

      {galleries.length > 0 && (
        <div className="recent-galleries">
          <h3>📚 Galerias Recentes</h3>
          <div className="galleries-list">
            {galleries.slice(0, 5).map((gallery) => (
              <div key={gallery.id} className="gallery-card" onClick={() => loadGallery(gallery.id)}>
                <div className="gallery-card-preview">
                  {gallery.images.length > 0 && <img src={gallery.images[0]?.url} alt={gallery.title} />}
                </div>
                <div className="gallery-card-info">
                  <h4>{gallery.title.substring(0, 30)}...</h4>
                  <p>
                    {gallery.images.length} imagem{gallery.images.length !== 1 ? 's' : ''} • {gallery.creditsUsed}{' '}
                    créditos
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
