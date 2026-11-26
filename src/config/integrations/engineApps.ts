// GERADO a partir das definições de apps do motor do Vertal Fluxos (ações e gatilhos,
// traduzidos para pt-BR) e dos clientes OAuth do Vertal (segredos FLUXOS_OAUTH_* das
// Edge Functions). Usado só nas páginas públicas /integracoes/<app> (SEO).
// auth: "vertal-oauth" = botão "Entrar com <App>" (cliente OAuth do Vertal);
//       "own-oauth" = login OAuth com o app (client ID/secret) do próprio usuário;
//       "fields" = formulário com chave/token/URL.
// Atualize quando o motor ganhar ações ou um cliente OAuth novo (docs/INTEGRACOES-SEO.md).
export interface EngineAppInfo {
  auth: 'vertal-oauth' | 'own-oauth' | 'fields'
  /** Campos que o usuário informa (rótulos em pt-BR). */
  fields: string[]
  /** [nome, descrição] */
  actions: [string, string][]
  triggers: [string, string][]
}

export const ENGINE_APPS: Record<string, EngineAppInfo> = {
  "airbrake": {
    "auth": "fields",
    "fields": [
      "User API key"
    ],
    "actions": [
      [
        "Listar erros",
        "Mostra os grupos de erro mais recentes, com mensagem, arquivo e quantidade."
      ],
      [
        "Silenciar ou reativar erro",
        "Para (ou volta) os avisos de um erro sem apagar o histórico."
      ]
    ],
    "triggers": [
      [
        "Novo erro",
        "Dispara quando um erro novo é registrado no projeto."
      ]
    ]
  },
  "airtable": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar registro",
        "Cria um registro novo na tabela, já com os campos preenchidos."
      ],
      [
        "Buscar registro",
        "Encontra um registro por campo ou por fórmula."
      ]
    ],
    "triggers": []
  },
  "amazon-ads": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret",
      "região"
    ],
    "actions": [
      [
        "Criar campanha Sponsored Products (pausada)",
        "Cria a campanha já pausada, com orçamento diário."
      ],
      [
        "Pausar ou ativar campanha",
        "Liga ou pausa uma campanha (ativar começa a gastar)."
      ],
      [
        "Pedir relatório de campanhas",
        "Gera relatório de gasto, cliques, impressões e vendas."
      ]
    ],
    "triggers": [
      [
        "Listar perfis de anúncio",
        "Perfis (um por marketplace/conta) que você administra."
      ],
      [
        "Listar campanhas",
        "Campanhas Sponsored Products com status e orçamento."
      ],
      [
        "Status do relatório",
        "Mostra o andamento e, pronto, o link de download."
      ]
    ]
  },
  "appwrite": {
    "auth": "fields",
    "fields": [
      "ID do projeto",
      "chave de API",
      "URL da instância",
      "host"
    ],
    "actions": [],
    "triggers": [
      [
        "Novo documento",
        "Dispara quando um documento é criado na coleção."
      ]
    ]
  },
  "asana": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar projeto",
        "Cria um projeto novo."
      ],
      [
        "Criar tarefa",
        "Cria uma tarefa nova."
      ],
      [
        "Buscar projeto",
        "Encontra um projeto existente."
      ],
      [
        "Buscar tarefa no projeto",
        "Encontra uma tarefa dentro de um projeto."
      ]
    ],
    "triggers": []
  },
  "better-stack": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Reconhecer incidente",
        "Marca o incidente como reconhecido."
      ],
      [
        "Criar incidente",
        "Abre um incidente e avisa o time."
      ],
      [
        "Buscar incidente",
        "Encontra um incidente."
      ],
      [
        "Resolver incidente",
        "Marca o incidente como resolvido."
      ]
    ],
    "triggers": []
  },
  "brave-search": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Busca na web",
        "Pesquisa na web e devolve os resultados."
      ]
    ],
    "triggers": []
  },
  "carbone": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Adicionar template",
        "Envia um template de documento para gerar relatórios."
      ]
    ],
    "triggers": []
  },
  "changedetection": {
    "auth": "fields",
    "fields": [
      "URL da instância",
      "chave de API"
    ],
    "actions": [
      [
        "Criar monitoramento",
        "Passa a vigiar mudanças em um site."
      ],
      [
        "Apagar monitoramento",
        "Remove um monitoramento."
      ]
    ],
    "triggers": [
      [
        "Mudança detectada",
        "Dispara quando a página vigiada muda."
      ]
    ]
  },
  "clickup": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar pasta",
        "Cria uma pasta nova."
      ],
      [
        "Criar lista",
        "Cria uma lista nova."
      ],
      [
        "Criar tarefa",
        "Cria uma tarefa nova."
      ],
      [
        "Buscar tarefa pelo ID",
        "Encontra uma tarefa pelo ID."
      ]
    ],
    "triggers": [
      [
        "Nova pasta",
        "Dispara quando uma pasta é criada."
      ],
      [
        "Nova lista",
        "Dispara quando uma lista é criada."
      ],
      [
        "Nova tarefa",
        "Dispara quando uma tarefa é criada."
      ],
      [
        "Tarefa atualizada",
        "Dispara quando uma tarefa muda."
      ]
    ]
  },
  "cloudflare": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Ler meu usuário",
        "Devolve id, e-mail e nome do usuário conectado."
      ],
      [
        "Listar contas",
        "Contas que a conexão acessa."
      ],
      [
        "Listar domínios (zonas)",
        "Domínios com status e name servers."
      ],
      [
        "Listar registros DNS",
        "Registros DNS de um domínio."
      ],
      [
        "Criar registro DNS",
        "Cria um registro A, AAAA, CNAME, TXT, MX, NS, SRV ou CAA."
      ],
      [
        "Listar Workers",
        "Scripts de Workers da conta."
      ],
      [
        "Listar projetos do Pages",
        "Projetos do Pages da conta."
      ],
      [
        "Limpar cache",
        "Limpa o cache do domínio inteiro ou de URLs específicas."
      ]
    ],
    "triggers": []
  },
  "deepl": {
    "auth": "fields",
    "fields": [
      "chave de autenticação"
    ],
    "actions": [
      [
        "Traduzir texto",
        "Traduz um texto de um idioma para outro."
      ]
    ],
    "triggers": []
  },
  "discord": {
    "auth": "own-oauth",
    "fields": [
      "consumer key",
      "consumer secret",
      "token do bot"
    ],
    "actions": [
      [
        "Criar evento agendado",
        "Cria um evento agendado no servidor."
      ],
      [
        "Enviar mensagem no canal",
        "Publica uma mensagem num canal do servidor."
      ],
      [
        "Atualizar evento agendado",
        "Altera um evento agendado existente."
      ]
    ],
    "triggers": []
  },
  "disqus": {
    "auth": "vertal-oauth",
    "fields": [
      "chave de API",
      "API secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Novo comentário",
        "Dispara quando alguém comenta no fórum."
      ],
      [
        "Comentário denunciado",
        "Dispara quando um comentário recebe uma denúncia."
      ]
    ]
  },
  "dropbox": {
    "auth": "vertal-oauth",
    "fields": [
      "app key",
      "app secret"
    ],
    "actions": [
      [
        "Criar pasta",
        "Cria uma pasta dentro da pasta escolhida."
      ],
      [
        "Criar arquivo de texto",
        "Cria um arquivo com o texto que você informar."
      ],
      [
        "Renomear arquivo",
        "Dá um novo nome a um arquivo."
      ]
    ],
    "triggers": [
      [
        "Novo arquivo na pasta",
        "Dispara quando um arquivo entra na pasta vigiada."
      ],
      [
        "Nova pasta",
        "Dispara quando uma pasta é criada."
      ]
    ]
  },
  "ebay": {
    "auth": "own-oauth",
    "fields": [
      "App ID (client ID)",
      "Cert ID (client secret)",
      "RuName",
      "ambiente"
    ],
    "actions": [
      [
        "Criar ou atualizar item do estoque",
        "Cadastra o produto pelo SKU: título, descrição, fotos, quantidade e condição."
      ],
      [
        "Criar local de estoque",
        "Cria o endereço de envio exigido antes de publicar ofertas."
      ],
      [
        "Criar oferta (rascunho)",
        "Cria um anúncio de preço fixo ainda não publicado."
      ],
      [
        "Publicar oferta",
        "Coloca a oferta no ar como anúncio (o eBay pode cobrar tarifas do vendedor)."
      ],
      [
        "Informar rastreio do pedido",
        "Marca o pedido como enviado, com transportadora e código."
      ]
    ],
    "triggers": [
      [
        "Novos pedidos",
        "Últimos pedidos da sua conta de vendedor."
      ],
      [
        "Listar itens do estoque",
        "Produtos do seu estoque, por SKU."
      ],
      [
        "Listar ofertas de um item",
        "Rascunhos e anúncios ativos de um item."
      ],
      [
        "Listar políticas da loja",
        "Políticas de envio, pagamento e devolução."
      ]
    ]
  },
  "eventbrite": {
    "auth": "vertal-oauth",
    "fields": [
      "chave de API",
      "client secret"
    ],
    "actions": [
      [
        "Criar evento",
        "Cria um evento novo."
      ],
      [
        "Publicar evento",
        "Publica um evento em rascunho."
      ]
    ],
    "triggers": [
      [
        "Check-in de participante",
        "Dispara quando o ingresso de alguém é lido na entrada."
      ],
      [
        "Nova inscrição",
        "Dispara quando alguém compra ou reserva ingresso."
      ],
      [
        "Novo evento publicado",
        "Dispara quando um evento da organização vai ao ar."
      ],
      [
        "Participante atualizado",
        "Dispara quando os dados de um participante mudam."
      ]
    ]
  },
  "facebook": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Publicar na Página",
        "Publica um post (texto e link opcional) numa Página que você administra."
      ],
      [
        "Publicar foto na Página",
        "Publica uma foto com legenda na Página."
      ]
    ],
    "triggers": [
      [
        "Listar minhas Páginas",
        "Páginas que você administra e as contas do Instagram ligadas a elas."
      ],
      [
        "Novos posts da Página",
        "Últimos posts de uma Página."
      ],
      [
        "Métricas da Página",
        "Engajamento e seguidores da Página no período."
      ]
    ]
  },
  "firefly-iii": {
    "auth": "own-oauth",
    "fields": [
      "URL da instância",
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar transação",
        "Lança uma despesa, receita ou transferência, com categoria e tags."
      ],
      [
        "Listar contas",
        "Mostra as contas com o saldo atual."
      ]
    ],
    "triggers": [
      [
        "Transação criada",
        "Dispara quando uma transação é lançada."
      ],
      [
        "Transação apagada",
        "Dispara quando uma transação é removida."
      ],
      [
        "Transação alterada",
        "Dispara quando uma transação é editada."
      ]
    ]
  },
  "flowers-software": {
    "auth": "fields",
    "fields": [
      "usuário",
      "senha",
      "chave de API"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova atividade",
        "Dispara a cada atividade nova."
      ]
    ]
  },
  "frappe": {
    "auth": "own-oauth",
    "fields": [
      "URL do site",
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar documento",
        "Cria um documento (qualquer DocType)."
      ],
      [
        "Apagar documento",
        "Remove um documento."
      ],
      [
        "Ler documento",
        "Busca um documento específico."
      ],
      [
        "Listar documentos",
        "Lista documentos de um DocType."
      ],
      [
        "Atualizar documento",
        "Altera um documento existente."
      ]
    ],
    "triggers": []
  },
  "freescout": {
    "auth": "fields",
    "fields": [
      "URL da instância",
      "chave de API"
    ],
    "actions": [
      [
        "Criar conversa",
        "Abre um atendimento no mailbox, como mensagem do cliente ou e-mail do agente."
      ],
      [
        "Responder conversa",
        "Envia uma resposta ao cliente ou adiciona uma nota interna."
      ],
      [
        "Mudar status ou responsável",
        "Fecha, deixa pendente ou passa o atendimento para outro agente."
      ],
      [
        "Listar conversas",
        "Mostra os atendimentos recentes por mailbox, status, cliente ou assunto."
      ]
    ],
    "triggers": [
      [
        "Novo evento",
        "Dispara a cada evento da central: conversa criada, resposta do cliente, nota, mudança de status e mais."
      ]
    ]
  },
  "ghost": {
    "auth": "fields",
    "fields": [
      "URL da instância",
      "chave da Admin API"
    ],
    "actions": [],
    "triggers": [
      [
        "Post publicado",
        "Dispara quando um post vai ao ar."
      ]
    ]
  },
  "gitea": {
    "auth": "own-oauth",
    "fields": [
      "URL da instância",
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar issue",
        "Abre uma issue nova."
      ]
    ],
    "triggers": [
      [
        "Nova issue",
        "Dispara quando uma issue é criada."
      ],
      [
        "Novo pull request",
        "Dispara quando um pull request é aberto."
      ],
      [
        "Nova estrela",
        "Dispara quando alguém dá estrela no repositório."
      ],
      [
        "Novo observador",
        "Dispara quando alguém acompanha o repositório."
      ]
    ]
  },
  "github": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar issue",
        "Abre uma issue nova no repositório escolhido."
      ]
    ],
    "triggers": [
      [
        "Nova issue",
        "Dispara quando uma issue é criada."
      ],
      [
        "Evento de pull request",
        "Dispara a cada evento de pull request (aberto, atualizado, fechado)."
      ],
      [
        "Novo pull request",
        "Dispara quando um pull request é aberto."
      ],
      [
        "Nova estrela no repositório",
        "Dispara quando alguém dá estrela num repositório."
      ],
      [
        "Novo observador",
        "Dispara quando alguém passa a acompanhar um repositório."
      ]
    ]
  },
  "gitlab": {
    "auth": "vertal-oauth",
    "fields": [
      "URL da instância",
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Issue confidencial",
        "Dispara quando uma issue confidencial é criada, alterada, fechada ou reaberta."
      ],
      [
        "Comentário confidencial",
        "Dispara a cada comentário confidencial em commits, merge requests, issues ou snippets."
      ],
      [
        "Deploy",
        "Dispara quando um deploy começa, conclui, falha ou é cancelado."
      ],
      [
        "Feature flag",
        "Dispara quando uma feature flag é ligada ou desligada."
      ],
      [
        "Issue",
        "Dispara quando uma issue é criada, alterada, fechada ou reaberta."
      ],
      [
        "Job de CI",
        "Dispara quando o status de um job muda."
      ],
      [
        "Merge request",
        "Dispara quando um merge request é aberto, alterado ou fechado."
      ],
      [
        "Comentário",
        "Dispara a cada comentário em commits, merge requests, issues ou snippets."
      ],
      [
        "Pipeline",
        "Dispara quando o status de uma pipeline muda."
      ],
      [
        "Push",
        "Dispara a cada push no repositório."
      ],
      [
        "Release",
        "Dispara quando uma release é criada ou alterada."
      ],
      [
        "Tag",
        "Dispara quando uma tag é criada ou apagada."
      ],
      [
        "Página da wiki",
        "Dispara quando uma página da wiki é criada, alterada ou apagada."
      ]
    ]
  },
  "gmail": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar rascunho",
        "Salva um e-mail novo como rascunho."
      ],
      [
        "Responder e-mail",
        "Responde a um e-mail recebido."
      ],
      [
        "Enviar e-mail",
        "Envia uma mensagem nova."
      ],
      [
        "Mover para a lixeira",
        "Manda um e-mail existente para a lixeira."
      ],
      [
        "Marcar com estrela",
        "Marca um e-mail com estrela."
      ]
    ],
    "triggers": [
      [
        "Novo e-mail",
        "Dispara quando chega um e-mail na caixa escolhida."
      ]
    ]
  },
  "google-admob": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [],
    "triggers": [
      [
        "Listar contas AdMob",
        "Contas de publisher (ID, moeda e fuso)."
      ],
      [
        "Listar apps",
        "Apps cadastrados na conta AdMob."
      ],
      [
        "Listar blocos de anúncio",
        "Blocos de anúncio com formato, app e ID."
      ]
    ]
  },
  "google-ads": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Pausar ou ativar campanha",
        "Pausa ou ativa uma campanha (ativar começa a gastar o orçamento)."
      ]
    ],
    "triggers": [
      [
        "Listar contas acessíveis",
        "Contas do Google Ads que você acessa, com moeda e tipo (gerente ou não)."
      ],
      [
        "Listar campanhas",
        "Campanhas com status, tipo de canal e orçamento diário."
      ],
      [
        "Relatório de desempenho",
        "Impressões, cliques, custo, conversões e CTR por campanha no período."
      ],
      [
        "Consulta GAQL (só leitura)",
        "Roda qualquer SELECT da linguagem de consulta do Google Ads (até 200 linhas)."
      ]
    ]
  },
  "google-adsense": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [],
    "triggers": [
      [
        "Listar contas AdSense",
        "Contas do AdSense (ID, nome, estado e fuso)."
      ],
      [
        "Listar sites",
        "Sites da conta com status de aprovação e anúncios automáticos."
      ],
      [
        "Listar blocos de anúncio",
        "Blocos de anúncio de todos os clientes da conta."
      ],
      [
        "Listar pagamentos",
        "Saldo em aberto e pagamentos anteriores."
      ],
      [
        "Relatório de ganhos",
        "Ganhos estimados, visualizações, impressões, cliques, RPM e CTR no período."
      ]
    ]
  },
  "google-calendar": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova agenda",
        "Dispara quando uma agenda é criada."
      ],
      [
        "Novo evento",
        "Dispara quando um evento é criado."
      ]
    ]
  },
  "google-docs": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar documento",
        "Cria um documento em branco ou cópia de outro, com conteúdo inicial opcional."
      ]
    ],
    "triggers": [
      [
        "Novo documento",
        "Dispara quando você cria um documento."
      ]
    ]
  },
  "google-drive": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Novo arquivo",
        "Dispara quando qualquer arquivo novo entra no Drive."
      ],
      [
        "Novo arquivo na pasta",
        "Dispara quando um arquivo entra numa pasta específica."
      ],
      [
        "Nova pasta",
        "Dispara quando uma pasta é criada dentro de outra."
      ],
      [
        "Arquivo alterado",
        "Dispara quando um arquivo da pasta muda."
      ]
    ]
  },
  "google-forms": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova resposta",
        "Dispara quando alguém envia o formulário."
      ]
    ]
  },
  "google-sheets": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar planilha",
        "Cria uma planilha em branco ou cópia de outra, com cabeçalhos opcionais."
      ],
      [
        "Adicionar linha",
        "Insere uma linha nova na planilha."
      ],
      [
        "Criar aba",
        "Cria uma aba nova, com cabeçalhos opcionais."
      ],
      [
        "Buscar aba",
        "Encontra uma aba pelo nome (e cria se não existir)."
      ]
    ],
    "triggers": [
      [
        "Nova linha",
        "Dispara quando uma linha é adicionada ao fim da planilha."
      ],
      [
        "Nova planilha",
        "Dispara quando você cria uma planilha."
      ],
      [
        "Nova aba",
        "Dispara quando uma aba é criada na planilha."
      ]
    ]
  },
  "google-tasks": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar tarefa",
        "Cria uma tarefa nova."
      ],
      [
        "Criar lista de tarefas",
        "Cria uma lista nova."
      ],
      [
        "Buscar tarefa",
        "Encontra uma tarefa específica."
      ],
      [
        "Atualizar tarefa",
        "Altera uma tarefa existente."
      ]
    ],
    "triggers": [
      [
        "Tarefa concluída",
        "Dispara quando uma tarefa da lista é concluída."
      ],
      [
        "Nova lista de tarefas",
        "Dispara quando uma lista é criada."
      ],
      [
        "Nova tarefa",
        "Dispara quando uma tarefa é criada."
      ]
    ]
  },
  "hubspot": {
    "auth": "own-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar contato",
        "Cria um contato no CRM."
      ],
      [
        "Atualizar contato",
        "Altera um contato existente."
      ]
    ],
    "triggers": []
  },
  "instagram": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Publicar foto",
        "Publica uma foto com legenda no feed."
      ],
      [
        "Publicar Reel",
        "Publica um Reel a partir de um vídeo MP4."
      ],
      [
        "Responder DM",
        "Responde uma mensagem direta (até 24 h depois da última mensagem do contato, regra da Meta)."
      ]
    ],
    "triggers": [
      [
        "Listar minhas contas",
        "Contas profissionais liberadas na conexão."
      ],
      [
        "Novas publicações",
        "Últimos posts da conta com curtidas e comentários."
      ],
      [
        "Métricas da conta",
        "Alcance e seguidores do último dia."
      ],
      [
        "Conversas de DM",
        "Últimas conversas com contato e última mensagem."
      ],
      [
        "Mensagens de uma conversa",
        "Últimas mensagens de uma DM."
      ]
    ]
  },
  "invoice-ninja": {
    "auth": "fields",
    "fields": [
      "token de API",
      "URL da instância (opcional)"
    ],
    "actions": [
      [
        "Criar cliente",
        "Cadastra um cliente."
      ],
      [
        "Criar fatura",
        "Emite uma fatura nova."
      ],
      [
        "Registrar pagamento",
        "Lança um pagamento recebido."
      ],
      [
        "Criar produto",
        "Cadastra um produto."
      ]
    ],
    "triggers": [
      [
        "Novo cliente",
        "Dispara quando um cliente é cadastrado."
      ],
      [
        "Novo crédito",
        "Dispara quando um crédito é lançado."
      ],
      [
        "Nova fatura",
        "Dispara quando uma fatura é criada."
      ],
      [
        "Novo pagamento",
        "Dispara quando um pagamento é lançado."
      ],
      [
        "Novo projeto",
        "Dispara quando um projeto é criado."
      ],
      [
        "Novo orçamento",
        "Dispara quando um orçamento é criado."
      ]
    ]
  },
  "jotform": {
    "auth": "fields",
    "fields": [
      "URL da API",
      "chave de API"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova resposta",
        "Dispara quando alguém envia o formulário."
      ]
    ]
  },
  "kwai-ads": {
    "auth": "own-oauth",
    "fields": [
      "App ID",
      "Secret ID"
    ],
    "actions": [],
    "triggers": [
      [
        "Listar contas de anúncio",
        "Contas de anúncio liberadas para o usuário."
      ],
      [
        "Consulta de relatório",
        "Roda um relatório da Marketing API (conta, campanha, conjunto, criativo)."
      ]
    ]
  },
  "libretranslate": {
    "auth": "fields",
    "fields": [
      "URL da instância",
      "chave de API"
    ],
    "actions": [
      [
        "Detectar idioma",
        "Descobre o idioma de um texto."
      ],
      [
        "Traduzir texto",
        "Traduz um texto."
      ]
    ],
    "triggers": []
  },
  "linkedin": {
    "auth": "own-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Ler meu perfil",
        "Devolve id, nome, e-mail e foto do membro conectado."
      ],
      [
        "Publicar post",
        "Publica um post de texto no seu perfil."
      ],
      [
        "Publicar post com link",
        "Compartilha um link (cartão de artigo) no seu perfil."
      ]
    ],
    "triggers": []
  },
  "mailchimp": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar campanha",
        "Cria o rascunho de uma campanha de e-mail."
      ],
      [
        "Enviar campanha",
        "Dispara uma campanha em rascunho."
      ]
    ],
    "triggers": [
      [
        "E-mail aberto",
        "Dispara quando um destinatário abre o e-mail de uma campanha."
      ],
      [
        "Novo inscrito",
        "Dispara quando alguém entra na audiência."
      ],
      [
        "Descadastro",
        "Dispara quando alguém sai da audiência."
      ]
    ]
  },
  "mailerlite": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [],
    "triggers": [
      [
        "Campanha enviada",
        "Dispara quando uma campanha é ativada."
      ],
      [
        "Denúncia de spam",
        "Dispara quando alguém marca o e-mail como spam."
      ],
      [
        "Novo inscrito",
        "Dispara quando alguém entra na lista."
      ],
      [
        "Descadastro",
        "Dispara quando alguém sai da lista."
      ]
    ]
  },
  "mattermost": {
    "auth": "own-oauth",
    "fields": [
      "URL da instância",
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Enviar mensagem no canal",
        "Publica uma mensagem no canal escolhido."
      ]
    ],
    "triggers": []
  },
  "meta-ads": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Criar campanha (pausada)",
        "Cria a campanha pausada: nada é gasto até você ativar."
      ],
      [
        "Pausar ou ativar campanha",
        "Muda o status da campanha (ativar começa a gastar)."
      ]
    ],
    "triggers": [
      [
        "Listar contas de anúncio",
        "Contas de anúncio que você acessa."
      ],
      [
        "Listar campanhas",
        "Campanhas da conta com status e orçamento."
      ],
      [
        "Relatório de desempenho",
        "Gasto, impressões, cliques, CTR, CPC e resultados por campanha, conjunto ou anúncio."
      ]
    ]
  },
  "microsoft-365": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Enviar arquivo ao OneDrive",
        "Cria ou substitui um arquivo (até 4 MB) a partir de texto ou de uma URL."
      ],
      [
        "Criar pasta no OneDrive",
        "Cria uma pasta dentro de outra."
      ],
      [
        "Criar tarefa no To Do",
        "Adiciona uma tarefa numa lista do Microsoft To Do."
      ],
      [
        "Concluir tarefa do To Do",
        "Marca uma tarefa como concluída."
      ]
    ],
    "triggers": [
      [
        "Listar arquivos do OneDrive",
        "Arquivos e pastas de uma pasta, mais recentes primeiro."
      ],
      [
        "Buscar no OneDrive",
        "Procura por nome e conteúdo dos arquivos."
      ],
      [
        "Listar listas do To Do",
        "Listas de tarefas do Microsoft To Do."
      ],
      [
        "Listar tarefas do To Do",
        "Tarefas de uma lista (abertas, por padrão)."
      ]
    ]
  },
  "microsoft-outlook": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Enviar e-mail",
        "Envia um e-mail pela conta do Outlook (fica em Itens Enviados)."
      ],
      [
        "Criar rascunho",
        "Salva o e-mail em Rascunhos sem enviar."
      ],
      [
        "Responder e-mail",
        "Responde a um e-mail na hora."
      ],
      [
        "Criar evento na agenda",
        "Cria um evento; os convidados recebem o convite."
      ]
    ],
    "triggers": [
      [
        "Listar ou buscar e-mails",
        "E-mails mais recentes, com busca e filtro de não lidos."
      ],
      [
        "Ler e-mail",
        "E-mail completo (corpo em texto)."
      ],
      [
        "Próximos eventos",
        "Eventos dos próximos dias, em ordem."
      ],
      [
        "Listar pastas",
        "Pastas de e-mail com total e não lidos."
      ],
      [
        "Listar agendas",
        "Agendas da conta."
      ]
    ]
  },
  "microsoft-teams": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Mensagem no canal",
        "Publica uma mensagem num canal do Teams como você."
      ],
      [
        "Mensagem no chat",
        "Envia uma mensagem num chat existente."
      ]
    ],
    "triggers": [
      [
        "Listar equipes",
        "Equipes das quais você participa."
      ],
      [
        "Listar canais",
        "Canais de uma equipe."
      ],
      [
        "Listar chats",
        "Chats recentes (1:1, grupo e reunião)."
      ]
    ]
  },
  "miro": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Copiar quadro",
        "Cria uma cópia de um quadro."
      ],
      [
        "Criar quadro",
        "Cria um quadro novo."
      ],
      [
        "Criar card no quadro",
        "Adiciona um card a um quadro existente."
      ]
    ],
    "triggers": []
  },
  "monday": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Criar quadro",
        "Cria um quadro novo."
      ],
      [
        "Criar coluna",
        "Adiciona uma coluna ao quadro."
      ],
      [
        "Criar item",
        "Cria um item no quadro, com subitens se quiser."
      ],
      [
        "Comentar no item",
        "Publica uma atualização (comentário) num item do quadro."
      ]
    ],
    "triggers": [
      [
        "Novo quadro",
        "Dispara quando um quadro é criado."
      ],
      [
        "Novo usuário",
        "Dispara quando alguém entra na conta."
      ]
    ]
  },
  "notion": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar item no banco de dados",
        "Cria um item numa database do Notion."
      ],
      [
        "Criar página",
        "Cria uma página dentro de outra."
      ],
      [
        "Buscar item no banco de dados",
        "Procura um item por propriedade."
      ],
      [
        "Atualizar item",
        "Altera um item da database."
      ]
    ],
    "triggers": [
      [
        "Novo item na database",
        "Dispara quando um item é criado."
      ],
      [
        "Item atualizado",
        "Dispara quando um item da database muda."
      ]
    ]
  },
  "ntfy": {
    "auth": "fields",
    "fields": [
      "URL do servidor",
      "usuário",
      "senha"
    ],
    "actions": [
      [
        "Enviar notificação",
        "Envia uma mensagem para o tópico escolhido."
      ]
    ],
    "triggers": []
  },
  "odoo": {
    "auth": "fields",
    "fields": [
      "host",
      "porta",
      "nome do banco",
      "e-mail",
      "chave de API"
    ],
    "actions": [
      [
        "Criar lead",
        "Cria um lead no CRM do Odoo."
      ]
    ],
    "triggers": []
  },
  "pdfmonkey": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Apagar documento",
        "Remove um documento gerado."
      ],
      [
        "Buscar documento",
        "Encontra um documento."
      ],
      [
        "Gerar documento",
        "Gera um PDF a partir de um template."
      ]
    ],
    "triggers": [
      [
        "PDF gerado",
        "Dispara quando a geração de um documento termina."
      ]
    ]
  },
  "pipedrive": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar atividade",
        "Cria uma atividade (ligação, reunião, tarefa)."
      ],
      [
        "Criar negócio",
        "Cria um negócio no funil."
      ],
      [
        "Criar lead",
        "Cria um lead."
      ],
      [
        "Criar nota",
        "Adiciona uma nota."
      ],
      [
        "Criar organização",
        "Cadastra uma empresa."
      ],
      [
        "Criar pessoa",
        "Cadastra um contato."
      ]
    ],
    "triggers": [
      [
        "Nova atividade",
        "Dispara quando uma atividade é criada."
      ],
      [
        "Novo negócio",
        "Dispara quando um negócio é criado."
      ],
      [
        "Novo lead",
        "Dispara quando um lead é criado."
      ],
      [
        "Nova nota",
        "Dispara quando uma nota é criada."
      ]
    ]
  },
  "placetel": {
    "auth": "fields",
    "fields": [
      "token de API"
    ],
    "actions": [],
    "triggers": [
      [
        "Chamada encerrada",
        "Dispara quando uma ligação termina."
      ]
    ]
  },
  "postgresql": {
    "auth": "fields",
    "fields": [
      "versão do PostgreSQL",
      "host",
      "porta",
      "nome do banco",
      "usuário do banco",
      "senha"
    ],
    "actions": [
      [
        "Apagar linhas",
        "Remove as linhas que casam com o filtro."
      ],
      [
        "Inserir linha",
        "Cria uma linha numa tabela."
      ],
      [
        "Consulta SQL",
        "Executa o comando SQL informado."
      ],
      [
        "Atualizar linhas",
        "Altera as linhas que casam com o filtro."
      ]
    ],
    "triggers": []
  },
  "pushover": {
    "auth": "fields",
    "fields": [
      "chave de usuário",
      "token de API"
    ],
    "actions": [
      [
        "Enviar notificação",
        "Manda um push para os seus aparelhos."
      ]
    ],
    "triggers": []
  },
  "reddit": {
    "auth": "own-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Publicar link",
        "Cria um post com link num subreddit."
      ]
    ],
    "triggers": [
      [
        "Novo post na busca",
        "Dispara quando surge um post com o termo buscado."
      ]
    ]
  },
  "removebg": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Remover fundo da imagem",
        "Tira o fundo de uma imagem."
      ]
    ],
    "triggers": []
  },
  "rss": {
    "auth": "fields",
    "fields": [],
    "actions": [],
    "triggers": [
      [
        "Novo item no feed",
        "Dispara a cada item novo do feed RSS."
      ]
    ]
  },
  "salesforce": {
    "auth": "vertal-oauth",
    "fields": [
      "ambiente (produção ou sandbox)",
      "consumer key",
      "consumer secret"
    ],
    "actions": [
      [
        "Criar anexo",
        "Anexa um arquivo a um registro."
      ],
      [
        "Executar consulta SOQL",
        "Roda uma consulta SOQL."
      ],
      [
        "Buscar registro por trecho",
        "Encontra um registro cujo campo contém o valor."
      ],
      [
        "Buscar registro",
        "Encontra um registro por campo e valor."
      ]
    ],
    "triggers": [
      [
        "Campo atualizado",
        "Dispara quando um campo muda num registro."
      ]
    ]
  },
  "self-hosted-llm": {
    "auth": "fields",
    "fields": [
      "URL da API",
      "chave de API"
    ],
    "actions": [
      [
        "Enviar prompt de chat",
        "Gera uma resposta de chat no seu modelo próprio."
      ],
      [
        "Enviar prompt",
        "Gera um texto no seu modelo próprio."
      ]
    ],
    "triggers": []
  },
  "signalwire": {
    "auth": "fields",
    "fields": [
      "ID do projeto",
      "token de API",
      "região",
      "nome do espaço"
    ],
    "actions": [
      [
        "Adicionar nó de voz XML",
        "Acrescenta um nó ao documento de voz."
      ],
      [
        "Responder com voz XML",
        "Responde a chamada com o documento de voz."
      ],
      [
        "Enviar SMS",
        "Envia um SMS."
      ]
    ],
    "triggers": [
      [
        "Chamada recebida",
        "Dispara quando chega uma ligação."
      ],
      [
        "SMS recebido",
        "Dispara quando chega um SMS."
      ]
    ]
  },
  "slack": {
    "auth": "vertal-oauth",
    "fields": [
      "chave de API",
      "API secret"
    ],
    "actions": [
      [
        "Buscar mensagem",
        "Encontra uma mensagem pela busca do workspace."
      ],
      [
        "Buscar usuário por e-mail",
        "Encontra um membro do workspace pelo e-mail."
      ],
      [
        "Enviar mensagem direta",
        "Manda uma DM para um membro (ou para você)."
      ],
      [
        "Enviar mensagem no canal",
        "Publica uma mensagem no canal escolhido."
      ]
    ],
    "triggers": []
  },
  "smtp": {
    "auth": "fields",
    "fields": [
      "host",
      "e-mail ou usuário",
      "senha",
      "porta"
    ],
    "actions": [
      [
        "Enviar e-mail",
        "Envia um e-mail pelo seu servidor SMTP."
      ]
    ],
    "triggers": []
  },
  "spotify": {
    "auth": "own-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar playlist",
        "Cria uma playlist na sua conta."
      ]
    ],
    "triggers": []
  },
  "stripe": {
    "auth": "fields",
    "fields": [
      "chave secreta",
      "nome da conta"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova transação de saldo",
        "Dispara a cada transação processada (reembolso, repasse, ajuste…)."
      ],
      [
        "Novo repasse",
        "Dispara quando um repasse para a conta bancária é atualizado."
      ]
    ]
  },
  "surveymonkey": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar contato",
        "Adiciona um contato à agenda de pesquisas."
      ]
    ],
    "triggers": [
      [
        "Nova resposta",
        "Dispara quando alguém conclui a pesquisa."
      ]
    ]
  },
  "telegram-bot": {
    "auth": "fields",
    "fields": [
      "token do bot"
    ],
    "actions": [
      [
        "Enviar mensagem",
        "Manda uma mensagem para o chat escolhido."
      ]
    ],
    "triggers": [
      [
        "Nova mensagem",
        "Dispara quando alguém escreve para o bot."
      ]
    ]
  },
  "tiktok-ads": {
    "auth": "own-oauth",
    "fields": [
      "App ID",
      "Secret"
    ],
    "actions": [
      [
        "Criar campanha (desligada)",
        "Cria a campanha desligada: nada é gasto até você ligar."
      ],
      [
        "Ligar ou desligar campanha",
        "Liga ou desliga uma campanha (ligar começa a gastar)."
      ]
    ],
    "triggers": [
      [
        "Listar contas de anúncio",
        "Contas de anúncio autorizadas."
      ],
      [
        "Listar campanhas",
        "Campanhas da conta com status e orçamento."
      ],
      [
        "Relatório de desempenho",
        "Gasto, impressões, cliques, CTR, CPC e conversões por campanha, por dia."
      ]
    ]
  },
  "todoist": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar tarefa",
        "Cria uma tarefa no Todoist."
      ]
    ],
    "triggers": [
      [
        "Tarefas ativas",
        "Dispara quando surgem tarefas novas."
      ]
    ]
  },
  "trello": {
    "auth": "own-oauth",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Criar cartão",
        "Cria um cartão no quadro e na lista escolhidos."
      ]
    ],
    "triggers": []
  },
  "twilio": {
    "auth": "fields",
    "fields": [
      "Account SID",
      "token de autenticação"
    ],
    "actions": [
      [
        "Enviar SMS",
        "Envia um SMS."
      ]
    ],
    "triggers": [
      [
        "SMS recebido",
        "Dispara quando chega um SMS."
      ]
    ]
  },
  "twitter": {
    "auth": "vertal-oauth",
    "fields": [
      "chave de API",
      "API secret"
    ],
    "actions": [
      [
        "Publicar post",
        "Publica um post no X."
      ],
      [
        "Buscar usuário",
        "Procura um perfil no X."
      ]
    ],
    "triggers": [
      [
        "Meus posts",
        "Dispara quando você publica algo."
      ],
      [
        "Novo seguidor",
        "Dispara quando alguém passa a te seguir."
      ],
      [
        "Busca de posts",
        "Dispara quando surge um post com a palavra, frase, perfil ou hashtag."
      ],
      [
        "Posts de um perfil",
        "Dispara quando um perfil específico publica."
      ]
    ]
  },
  "typeform": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova resposta",
        "Dispara quando alguém envia o formulário."
      ]
    ]
  },
  "virtualq": {
    "auth": "fields",
    "fields": [
      "chave de API"
    ],
    "actions": [
      [
        "Entrar na fila",
        "Coloca uma pessoa na fila escolhida."
      ],
      [
        "Sair da fila",
        "Cancela a espera e tira a pessoa da fila."
      ],
      [
        "Ver espera",
        "Mostra os dados de quem está na fila."
      ],
      [
        "Atualizar espera",
        "Altera os dados de quem está na fila."
      ]
    ],
    "triggers": []
  },
  "vtiger-crm": {
    "auth": "fields",
    "fields": [
      "usuário",
      "chave de acesso",
      "URL da instância"
    ],
    "actions": [
      [
        "Criar chamado",
        "Abre um chamado."
      ],
      [
        "Criar contato",
        "Cadastra um contato."
      ],
      [
        "Criar lead",
        "Cadastra um lead."
      ],
      [
        "Criar oportunidade",
        "Cria uma oportunidade de venda."
      ],
      [
        "Criar tarefa",
        "Cria uma tarefa."
      ]
    ],
    "triggers": [
      [
        "Novo chamado",
        "Dispara quando um chamado é aberto."
      ],
      [
        "Novo contato",
        "Dispara quando um contato é criado."
      ],
      [
        "Nova fatura",
        "Dispara quando uma fatura é criada."
      ],
      [
        "Novo lead",
        "Dispara quando um lead é criado."
      ],
      [
        "Nova oportunidade",
        "Dispara quando uma oportunidade é criada."
      ],
      [
        "Nova tarefa",
        "Dispara quando uma tarefa é criada."
      ]
    ]
  },
  "whatsapp": {
    "auth": "vertal-oauth",
    "fields": [],
    "actions": [
      [
        "Enviar template",
        "Envia uma mensagem de template aprovado (vale fora da janela de 24 h)."
      ],
      [
        "Enviar texto",
        "Envia texto livre (até 24 h depois da última mensagem do cliente)."
      ]
    ],
    "triggers": [
      [
        "Listar números",
        "Números das contas do WhatsApp Business conectadas."
      ],
      [
        "Listar templates",
        "Templates de mensagem e o status de aprovação."
      ]
    ]
  },
  "wordpress": {
    "auth": "own-oauth",
    "fields": [
      "endereço do site WordPress"
    ],
    "actions": [
      [
        "Criar post",
        "Cria um post."
      ],
      [
        "Criar usuário",
        "Cadastra um usuário no site."
      ],
      [
        "Apagar post",
        "Remove um post."
      ],
      [
        "Buscar post",
        "Encontra um post pelo título."
      ],
      [
        "Atualizar post",
        "Altera um post."
      ]
    ],
    "triggers": [
      [
        "Novo comentário",
        "Dispara quando alguém comenta."
      ],
      [
        "Nova página",
        "Dispara quando uma página é criada."
      ],
      [
        "Novo post",
        "Dispara quando um post é criado."
      ]
    ]
  },
  "xero": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Nova transação bancária",
        "Dispara a cada transação bancária nova."
      ],
      [
        "Novo pagamento",
        "Dispara quando um pagamento é recebido."
      ]
    ]
  },
  "you-need-a-budget": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Categoria estourada",
        "Dispara quando uma categoria passa do orçamento."
      ],
      [
        "Meta concluída",
        "Dispara quando uma meta é atingida."
      ],
      [
        "Saldo baixo",
        "Dispara quando o saldo de uma conta cai abaixo do valor definido."
      ],
      [
        "Nova transação",
        "Dispara quando uma transação é lançada."
      ]
    ]
  },
  "youtube": {
    "auth": "vertal-oauth",
    "fields": [
      "client ID",
      "client secret"
    ],
    "actions": [],
    "triggers": [
      [
        "Novo vídeo na busca",
        "Dispara quando sai um vídeo que casa com a busca."
      ],
      [
        "Novo vídeo no canal",
        "Dispara quando um canal publica um vídeo."
      ]
    ]
  },
  "zendesk": {
    "auth": "own-oauth",
    "fields": [
      "subdomínio do Zendesk",
      "client ID",
      "client secret"
    ],
    "actions": [
      [
        "Criar ticket",
        "Abre um ticket."
      ],
      [
        "Criar usuário",
        "Cadastra um usuário."
      ],
      [
        "Apagar ticket",
        "Remove um ticket."
      ],
      [
        "Apagar usuário",
        "Remove um usuário."
      ],
      [
        "Buscar ticket",
        "Encontra um ticket."
      ],
      [
        "Atualizar ticket",
        "Muda o status ou adiciona comentários."
      ]
    ],
    "triggers": [
      [
        "Novo ticket",
        "Dispara quando um ticket entra numa visualização."
      ],
      [
        "Novo usuário",
        "Dispara quando um usuário é criado."
      ]
    ]
  }
}
