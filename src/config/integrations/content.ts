// Conteúdo editorial das páginas /integracoes/<slug> (SEO): o que é o app, em uma linha,
// e exemplos de uso com o Vertal Dev. Conector sem entrada aqui ganha texto padrão da categoria.
// Só descrição factual: nenhuma parceria ou endosso das marcas citadas.
export interface IntegrationContent {
  /** O que é o app, em uma linha. */
  about: string
  /** Pelo menos 3 exemplos de uso com o Vertal Dev. */
  uses: string[]
  /** Outros nomes que as pessoas pesquisam. */
  aliases?: string[]
}

export const INTEGRATION_CONTENT: Record<string, IntegrationContent> = {
  'vertal-app': {
    about: 'Plataforma de deploy do Ecossistema Vertal: a IA detecta stack, build e variáveis de ambiente e coloca a aplicação no ar.',
    uses: [
      'Publicar o app que você acabou de criar no Vertal Dev sem configurar servidor, com status e logs ao vivo.',
      'Dar ao seu agente as ferramentas de deploy via MCP para ele subir uma nova versão quando os testes passarem.',
      'Abrir o painel do Vertal.app dentro do Vertal Dev e acompanhar vários projetos num lugar só.',
    ],
  },
  'vertal-run': {
    about: 'Camada de execução do Ecossistema Vertal: sandboxes isoladas onde agentes de IA rodam código Python, JavaScript e Bash.',
    uses: [
      'Deixar o agente testar um script antes de sugerir a mudança, numa sandbox limpa e sem rede.',
      'Rodar cálculos e transformações de dados pedidos no chat sem expor o seu servidor.',
      'Controlar cota, limite de requisições e auditoria por chave quando vários agentes usam a mesma conta.',
    ],
  },
  'vertal-vibe-pay': {
    about: 'Conta digital dentro do Vertal Dev: Pix, boleto, cartão, links de pagamento e conta global multimoeda.',
    uses: [
      'Cobrar clientes por Pix ou boleto direto do Vertal Dev, sem abrir outro painel.',
      'Gerar um link de pagamento para vender o app ou serviço que você criou.',
      'Receber em outras moedas pela conta global e ver o saldo e o extrato unificados.',
    ],
  },
  github: {
    about: 'Plataforma de hospedagem de código com Git, issues, pull requests e GitHub Actions.',
    uses: [
      'Salvar no seu repositório o código do app criado no Vertal Dev e acompanhar os deploys.',
      'Quando uma issue nova chegar, avisar o time no Slack ou criar uma tarefa no gerenciador de projetos.',
      'Pedir ao Vertal Chat para abrir uma issue com o bug descrito na conversa.',
    ],
  },
  'vertal-fluxos': {
    about: 'Motor de automações do Ecossistema Vertal: fluxos com gatilhos e ações entre os apps que você usa.',
    uses: [
      'Pedir ao Vertal Chat para criar um fluxo “nova resposta no formulário → linha na planilha → aviso no Slack”.',
      'Testar cada passo de um fluxo e publicar sem sair da conversa.',
      'Ver as últimas execuções e o resultado de cada passo quando algo falhar.',
    ],
  },
  'vertal-agentes': {
    about: 'Agentes de monitoramento do Ecossistema Vertal que vigiam sites, feeds e APIs e reagem a eventos.',
    uses: [
      'Vigiar o preço ou o estoque de um produto num site e avisar quando mudar.',
      'Disparar um fluxo do Vertal Fluxos sempre que um agente emitir um evento.',
      'Criar ou importar cenários de agentes pelo chat e ligar ou desligar agentes quando quiser.',
    ],
  },
  stripe: {
    about: 'Plataforma de pagamentos online para cartão, assinaturas e marketplaces.',
    uses: [
      'Ligar checkout, assinaturas e webhooks de pagamento ao app que você cria no Vertal Dev.',
      'Registrar cada repasse ou reembolso numa planilha de controle financeiro.',
      'Avisar o time no chat quando uma transação nova for processada.',
    ],
  },
  figma: {
    about: 'Ferramenta de design de interfaces colaborativa, no navegador.',
    uses: [
      'Importar frames e componentes do Figma para começar o app com o seu próprio design.',
      'Levar os design tokens (cores, tipografia, espaçamentos) para o código gerado.',
      'Atualizar telas do projeto quando o design mudar, sem redesenhar à mão.',
    ],
  },
  'mais-retorno': {
    about: 'Plataforma brasileira de dados do mercado financeiro: fundos, ações, FIIs, ETFs e Tesouro.',
    uses: [
      'Perguntar ao seu agente a rentabilidade e o drawdown de um fundo em linguagem natural.',
      'Montar um app que compara FIIs ou ETFs com dados da CVM atualizados.',
      'Consultar a composição da carteira de um fundo antes de uma recomendação.',
    ],
  },
  supabase: {
    about: 'Backend open source com banco Postgres, autenticação, storage e edge functions.',
    uses: [
      'Usar o seu projeto Supabase como backend do app criado no Vertal Dev.',
      'Guardar usuários, arquivos e dados em tempo real sem montar servidor.',
      'Rodar edge functions para regras de negócio do app.',
    ],
  },
  resend: {
    about: 'Serviço de envio de e-mails transacionais e de marketing para desenvolvedores.',
    uses: [
      'Enviar e-mails de boas-vindas e de redefinição de senha do app que você criou.',
      'Mandar notificações por e-mail com templates personalizados e o seu domínio.',
      'Acompanhar entregas e aberturas dos e-mails enviados pelo app.',
    ],
  },
  gmail: {
    about: 'Serviço de e-mail do Google.',
    uses: [
      'Pedir ao Vertal Chat um resumo dos e-mails importantes do dia e rascunhos de resposta.',
      'Quando chegar um e-mail de cliente, criar um ticket ou um negócio no CRM automaticamente.',
      'Enviar e-mails a partir de um fluxo, por exemplo uma confirmação depois de um pagamento.',
    ],
  },
  spotify: {
    about: 'Serviço de streaming de música e podcasts.',
    uses: [
      'Pedir uma música no Vertal Chat e ouvir no player embutido.',
      'Criar uma playlist nova a partir de uma lista sugerida pela IA.',
      'Controlar a reprodução no seu aparelho (com conta Premium).',
    ],
  },
  slack: {
    about: 'Plataforma de mensagens para equipes, com canais, threads e bots.',
    uses: [
      'Publicar no canal do time um aviso quando um deploy terminar ou um lead novo chegar.',
      'Mandar DMs automáticas com lembretes ou relatórios diários.',
      'Pedir ao Vertal Chat para encontrar uma mensagem antiga ou um colega pelo e-mail.',
    ],
  },
  instagram: {
    about: 'Rede social de fotos e vídeos da Meta; contas profissionais têm API oficial de publicação e mensagens.',
    aliases: ['Instagram Business', 'Instagram API'],
    uses: [
      'Publicar uma foto ou um Reel pelo Vertal Chat, com a sua confirmação antes de ir ao ar.',
      'Ler as métricas de alcance e seguidores da conta e registrar numa planilha toda semana.',
      'Responder DMs de clientes dentro da janela de 24 horas da Meta, direto pelo chat.',
    ],
  },
  whatsapp: {
    about: 'Aplicativo de mensagens da Meta; a WhatsApp Business Cloud API permite enviar mensagens pelo número da empresa.',
    aliases: ['WhatsApp Business', 'WhatsApp Cloud API'],
    uses: [
      'Enviar uma confirmação de pedido por template aprovado quando um pagamento entrar.',
      'Responder um cliente com texto livre pelo Vertal Chat dentro da janela de 24 horas.',
      'Listar os templates aprovados e os números da conta antes de montar uma campanha.',
    ],
  },
  render: {
    about: 'Nuvem para hospedar web services, bancos e jobs com deploy a partir do Git.',
    uses: [
      'Disparar deploy, restart ou rollback dos seus serviços na Render pelo Vertal Dev.',
      'Ligar o auto-healing, que vigia health checks a cada 2 minutos e reage a falhas.',
      'Rodar testes E2E por webhook depois de cada deploy.',
    ],
  },
  discord: {
    about: 'Plataforma de comunidades com servidores, canais de texto e voz e bots.',
    uses: [
      'Avisar a comunidade num canal quando sair uma versão nova do seu app.',
      'Criar eventos agendados no servidor a partir de um calendário.',
      'Mandar alertas de erro ou de vendas para um canal privado do time.',
    ],
  },
  cloudflare: {
    about: 'Plataforma de rede e segurança com DNS, CDN, Workers e Pages.',
    uses: [
      'Pedir ao Vertal Chat para criar o registro DNS que aponta o seu domínio para o app.',
      'Limpar o cache do site depois de publicar uma versão nova.',
      'Listar domínios, Workers e projetos do Pages da conta sem abrir o painel.',
    ],
  },
  mongodb: {
    about: 'Banco de dados de documentos (NoSQL), também disponível como serviço gerenciado.',
    uses: [
      'Usar a sua base MongoDB como armazenamento do app criado no Vertal Dev.',
      'Consultar coleções pelo chat para conferir dados de produção.',
      'Gravar eventos e logs do app em coleções próprias.',
    ],
  },
  docker: {
    about: 'Registro de imagens de contêiner do Docker.',
    uses: [
      'Publicar a imagem do app no seu repositório do Docker Hub.',
      'Usar imagens privadas no deploy dos seus serviços.',
      'Conferir tags e versões das imagens antes de um deploy.',
    ],
  },
  alchemy: {
    about: 'Plataforma de infraestrutura Web3 com nós RPC e APIs para Ethereum e outras redes.',
    uses: [
      'Dar ao seu dApp acesso RPC confiável a Ethereum, Polygon e outras redes EVM.',
      'Ler saldos, tokens e transações de carteiras no app.',
      'Fazer deploy de contratos usando o seu próprio endpoint.',
    ],
  },
  infura: {
    about: 'Serviço de nós RPC para Ethereum e outras redes blockchain.',
    uses: [
      'Ligar o seu dApp a Ethereum, Polygon ou Arbitrum pelo seu Project ID.',
      'Fazer chamadas RPC no servidor sem rodar um nó próprio.',
      'Trocar de rede sem mudar o código do app.',
    ],
  },
  'custom-rpc': {
    about: 'Qualquer endpoint JSON-RPC ou REST de blockchain: nó próprio ou provedor de sua escolha.',
    uses: [
      'Usar o seu próprio nó (EVM, Solana ou UTXO) no dApp criado no Vertal Dev.',
      'Testar a conexão com um ping antes de salvar o endpoint.',
      'Separar redes de teste e produção com endpoints diferentes.',
    ],
  },
  airbrake: {
    about: 'Serviço de monitoramento de erros e performance de aplicações.',
    uses: [
      'Avisar o time no Slack ou no Telegram quando um erro novo aparecer.',
      'Abrir uma issue no GitHub para cada erro novo em produção.',
      'Registrar os erros numa planilha para a revisão semanal.',
    ],
  },
  airtable: {
    about: 'Plataforma que mistura planilha e banco de dados, com bases, tabelas e visualizações.',
    uses: [
      'Criar um registro no Airtable para cada lead que chegar pelo formulário do site.',
      'Pedir ao Vertal Chat para encontrar um registro por fórmula e resumir o conteúdo.',
      'Usar o Airtable como base de conteúdo de um app criado no Vertal Dev.',
    ],
  },
  'amazon-ads': {
    about: 'Plataforma de anúncios da Amazon para vendedores e marcas (Sponsored Products e outros formatos).',
    uses: [
      'Criar uma campanha Sponsored Products já pausada e revisar antes de ativar.',
      'Pedir o relatório de gasto, cliques e vendas e mandar o resumo para o time.',
      'Pausar uma campanha pelo chat quando o custo passar do limite.',
    ],
  },
  appwrite: {
    about: 'Backend open source com banco de documentos, autenticação, storage e funções.',
    uses: [
      'Quando um documento novo for criado na coleção, avisar o time no chat.',
      'Copiar documentos novos para uma planilha ou CRM.',
      'Disparar um e-mail de boas-vindas quando um usuário se cadastra no seu app.',
    ],
  },
  asana: {
    about: 'Ferramenta de gestão de projetos e tarefas para equipes.',
    uses: [
      'Transformar cada pedido de cliente recebido por e-mail numa tarefa do Asana.',
      'Pedir ao Vertal Chat para criar um projeto com as tarefas de um lançamento.',
      'Encontrar uma tarefa num projeto e atualizar o time sobre o andamento.',
    ],
  },
  'better-stack': {
    about: 'Plataforma de monitoramento de uptime, logs e gestão de incidentes.',
    uses: [
      'Abrir um incidente automaticamente quando um teste do seu app falhar.',
      'Reconhecer e resolver incidentes pelo Vertal Chat.',
      'Registrar cada incidente numa planilha para o relatório mensal.',
    ],
  },
  'brave-search': {
    about: 'Mecanismo de busca independente, com API para resultados da web.',
    uses: [
      'Dar ao seu fluxo resultados de busca na web para pesquisas automáticas.',
      'Pesquisar notícias de um tema todo dia e mandar os links por e-mail.',
      'Enriquecer leads com informações públicas encontradas na web.',
    ],
  },
  carbone: {
    about: 'Gerador de documentos e relatórios (PDF, DOCX, XLSX) a partir de templates.',
    uses: [
      'Subir templates de contrato ou proposta para gerar documentos automaticamente.',
      'Gerar um relatório em PDF com dados vindos de uma planilha.',
      'Criar documentos padronizados para cada cliente novo do CRM.',
    ],
  },
  changedetection: {
    about: 'Ferramenta open source que vigia páginas da web e avisa quando o conteúdo muda.',
    uses: [
      'Vigiar a página de preços de um concorrente e receber alerta quando mudar.',
      'Acompanhar editais ou vagas num site e avisar no Telegram.',
      'Criar e apagar monitoramentos pelo chat conforme a necessidade.',
    ],
  },
  clickup: {
    about: 'Plataforma de produtividade com tarefas, listas, documentos e metas.',
    uses: [
      'Criar uma tarefa no ClickUp para cada bug relatado pelo formulário de suporte.',
      'Avisar no Slack quando uma tarefa importante for atualizada.',
      'Pedir ao Vertal Chat para montar pastas e listas de um projeto novo.',
    ],
  },
  deepl: {
    about: 'Serviço de tradução automática de textos e documentos.',
    uses: [
      'Traduzir automaticamente as respostas de clientes estrangeiros antes de chegarem ao time.',
      'Gerar versões em inglês e espanhol dos posts do seu blog.',
      'Traduzir descrições de produto antes de publicar em marketplaces.',
    ],
  },
  disqus: {
    about: 'Plataforma de comentários para sites e blogs.',
    uses: [
      'Avisar o autor no chat quando chegar um comentário novo.',
      'Mandar para moderação os comentários denunciados assim que aparecem.',
      'Guardar os comentários numa planilha para análise.',
    ],
  },
  dropbox: {
    about: 'Serviço de armazenamento e compartilhamento de arquivos na nuvem.',
    uses: [
      'Quando um arquivo novo cair numa pasta, avisar o time e registrar numa planilha.',
      'Criar pastas por cliente automaticamente a partir do CRM.',
      'Salvar como arquivo de texto um resumo gerado no chat.',
    ],
  },
  ebay: {
    about: 'Marketplace global de compra e venda.',
    uses: [
      'Cadastrar produtos no estoque pelo SKU e publicar ofertas a partir de uma planilha.',
      'Receber os pedidos novos e informar o código de rastreio quando enviar.',
      'Conferir políticas de envio e devolução antes de criar ofertas.',
    ],
  },
  eventbrite: {
    about: 'Plataforma de venda de ingressos e gestão de eventos.',
    uses: [
      'Adicionar cada inscrito novo a uma lista de e-mail ou ao CRM.',
      'Avisar a equipe quando um participante fizer check-in no evento.',
      'Criar e publicar eventos pelo chat a partir de um modelo.',
    ],
  },
  facebook: {
    about: 'Páginas do Facebook: perfis de marcas e empresas na rede social da Meta.',
    aliases: ['Facebook Pages', 'Páginas do Facebook'],
    uses: [
      'Publicar na Página do Facebook o mesmo post que saiu no blog.',
      'Postar fotos com legenda a partir de uma pasta ou planilha de conteúdo.',
      'Acompanhar engajamento e seguidores da Página toda semana.',
    ],
  },
  'firefly-iii': {
    about: 'Gerenciador de finanças pessoais open source e auto-hospedado.',
    uses: [
      'Registrar cada transação nova numa planilha ou avisar no Telegram.',
      'Acompanhar edições e exclusões de lançamentos para auditoria.',
      'Juntar os gastos do mês num resumo enviado por e-mail.',
    ],
  },
  'flowers-software': {
    about: 'Software de gestão de processos e documentos para empresas.',
    uses: [
      'Avisar o responsável no chat a cada atividade nova no processo.',
      'Registrar atividades numa planilha para controle.',
      'Criar uma tarefa no gerenciador de projetos quando uma atividade exigir ação.',
    ],
  },
  frappe: {
    about: 'Framework open source por trás do ERPNext, com DocTypes para qualquer cadastro.',
    aliases: ['ERPNext'],
    uses: [
      'Criar clientes, pedidos ou qualquer documento do ERPNext a partir de um formulário.',
      'Pedir ao Vertal Chat para listar documentos e resumir pendências.',
      'Atualizar um documento quando um pagamento for confirmado.',
    ],
  },
  freescout: {
    about: 'Central de atendimento (help desk) open source, alternativa auto-hospedada.',
    uses: [
      'Avisar no Slack quando chegar uma conversa nova de cliente.',
      'Registrar os atendimentos numa planilha para métricas.',
      'Criar uma tarefa para o time técnico quando o atendimento pedir.',
    ],
  },
  ghost: {
    about: 'Plataforma open source de publicação para blogs e newsletters.',
    uses: [
      'Divulgar cada post novo no X, no LinkedIn e na Página do Facebook.',
      'Avisar a comunidade no Discord quando sair um artigo.',
      'Registrar os posts publicados numa planilha editorial.',
    ],
  },
  gitea: {
    about: 'Serviço Git auto-hospedado e leve, com issues e pull requests.',
    uses: [
      'Abrir uma issue no seu Gitea a partir de um bug relatado no chat.',
      'Avisar o time quando houver pull request novo.',
      'Acompanhar estrelas e observadores dos seus repositórios.',
    ],
  },
  gitlab: {
    about: 'Plataforma DevOps com Git, CI/CD, issues e merge requests.',
    uses: [
      'Avisar o time quando uma pipeline falhar ou um deploy terminar.',
      'Registrar releases e tags num changelog compartilhado.',
      'Mandar para o chat cada merge request aberto para revisão.',
    ],
  },
  'google-admob': {
    about: 'Plataforma de anúncios do Google para apps mobile.',
    uses: [
      'Pedir ao Vertal Chat a lista de apps e blocos de anúncio da sua conta.',
      'Conferir rapidamente IDs de blocos ao configurar um app novo.',
      'Acompanhar as contas de publisher num painel do Vertal Dev.',
    ],
  },
  'google-ads': {
    about: 'Plataforma de anúncios do Google (Pesquisa, Display, YouTube e outros).',
    uses: [
      'Receber todo dia o relatório de impressões, cliques, custo e conversões por campanha.',
      'Pausar uma campanha pelo chat quando o custo por conversão subir.',
      'Fazer perguntas sobre a conta em linguagem natural, respondidas com consultas só de leitura.',
    ],
  },
  'google-adsense': {
    about: 'Programa do Google para exibir anúncios em sites e receber pela audiência.',
    uses: [
      'Receber um resumo semanal de ganhos, RPM e CTR.',
      'Conferir o status de aprovação dos sites da conta.',
      'Acompanhar o saldo em aberto e os pagamentos anteriores.',
    ],
  },
  'google-calendar': {
    about: 'Agenda online do Google.',
    uses: [
      'Avisar no chat quando um evento novo for criado na agenda do time.',
      'Criar uma tarefa de preparação para cada reunião nova.',
      'Registrar os eventos numa planilha de horas.',
    ],
  },
  'google-docs': {
    about: 'Editor de documentos online do Google.',
    uses: [
      'Gerar um documento a partir de um modelo para cada cliente novo.',
      'Criar um documento com o resumo de uma conversa do Vertal Chat.',
      'Avisar o time quando um documento novo for criado.',
    ],
  },
  'google-drive': {
    about: 'Armazenamento de arquivos na nuvem do Google.',
    uses: [
      'Quando um arquivo cair numa pasta, avisar o responsável e registrar numa planilha.',
      'Acompanhar alterações em arquivos de uma pasta compartilhada.',
      'Organizar uploads de clientes com avisos automáticos.',
    ],
  },
  'google-forms': {
    about: 'Criador de formulários e pesquisas do Google.',
    uses: [
      'Mandar cada resposta nova do formulário para o CRM como lead.',
      'Avisar no Slack ou no Telegram quando alguém responder.',
      'Enviar um e-mail de agradecimento a quem respondeu.',
    ],
  },
  'google-sheets': {
    about: 'Planilhas online do Google.',
    uses: [
      'Adicionar uma linha na planilha para cada venda, lead ou resposta de formulário.',
      'Quando uma linha nova entrar, disparar e-mail, mensagem ou tarefa.',
      'Criar planilhas e abas com cabeçalhos prontos pelo chat.',
    ],
  },
  'google-tasks': {
    about: 'Lista de tarefas do Google, integrada ao Gmail e à Agenda.',
    uses: [
      'Criar uma tarefa para cada e-mail marcado como importante.',
      'Avisar o time quando uma tarefa da lista for concluída.',
      'Pedir ao Vertal Chat para organizar tarefas em listas novas.',
    ],
  },
  hubspot: {
    about: 'Plataforma de CRM, marketing e vendas.',
    uses: [
      'Criar um contato no HubSpot para cada lead novo do site.',
      'Atualizar o contato quando ele comprar ou responder um e-mail.',
      'Levar os leads do Vertal Prospector direto para o CRM.',
    ],
  },
  'invoice-ninja': {
    about: 'Sistema open source de faturamento, orçamentos e pagamentos.',
    uses: [
      'Emitir uma fatura quando um negócio for ganho no CRM.',
      'Avisar no chat quando entrar um pagamento ou um orçamento novo.',
      'Cadastrar clientes e produtos a partir de uma planilha.',
    ],
  },
  jotform: {
    about: 'Criador de formulários online com modelos prontos.',
    uses: [
      'Levar cada resposta nova para uma planilha ou para o CRM.',
      'Avisar o time no Slack quando um formulário for enviado.',
      'Responder por e-mail quem preencheu o formulário.',
    ],
  },
  'kwai-ads': {
    about: 'Plataforma de anúncios do Kwai, app de vídeos curtos.',
    uses: [
      'Consultar as contas de anúncio liberadas para o seu usuário.',
      'Rodar relatórios de campanhas e criativos e mandar o resumo ao time.',
      'Juntar os resultados do Kwai com os de outras redes numa planilha.',
    ],
  },
  linkedin: {
    about: 'Rede social profissional.',
    uses: [
      'Publicar no seu perfil um post sobre cada artigo novo do blog.',
      'Compartilhar links com cartão de artigo a partir de uma lista de conteúdo.',
      'Pedir ao Vertal Chat para escrever e publicar um post com a sua aprovação.',
    ],
  },
  libretranslate: {
    about: 'API de tradução automática open source e auto-hospedável.',
    uses: [
      'Traduzir mensagens de clientes no seu próprio servidor, sem enviar dados para fora.',
      'Detectar o idioma de um texto e encaminhar para o time certo.',
      'Traduzir conteúdo de um feed antes de publicar.',
    ],
  },
  mailchimp: {
    about: 'Plataforma de e-mail marketing e automação.',
    uses: [
      'Adicionar ao CRM cada inscrito novo da audiência.',
      'Criar e enviar uma campanha a partir de um post novo do blog.',
      'Avisar vendas quando um contato abrir o e-mail de uma campanha.',
    ],
  },
  mailerlite: {
    about: 'Plataforma de e-mail marketing com newsletters e automações.',
    uses: [
      'Levar cada inscrito novo para a planilha ou para o CRM.',
      'Ser avisado quando alguém denunciar spam ou se descadastrar.',
      'Registrar as campanhas enviadas num calendário editorial.',
    ],
  },
  mattermost: {
    about: 'Plataforma de mensagens para equipes, open source e auto-hospedável.',
    uses: [
      'Publicar alertas de deploy e de erros num canal do Mattermost.',
      'Mandar relatórios diários para o canal do time.',
      'Avisar o suporte quando um cliente importante abrir um chamado.',
    ],
  },
  'meta-ads': {
    about: 'Gerenciador de anúncios da Meta para Facebook e Instagram.',
    uses: [
      'Criar campanhas já pausadas pelo chat e ativar só depois de revisar.',
      'Receber o relatório de gasto, CTR e CPC por campanha toda manhã.',
      'Pausar campanhas que passarem do custo definido.',
    ],
  },
  'microsoft-365': {
    about: 'OneDrive e Microsoft To Do: arquivos na nuvem e tarefas da Microsoft.',
    aliases: ['OneDrive', 'Microsoft To Do'],
    uses: [
      'Salvar no OneDrive um relatório gerado no chat.',
      'Criar uma tarefa no To Do para cada pedido que chegar por e-mail.',
      'Buscar um arquivo no OneDrive pelo nome ou pelo conteúdo.',
    ],
  },
  outlook: {
    about: 'E-mail e calendário da Microsoft (Outlook.com e Microsoft 365).',
    aliases: ['Outlook', 'Outlook Calendar'],
    uses: [
      'Pedir ao Vertal Chat os e-mails não lidos de um cliente e um rascunho de resposta.',
      'Criar um evento com convidados a partir de uma conversa.',
      'Ver os compromissos dos próximos dias antes de marcar uma reunião.',
    ],
  },
  'microsoft-teams': {
    about: 'Plataforma de chat e reuniões da Microsoft para empresas.',
    uses: [
      'Publicar num canal do Teams o aviso de um deploy ou de uma venda.',
      'Mandar uma mensagem num chat existente a partir de um fluxo.',
      'Listar equipes e canais para escolher onde publicar.',
    ],
  },
  miro: {
    about: 'Quadro branco online para colaboração visual.',
    uses: [
      'Criar um quadro para cada projeto novo a partir de um modelo.',
      'Adicionar cards ao quadro com ideias capturadas no chat.',
      'Copiar um quadro de planejamento no início de cada sprint.',
    ],
  },
  monday: {
    about: 'Plataforma de gestão de trabalho com quadros, colunas e automações.',
    uses: [
      'Criar um item no quadro para cada pedido de cliente.',
      'Montar quadros e colunas de um projeto pelo chat.',
      'Avisar quando alguém novo entrar na conta.',
    ],
  },
  notion: {
    about: 'Espaço de trabalho com páginas, wikis e bancos de dados.',
    uses: [
      'Criar um item numa database do Notion para cada lead, tarefa ou ideia.',
      'Avisar o time quando um item da database for atualizado.',
      'Pedir ao Vertal Chat para criar uma página com o resumo de uma reunião.',
    ],
  },
  ntfy: {
    about: 'Serviço simples de notificações push por tópicos, open source.',
    uses: [
      'Receber no celular um push quando um fluxo terminar ou falhar.',
      'Ser avisado na hora de uma venda ou de um lead novo.',
      'Usar o seu próprio servidor ntfy para alertas internos.',
    ],
  },
  odoo: {
    about: 'Suíte de ERP e CRM open source com módulos para vendas, estoque e finanças.',
    uses: [
      'Criar um lead no CRM do Odoo para cada contato do formulário do site.',
      'Levar leads do Vertal Prospector para o Odoo.',
      'Registrar oportunidades vindas de campanhas de anúncio.',
    ],
  },
  pdfmonkey: {
    about: 'Serviço de geração de PDFs a partir de templates HTML.',
    uses: [
      'Gerar um PDF de proposta ou recibo para cada venda.',
      'Enviar por e-mail o documento assim que ele ficar pronto.',
      'Apagar documentos antigos para manter a conta organizada.',
    ],
  },
  pipedrive: {
    about: 'CRM de vendas com funil visual de negócios.',
    uses: [
      'Criar pessoa, organização e negócio no Pipedrive para cada lead novo.',
      'Avisar o vendedor no chat quando um negócio novo entrar.',
      'Registrar notas e atividades a partir de e-mails e reuniões.',
    ],
  },
  placetel: {
    about: 'Telefonia na nuvem (PABX virtual) para empresas.',
    uses: [
      'Registrar no CRM cada ligação encerrada.',
      'Avisar o time quando uma chamada de cliente terminar.',
      'Montar uma planilha de ligações para métricas de atendimento.',
    ],
  },
  postgresql: {
    about: 'Banco de dados relacional open source.',
    uses: [
      'Gravar cada lead, pedido ou evento numa tabela do seu banco.',
      'Rodar consultas SQL pelo chat para tirar números do dia.',
      'Atualizar ou apagar linhas a partir de um fluxo.',
    ],
  },
  pushover: {
    about: 'Serviço de notificações push para celular e desktop.',
    uses: [
      'Receber um push quando um servidor cair ou um fluxo falhar.',
      'Ser avisado de vendas e cadastros importantes.',
      'Mandar lembretes pessoais agendados.',
    ],
  },
  reddit: {
    about: 'Rede social de comunidades (subreddits).',
    uses: [
      'Ser avisado quando surgir um post novo que cite a sua marca ou o seu produto.',
      'Compartilhar um link num subreddit a partir do seu conteúdo.',
      'Juntar menções numa planilha para pesquisa de mercado.',
    ],
  },
  'remove-bg': {
    about: 'Serviço que remove o fundo de imagens automaticamente.',
    uses: [
      'Tirar o fundo das fotos de produto antes de publicar na loja.',
      'Preparar imagens para posts de redes sociais em lote.',
      'Gerar fotos de perfil com fundo transparente.',
    ],
  },
  rss: {
    about: 'Formato padrão de feeds de sites, blogs e podcasts.',
    uses: [
      'Publicar no Slack ou no Telegram cada item novo de um feed.',
      'Divulgar posts novos do blog nas redes sociais.',
      'Montar um boletim diário com as novidades de vários sites.',
    ],
  },
  salesforce: {
    about: 'Plataforma de CRM corporativo.',
    uses: [
      'Consultar registros por SOQL pelo chat e resumir o resultado.',
      'Avisar o time quando um campo importante mudar num registro.',
      'Anexar arquivos a registros a partir de um fluxo.',
    ],
  },
  'self-hosted-llm': {
    about: 'Qualquer modelo de linguagem rodando no seu próprio servidor, por uma API compatível.',
    aliases: ['LLM próprio', 'LLM auto-hospedado'],
    uses: [
      'Usar o seu próprio modelo para resumir ou classificar textos dentro de um fluxo.',
      'Manter dados sensíveis na sua infraestrutura ao gerar respostas.',
      'Testar prompts no seu modelo antes de levar para produção.',
    ],
  },
  signalwire: {
    about: 'Plataforma de comunicações na nuvem para voz e SMS.',
    uses: [
      'Responder ligações com uma mensagem de voz automática.',
      'Enviar SMS de confirmação ou lembrete aos clientes.',
      'Registrar SMS e chamadas recebidas no CRM.',
    ],
  },
  smtp: {
    about: 'Protocolo padrão de envio de e-mail; vale para qualquer servidor de e-mail.',
    uses: [
      'Enviar e-mails pelo servidor da sua empresa a partir de um fluxo.',
      'Mandar notificações e relatórios com o seu remetente.',
      'Usar qualquer provedor de e-mail que ofereça SMTP.',
    ],
  },
  surveymonkey: {
    about: 'Plataforma de pesquisas e questionários online.',
    uses: [
      'Levar cada resposta concluída para uma planilha ou CRM.',
      'Avisar o time quando chegar uma resposta nova.',
      'Adicionar contatos à agenda de pesquisas a partir do CRM.',
    ],
  },
  telegram: {
    about: 'Aplicativo de mensagens com API de bots.',
    uses: [
      'Receber no Telegram alertas de vendas, erros ou leads novos.',
      'Criar um bot que responde quando alguém escreve para ele.',
      'Mandar relatórios diários para um grupo.',
    ],
  },
  'tiktok-ads': {
    about: 'Plataforma de anúncios do TikTok para empresas.',
    uses: [
      'Criar campanhas desligadas pelo chat e ligar depois de revisar.',
      'Receber o relatório diário de gasto, CTR, CPC e conversões.',
      'Desligar campanhas que passarem do custo definido.',
    ],
  },
  todoist: {
    about: 'Gerenciador de tarefas pessoal e de equipe.',
    uses: [
      'Criar uma tarefa no Todoist para cada e-mail que pede ação.',
      'Transformar itens combinados numa conversa do chat em tarefas.',
      'Ser avisado de tarefas novas num canal.',
    ],
  },
  trello: {
    about: 'Quadros kanban com listas e cartões.',
    uses: [
      'Criar um cartão no Trello para cada pedido de suporte.',
      'Levar bugs relatados no chat para a lista certa do quadro.',
      'Montar a pauta de conteúdo a partir de um formulário.',
    ],
  },
  twilio: {
    about: 'Plataforma de comunicações na nuvem para SMS, voz e mensagens.',
    uses: [
      'Enviar SMS de confirmação de pedido ou de agendamento.',
      'Registrar cada SMS recebido no CRM.',
      'Avisar o time quando um cliente responder por SMS.',
    ],
  },
  'x-twitter': {
    about: 'Rede social de posts curtos, antes chamada Twitter.',
    aliases: ['Twitter', 'X'],
    uses: [
      'Publicar no X cada post novo do blog.',
      'Ser avisado quando alguém citar a sua marca ou uma hashtag.',
      'Acompanhar novos seguidores e posts de perfis específicos.',
    ],
  },
  typeform: {
    about: 'Criador de formulários e pesquisas conversacionais.',
    uses: [
      'Levar cada resposta nova para o CRM como lead.',
      'Registrar as respostas numa planilha.',
      'Avisar o time no Slack quando alguém enviar o formulário.',
    ],
  },
  virtualq: {
    about: 'Sistema de fila virtual e retorno de chamadas para centrais de atendimento.',
    uses: [
      'Colocar um cliente na fila de retorno a partir de um formulário.',
      'Consultar e atualizar quem está esperando.',
      'Tirar alguém da fila quando o atendimento for resolvido por outro canal.',
    ],
  },
  'vtiger-crm': {
    about: 'CRM open source com vendas, suporte e marketing.',
    uses: [
      'Criar leads, contatos e oportunidades a partir do site.',
      'Avisar o time quando um chamado novo for aberto.',
      'Registrar faturas novas numa planilha financeira.',
    ],
  },
  wordpress: {
    about: 'Plataforma de sites e blogs mais usada do mundo.',
    uses: [
      'Publicar no WordPress um rascunho de post escrito no Vertal Chat.',
      'Divulgar cada post novo nas redes sociais.',
      'Ser avisado de comentários novos para moderar.',
    ],
  },
  xero: {
    about: 'Software de contabilidade online para pequenas empresas.',
    uses: [
      'Avisar o financeiro a cada pagamento recebido.',
      'Registrar transações bancárias novas numa planilha.',
      'Conferir recebimentos antes de liberar um pedido.',
    ],
  },
  'you-need-a-budget': {
    about: 'Aplicativo de orçamento pessoal (YNAB).',
    aliases: ['YNAB'],
    uses: [
      'Ser avisado quando uma categoria estourar o orçamento.',
      'Receber alerta de saldo baixo numa conta.',
      'Registrar transações novas numa planilha de controle.',
    ],
  },
  youtube: {
    about: 'Plataforma de vídeos do Google.',
    uses: [
      'Avisar no Discord ou no Telegram quando o seu canal publicar um vídeo.',
      'Acompanhar vídeos novos sobre um tema pela busca.',
      'Divulgar cada vídeo novo nas outras redes.',
    ],
  },
  zendesk: {
    about: 'Plataforma de atendimento ao cliente com tickets e central de ajuda.',
    uses: [
      'Abrir um ticket para cada e-mail ou formulário de suporte.',
      'Avisar o time técnico quando um ticket novo entrar numa visualização.',
      'Atualizar o status do ticket quando o problema for resolvido.',
    ],
  },
}
