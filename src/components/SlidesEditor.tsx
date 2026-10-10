/**
 * Slides Editor Component
 * Edit individual slides and manage presentation structure
 */

import React, { useState } from 'react';
import { Slide, Presentation } from '@/services/slideGeneratorService';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface Props {
  presentation: Presentation;
  onAddSlide: (type: Slide['type']) => void;
  onUpdateSlide: (slideId: string, updates: Partial<Slide>) => void;
  onDeleteSlide: (slideId: string) => void;
  onReorderSlides: (fromIndex: number, toIndex: number) => void;
  onThemeChange: (theme: string) => void;
}

export function SlidesEditor({
  presentation,
  onAddSlide,
  onUpdateSlide,
  onDeleteSlide,
  onReorderSlides,
  onThemeChange,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Slide>>({});

  const handleStartEdit = (slide: Slide) => {
    setEditingId(slide.id);
    setEditValues(slide);
  };

  const handleSaveEdit = () => {
    if (editingId) {
      onUpdateSlide(editingId, editValues);
      setEditingId(null);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  return (
    <div className="slides-editor">
      {/* Slide List */}
      <div className="slides-list">
        <div className="list-header">
          <h3>Slides ({presentation.slides.length})</h3>
          <div className="list-actions">
            <button
              onClick={() => onAddSlide('content')}
              className="btn-small btn-primary"
              title="Adicionar novo slide"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="slides-thumbnail-list">
          {presentation.slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`slide-thumbnail ${editingId === slide.id ? 'editing' : ''}`}
              onClick={() => handleStartEdit(slide)}
            >
              <div className="thumbnail-number">{index + 1}</div>
              <div className="thumbnail-content">
                <div className="thumbnail-title">{slide.title}</div>
                <div className="thumbnail-preview">{slide.content.substring(0, 50)}...</div>
              </div>
              <div className="thumbnail-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSlide(slide.id);
                  }}
                  className="btn-delete"
                  title="Deletar slide"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide Editor */}
      {editingId && (
        <div className="slide-editor-panel">
          <div className="editor-header">
            <h3>Editar Slide</h3>
            <div className="editor-actions">
              <button onClick={handleSaveEdit} className="btn-small btn-success">
                Salvar
              </button>
              <button onClick={handleCancel} className="btn-small btn-secondary">
                Cancelar
              </button>
            </div>
          </div>

          <div className="editor-form">
            {/* Slide Type */}
            <div className="form-group">
              <label>Tipo de Slide</label>
              <select
                value={editValues.type || 'content'}
                onChange={(e) =>
                  setEditValues({ ...editValues, type: e.target.value as Slide['type'] })
                }
                className="form-input"
              >
                <option value="title">Título</option>
                <option value="content">Conteúdo</option>
                <option value="two-column">Dois Colunas</option>
                <option value="image">Imagem</option>
                <option value="quote">Citação</option>
              </select>
            </div>

            {/* Title */}
            <div className="form-group">
              <label>Título</label>
              <input
                type="text"
                value={editValues.title || ''}
                onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                className="form-input"
                placeholder="Título do slide"
              />
            </div>

            {/* Content */}
            <div className="form-group">
              <label>Conteúdo</label>
              <textarea
                value={editValues.content || ''}
                onChange={(e) => setEditValues({ ...editValues, content: e.target.value })}
                className="form-input"
                rows={6}
                placeholder="Texto principal do slide"
              />
            </div>

            {/* Subtitle (for quote slides) */}
            {editValues.type === 'quote' && (
              <div className="form-group">
                <label>Autor/Atribuição</label>
                <input
                  type="text"
                  value={editValues.subtitle || ''}
                  onChange={(e) => setEditValues({ ...editValues, subtitle: e.target.value })}
                  className="form-input"
                  placeholder="Autor da citação"
                />
              </div>
            )}

            {/* Notes */}
            <div className="form-group">
              <label>Notas do Palestrante</label>
              <textarea
                value={editValues.notes || ''}
                onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                className="form-input"
                rows={3}
                placeholder="Notas privadas para o palestrante"
              />
            </div>
          </div>

          {/* Live Preview */}
          <div className="editor-preview">
            <h4>Visualização</h4>
            <div className={`preview-slide theme-${presentation.theme}`}>
              <h2>{editValues.title}</h2>
              <div className="preview-content">
                {editValues.content}
              </div>
              {editValues.subtitle && (
                <p className="preview-subtitle">— {editValues.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Theme Selector */}
      <div className="theme-selector">
        <h3>Tema Visual</h3>
        <div className="theme-options">
          {(['modern', 'minimal', 'dark', 'corporate', 'creative'] as const).map(t => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`theme-btn theme-${t} ${presentation.theme === t ? 'active' : ''}`}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
