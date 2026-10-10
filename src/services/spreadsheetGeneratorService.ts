import { openRouterService } from './openrouterService';
import * as XLSX from 'xlsx';

export interface SpreadsheetCell {
  value: string | number;
  type: 'header' | 'data' | 'formula';
}

export interface SpreadsheetRow {
  cells: SpreadsheetCell[];
}

export interface GeneratedSpreadsheet {
  id: string;
  title: string;
  description: string;
  data: SpreadsheetRow[];
  columns: number;
  rows: number;
  template: 'sales' | 'inventory' | 'finance' | 'hrrecords' | 'productlist' | 'custom';
  createdAt: string;
}

export interface SpreadsheetGallery {
  id: string;
  title: string;
  description: string;
  spreadsheets: GeneratedSpreadsheet[];
  theme: 'professional' | 'minimal' | 'colorful' | 'dark' | 'modern';
  createdAt: string;
  updatedAt: string;
  creditsUsed: number;
}

export class SpreadsheetGeneratorService {
  private defaultModel = 'meta-llama/llama-2-70b-chat';
  private creditCostPerSpreadsheet = 2; // 2 créditos por planilha

  async generateSpreadsheet(
    prompt: string,
    template: 'sales' | 'inventory' | 'finance' | 'hrrecords' | 'productlist' | 'custom' = 'custom'
  ): Promise<GeneratedSpreadsheet> {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Descrição da planilha é obrigatória');
    }

    try {
      // Gerar conteúdo com Llama 2 70B (FREE via OpenRouter)
      const content = await this.generateSpreadsheetContent(prompt, template);

      // Converter para formato estruturado
      const spreadsheetData = this.parseSpreadsheetContent(content);

      return {
        id: `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: prompt,
        description: `Planilha gerada com IA: ${template}`,
        data: spreadsheetData,
        columns: spreadsheetData[0]?.cells.length || 0,
        rows: spreadsheetData.length,
        template,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Erro ao gerar planilha: ${(error as Error).message}`);
    }
  }

  private async generateSpreadsheetContent(
    prompt: string,
    template: string
  ): Promise<string> {
    if (!process.env.VITE_OPENROUTER_API_KEY) {
      // Retornar dados de exemplo se sem API key
      return this.getExampleSpreadsheetData(template);
    }

    try {
      const response = await openRouterService.chat({
        model: this.defaultModel,
        messages: [
          {
            role: 'user',
            content: `Gere dados para uma planilha Excel/Google Sheets com o seguinte:

Pedido: "${prompt}"
Template: ${template}

Retorne APENAS um JSON válido sem explicações, com esta estrutura:
{
  "headers": ["Coluna1", "Coluna2", "Coluna3"],
  "rows": [
    ["valor1", "valor2", "valor3"],
    ["valor4", "valor5", "valor6"]
  ]
}

Crie dados realistas e úteis para o contexto pedido.`,
          },
        ],
        max_tokens: 2000,
      });

      return response.choices[0]?.message?.content || this.getExampleSpreadsheetData(template);
    } catch {
      return this.getExampleSpreadsheetData(template);
    }
  }

  private parseSpreadsheetContent(content: string): SpreadsheetRow[] {
    try {
      // Extrair JSON do conteúdo
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.getDefaultSpreadsheetRows();
      }

      const data = JSON.parse(jsonMatch[0]);
      const rows: SpreadsheetRow[] = [];

      // Adicionar headers
      if (data.headers && Array.isArray(data.headers)) {
        rows.push({
          cells: data.headers.map((h: string) => ({
            value: h,
            type: 'header',
          })),
        });
      }

      // Adicionar dados
      if (data.rows && Array.isArray(data.rows)) {
        data.rows.forEach((row: any[]) => {
          rows.push({
            cells: row.map((cell: any) => ({
              value: cell,
              type: 'data',
            })),
          });
        });
      }

      return rows.length > 0 ? rows : this.getDefaultSpreadsheetRows();
    } catch {
      return this.getDefaultSpreadsheetRows();
    }
  }

  private getDefaultSpreadsheetRows(): SpreadsheetRow[] {
    return [
      {
        cells: [
          { value: 'ID', type: 'header' },
          { value: 'Nome', type: 'header' },
          { value: 'Valor', type: 'header' },
        ],
      },
      {
        cells: [
          { value: '1', type: 'data' },
          { value: 'Exemplo 1', type: 'data' },
          { value: '100', type: 'data' },
        ],
      },
      {
        cells: [
          { value: '2', type: 'data' },
          { value: 'Exemplo 2', type: 'data' },
          { value: '200', type: 'data' },
        ],
      },
    ];
  }

  private getExampleSpreadsheetData(template: string): string {
    const examples: Record<string, string> = {
      sales: JSON.stringify({
        headers: ['Data', 'Produto', 'Quantidade', 'Valor Unitário', 'Total'],
        rows: [
          ['2026-10-01', 'Produto A', '10', 'R$ 100', 'R$ 1.000'],
          ['2026-10-02', 'Produto B', '5', 'R$ 250', 'R$ 1.250'],
          ['2026-10-03', 'Produto C', '20', 'R$ 50', 'R$ 1.000'],
        ],
      }),
      inventory: JSON.stringify({
        headers: ['SKU', 'Nome', 'Estoque Atual', 'Mínimo', 'Status'],
        rows: [
          ['SKU001', 'Item A', '45', '20', 'OK'],
          ['SKU002', 'Item B', '12', '25', 'BAIXO'],
          ['SKU003', 'Item C', '100', '50', 'OK'],
        ],
      }),
      finance: JSON.stringify({
        headers: ['Mês', 'Receita', 'Despesa', 'Lucro', 'Margem'],
        rows: [
          ['Janeiro', 'R$ 50.000', 'R$ 30.000', 'R$ 20.000', '40%'],
          ['Fevereiro', 'R$ 55.000', 'R$ 32.000', 'R$ 23.000', '42%'],
          ['Março', 'R$ 60.000', 'R$ 35.000', 'R$ 25.000', '42%'],
        ],
      }),
      hrrecords: JSON.stringify({
        headers: ['Matrícula', 'Nome', 'Departamento', 'Cargo', 'Salário'],
        rows: [
          ['001', 'João Silva', 'TI', 'Desenvolvedor', 'R$ 5.000'],
          ['002', 'Maria Santos', 'RH', 'Gerente', 'R$ 7.000'],
          ['003', 'Pedro Costa', 'Vendas', 'Vendedor', 'R$ 4.000'],
        ],
      }),
      productlist: JSON.stringify({
        headers: ['Código', 'Nome do Produto', 'Categoria', 'Preço', 'Em Estoque'],
        rows: [
          ['P001', 'Notebook', 'Eletrônicos', 'R$ 3.500', 'Sim'],
          ['P002', 'Mouse Gamer', 'Periféricos', 'R$ 150', 'Sim'],
          ['P003', 'Teclado Mecânico', 'Periféricos', 'R$ 450', 'Não'],
        ],
      }),
      custom: JSON.stringify({
        headers: ['Coluna A', 'Coluna B', 'Coluna C'],
        rows: [
          ['Dado 1', 'Dado 2', 'Dado 3'],
          ['Dado 4', 'Dado 5', 'Dado 6'],
        ],
      }),
    };

    return examples[template] || examples.custom;
  }

  calculateCost(spreadsheetCount: number): number {
    return Math.max(2, spreadsheetCount * this.creditCostPerSpreadsheet);
  }

  exportAsCSV(spreadsheet: GeneratedSpreadsheet): string {
    return spreadsheet.data
      .map((row) => row.cells.map((cell) => `"${cell.value}"`).join(','))
      .join('\n');
  }

  exportAsJSON(gallery: SpreadsheetGallery): string {
    return JSON.stringify(gallery, null, 2);
  }

  exportAsExcel(spreadsheet: GeneratedSpreadsheet): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet(
      spreadsheet.data.map((row) => row.cells.map((cell) => cell.value))
    );

    // Estilo para headers
    spreadsheet.data[0]?.cells.forEach((_, index) => {
      const cellRef = XLSX.utils.encode_col(index) + '1';
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'FFD966' } },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  }

  createGalleryHTML(gallery: SpreadsheetGallery): string {
    const themeColors: Record<string, { primary: string; secondary: string }> = {
      professional: { primary: '#1e40af', secondary: '#1e3a8a' },
      minimal: { primary: '#000000', secondary: '#ffffff' },
      colorful: { primary: '#ec4899', secondary: '#f59e0b' },
      dark: { primary: '#10b981', secondary: '#1f2937' },
      modern: { primary: '#6366f1', secondary: '#ec4899' },
    };

    const colors = themeColors[gallery.theme] || themeColors.professional;

    const tablesHTML = gallery.spreadsheets
      .map(
        (sheet) => `
      <div class="spreadsheet-table">
        <h3>${sheet.title}</h3>
        <table>
          <thead>
            <tr>
              ${sheet.data[0]?.cells.map((cell) => `<th>${cell.value}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sheet.data
              .slice(1)
              .map(
                (row) => `
              <tr>
                ${row.cells.map((cell) => `<td>${cell.value}</td>`).join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${gallery.title} - Galeria de Planilhas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: white; font-size: 32px; margin-bottom: 10px; }
    .description { color: rgba(255,255,255,0.9); font-size: 16px; margin-bottom: 30px; }
    .spreadsheet-table {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    }
    .spreadsheet-table h3 {
      color: ${colors.primary};
      margin-bottom: 15px;
      font-size: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: ${colors.primary};
      color: white;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    tbody tr:hover {
      background: #f5f5f5;
    }
    .credits {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      margin-top: 30px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${gallery.title}</h1>
    <p class="description">${gallery.description}</p>

    <div class="spreadsheets">
      ${tablesHTML}
    </div>

    <div class="credits">
      <strong>Créditos usados:</strong> ${gallery.creditsUsed} |
      <strong>Planilhas:</strong> ${gallery.spreadsheets.length}
    </div>
  </div>
</body>
</html>`;
  }
}

export const spreadsheetGeneratorService = new SpreadsheetGeneratorService();
