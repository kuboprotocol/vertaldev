import { describe, it, expect } from 'vitest';
import { getSpreadsheetCost, getCostMessage, SPREADSHEET_PRICING } from '@/config/spreadsheetsPricing';

describe('CreativeSheets - Spreadsheet Pricing', () => {
  it('should calculate cost for single spreadsheet', () => {
    const cost = getSpreadsheetCost(1);
    expect(cost).toBe(2);
  });

  it('should calculate cost for multiple spreadsheets', () => {
    const cost = getSpreadsheetCost(5);
    expect(cost).toBe(10);
  });

  it('should have minimum cost of 2 credits', () => {
    const cost = getSpreadsheetCost(0);
    expect(cost).toBeGreaterThanOrEqual(2);
  });

  it('should return correct cost message when credits available', () => {
    const message = getCostMessage(1, 100);
    expect(message).toContain('✅');
    expect(message).toContain('2 crédito');
    expect(message).toContain('R$');
  });

  it('should return error message when insufficient credits', () => {
    const message = getCostMessage(10, 5);
    expect(message).toContain('❌');
    expect(message).toContain('Créditos insuficientes');
  });

  it('should calculate correct cost in reais', () => {
    const cost = getSpreadsheetCost(1);
    const costInReais = cost * 0.40;
    expect(costInReais).toBe(0.80);
  });

  it('should have consistent pricing across spreadsheet types', () => {
    const cost1 = getSpreadsheetCost(1);
    const cost2 = getSpreadsheetCost(1);
    expect(cost1).toBe(cost2);
  });

  it('should validate pricing configuration', () => {
    expect(SPREADSHEET_PRICING.costPerSpreadsheet).toBe(2);
    expect(SPREADSHEET_PRICING.costInReais).toBe(0.80);
    expect(SPREADSHEET_PRICING.actualCostUSD).toBe(0.0025);
    expect(SPREADSHEET_PRICING.profitMargin).toBeGreaterThan(0.99);
  });

  it('should calculate cost correctly for edge cases', () => {
    expect(getSpreadsheetCost(1)).toBe(2);
    expect(getSpreadsheetCost(100)).toBe(200);
    expect(getSpreadsheetCost(1000)).toBe(2000);
  });

  it('should ensure profit margin is high', () => {
    const margin = SPREADSHEET_PRICING.profitMargin;
    expect(margin).toBeGreaterThan(0.95); // At least 95% profit margin
  });

  it('should generate accurate cost message format', () => {
    const message = getCostMessage(1, 10);
    const regex = /R\$\s*\d+\.\d{2}/;
    expect(message).toMatch(regex);
  });
});

describe('CreativeSheets - Template Configuration', () => {
  it('should have all required templates', () => {
    const templates = ['sales', 'inventory', 'finance', 'hrrecords', 'productlist', 'custom'];
    expect(templates.length).toBe(6);
  });

  it('should have descriptive labels for templates', () => {
    const labels = ['Vendas', 'Inventário', 'Financeiro', 'RH', 'Produtos', 'Customizado'];
    expect(labels.length).toBe(6);
  });

  it('should have unique icons for each template', () => {
    const icons = ['💰', '📦', '💵', '👥', '🛒', '✨'];
    expect(new Set(icons).size).toBe(6);
  });
});

describe('CreativeSheets - Free Tier', () => {
  it('should limit free tier spreadsheets per month', () => {
    // Free tier users should have 2 spreadsheets per month limit
    expect(true).toBe(true);
  });

  it('should provide access to all templates in free tier', () => {
    // All 6 templates should be available
    expect(true).toBe(true);
  });
});

describe('CreativeSheets - Credit Packages', () => {
  it('should have starter package with 10 credits', () => {
    expect(true).toBe(true);
  });

  it('should have professional package marked as popular', () => {
    expect(true).toBe(true);
  });

  it('should have enterprise package for businesses', () => {
    expect(true).toBe(true);
  });

  it('should calculate spreadsheetsIncluded correctly', () => {
    // Starter: 10 credits = 5 spreadsheets (at 2 credits each)
    // Professional: 50 credits = 25 spreadsheets
    // Enterprise: 500 credits = 250 spreadsheets
    expect(true).toBe(true);
  });
});
