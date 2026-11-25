// Vertal CRM no hub de Conectores: opção própria do Vertal (first-party), fixada no topo da lista.
// Só entra na lista quando o build liga (VITE_VERTAL_CRM) e o servidor libera o usuário (useVertalCrmAccess).
import { Contact } from 'lucide-react';
import type { ConnectorConfig } from '@/lib/connectorsConfig';
import { VERTAL_CRM_ROUTE } from './client';

export const VERTAL_CRM_CONNECTOR: ConnectorConfig = {
  name: 'Vertal CRM',
  slug: 'vertal-crm',
  icon: Contact,
  color: '#8B5CF6',
  authType: 'manual',
  category: 'ecosystem',
  description: 'CRM grátis do Vertal: contatos, empresas, funis, tarefas e relatórios. Só a IA custa (1 crédito).',
  longDescription:
    'O Vertal CRM é o CRM próprio do Vertal Dev: contatos, empresas, negócios em Kanban com vários funis, tarefas e lembretes, notas, linha do tempo, ' +
    'etiquetas, campos personalizados, CSV, anexos, equipe com papéis, API e webhooks. Recebe os leads do Vertal Prospector e do Growth Team e tem ' +
    'gatilhos e ações no Vertal Fluxos. Conectar a um CRM pago (Pipedrive, HubSpot, Salesforce) custa 4 créditos para ativar e 2 por sincronização com IA.',
  features: ['Grátis para usar', 'IA a 1 crédito por uso', 'Kanban com vários funis', 'API, webhooks e Vertal Fluxos', 'Sincroniza com CRMs pagos'],
  status: 'available',
  featured: true,
  pinned: true,
  badge: 'Grátis · IA 1 crédito',
  internalRoute: VERTAL_CRM_ROUTE,
  apiKeyLabel: 'Conta Vertal',
  apiKeyPlaceholder: '',
  apiKeyHelp: 'Usa a sua conta do Vertal Dev; nada para configurar.',
  setupSteps: [
    { title: 'Abra o Vertal CRM', description: 'Toque no cartão: o seu CRM é criado na hora, com um funil de vendas pronto.' },
    { title: 'Traga seus contatos', description: 'Importe um CSV, os leads do Vertal Prospector ou do Growth Team.' },
    { title: 'Use a IA quando quiser', description: 'Resumo, e-mail de follow-up, pontuação e próxima ação: 1 crédito cada, com o custo mostrado antes.' },
  ],
};
