import React, { useState } from 'react';
import { useSpreadsheetGenerator } from '@/hooks/useSpreadsheetGenerator';
import { SPREADSHEET_TEMPLATES } from '@/config/spreadsheetsPricing';
import { Download, Trash2, Loader, Eye } from 'lucide-react';
import './CreativeSheets.css';

interface CreativeSheetsProps {
  creditsAvailable: number;
}

export function CreativeSheets({ creditsAvailable }: CreativeSheetsProps) {
  const {
    galleries,
    currentGallery,
    isGenerating,
    error,
    generateSpreadsheet,
    updateTheme,
    deleteGallery,
    exportGallery,
    clearError,
    loadGallery,
    getSpreadsheetCost,
  } = useSpreadsheetGenerator(creditsAvailable);

  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<'sales' | 'inventory' | 'finance' | 'hrrecords' | 'productlist' | 'custom'>(
    'custom'
  );
  const [selectedTheme, setSelectedTheme] = useState<'professional' | 'minimal' | 'colorful' | 'dark' | 'modern'>(
    'professional'
  );
  const [previewSpreadsheet, setPreviewSpreadsheet] = useState<any>(null);

  const cost = getSpreadsheetCost(1);
  const canGenerate = description.trim().length > 0 && cost <= creditsAvailable;

  const handleGenerate = async () => {
    if (!canGenerate) return;

    try {
      await generateSpreadsheet(description, template);
      setDescription('');
    } catch (err) {
      console.error('Erro ao gerar planilha:', err);
    }
  };

  const handleExport = (format: 'json' | 'html' | 'csv' | 'xlsx') => {
    const data = exportGallery(format);
    if (!data) return;

    let filename = `planilha-${Date.now()}`;
    let type = 'text/plain';

    if (format === 'json') {
      type = 'application/json';
      filename += '.json';
    } else if (format === 'html') {
      type = 'text/html';
      filename += '.html';
    } else if (format === 'csv') {
      type = 'text/csv';
      filename += '.csv';
    } else if (format === 'xlsx') {
      type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename += '.xlsx';
    }

    if (format === 'xlsx' && data instanceof Uint8Array) {
      const blob = new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([data], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (currentGallery) {
    return (
      <div className="creative-sheets">
        <div className="sheets-editor">
          <div className="editor-header">
            <h2>📊 Galeria de Planilhas</h2>
            <button
              className="btn-back"
              onClick={() => {
                setDescription('');
                setPreviewSpreadsheet(null);
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
                <span>📋 {currentGallery.spreadsheets.length} planilha(s)</span>
                <span>💳 {currentGallery.creditsUsed} créditos usados</span>
              </div>
            </div>

            <div className="spreadsheets-container">
              {currentGallery.spreadsheets.map((spreadsheet, idx) => (
                <div key={spreadsheet.id} className="spreadsheet-item">
                  <div className="spreadsheet-header">
                    <h4>{spreadsheet.title.substring(0, 40)}</h4>
                    <button
                      className="btn-preview"
                      onClick={() => setPreviewSpreadsheet(spreadsheet)}
                    >
                      <Eye size={16} /> Ver
                    </button>
                  </div>
                  <p className="spreadsheet-meta">
                    {spreadsheet.rows} linhas × {spreadsheet.columns} colunas • Tipo: {spreadsheet.template}
                  </p>
                </div>
              ))}
            </div>

            {previewSpreadsheet && (
              <div className="preview-modal">
                <div className="preview-content">
                  <div className="preview-header">
                    <h3>Prévia: {previewSpreadsheet.title}</h3>
                    <button
                      className="btn-close"
                      onClick={() => setPreviewSpreadsheet(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="preview-table-wrapper">
                    <table className="preview-table">
                      <tbody>
                        {previewSpreadsheet.data.map((row: any, rowIdx: number) => (
                          <tr key={rowIdx}>
                            {row.cells.map((cell: any, cellIdx: number) => (
                              <td
                                key={cellIdx}
                                className={cell.type === 'header' ? 'header-cell' : 'data-cell'}
                              >
                                {cell.value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="gallery-toolbar">
              <div className="toolbar-group">
                <label>Tema da Galeria:</label>
                <div className="theme-buttons">
                  {(['professional', 'minimal', 'colorful', 'dark', 'modern'] as const).map((t) => (
                    <button
                      key={t}
                      className={`theme-btn ${selectedTheme === t ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTheme(t);
                        updateTheme(t);
                      }}
                    >
                      {t === 'professional' && '💼'}
                      {t === 'minimal' && '⚪'}
                      {t === 'colorful' && '🎨'}
                      {t === 'dark' && '🌙'}
                      {t === 'modern' && '✨'}
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
                  <button className="btn-export" onClick={() => handleExport('csv')}>
                    <Download size={16} /> CSV
                  </button>
                  <button className="btn-export" onClick={() => handleExport('xlsx')}>
                    <Download size={16} /> Excel
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
    <div className="creative-sheets">
      <div className="generator-panel">
        <h2>📊 Gerador de Planilhas com IA</h2>

        {error && (
          <div className="error-box">
            <strong>❌ Erro:</strong> {error}
            <button className="btn-dismiss" onClick={clearError}>
              ✕
            </button>
          </div>
        )}

        <div className="form-group">
          <label>Descrição da Planilha:</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Uma planilha de vendas com produtos, quantidades e valores..."
            className="textarea-input"
            rows={3}
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Tipo de Planilha:</label>
          <div className="template-buttons">
            {Object.entries(SPREADSHEET_TEMPLATES).map(([key, { label, icon }]) => (
              <button
                key={key}
                className={`template-btn ${template === key ? 'active' : ''}`}
                onClick={() => setTemplate(key as typeof template)}
                disabled={isGenerating}
              >
                <span className="template-icon">{icon}</span>
                <span className="template-name">{label}</span>
              </button>
            ))}
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
            '📋 Gerar Planilha'
          )}
        </button>
      </div>

      {galleries.length > 0 && (
        <div className="recent-galleries">
          <h3>📚 Galerias Recentes</h3>
          <div className="galleries-list">
            {galleries.slice(0, 5).map((gallery) => (
              <div key={gallery.id} className="gallery-card" onClick={() => loadGallery(gallery.id)}>
                <div className="gallery-card-icon">📊</div>
                <div className="gallery-card-info">
                  <h4>{gallery.title.substring(0, 30)}...</h4>
                  <p>
                    {gallery.spreadsheets.length} planilha{gallery.spreadsheets.length !== 1 ? 's' : ''} • {
                      gallery.creditsUsed
                    }{' '}
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
