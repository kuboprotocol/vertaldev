/**
 * Texts for the developer MCP page, in each supported language.
 * Keep every key in all three languages; the type checks that they match.
 */

export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const dictionaries = {
  'pt-BR': {
    title: 'MCP para desenvolvedores',
    intro: 'Conecte suas ferramentas de IA ao Knowledge Book da Vertal. Crie uma chave, copie a configuração e pronto.',
    keysTitle: '1. Crie sua chave',
    keyName: 'Nome da chave',
    keyNamePlaceholder: 'Ex.: Meu editor',
    permissionRead: 'Ler (buscar e consultar)',
    permissionWrite: 'Escrever (classificar e validar)',
    expiry: 'Validade',
    expiryNever: 'Sem validade',
    expiry30: '30 dias',
    expiry90: '90 dias',
    expiry365: '1 ano',
    create: 'Criar chave',
    creating: 'Criando…',
    keyOnceTitle: 'Copie sua chave agora',
    keyOnceBody: 'Ela só é mostrada uma vez. Se perder, revogue e crie outra.',
    copy: 'Copiar',
    copied: 'Copiado',
    yourKeys: 'Suas chaves',
    noKeys: 'Você ainda não criou nenhuma chave.',
    revoke: 'Revogar',
    revoked: 'Revogada',
    active: 'Ativa',
    lastUsed: 'Último uso',
    never: 'nunca',
    configTitle: '2. Configure sua ferramenta de IA',
    configBody: 'Use o endereço do servidor e a chave criada acima.',
    toolsTitle: '3. O que você pode fazer',
    tools: {
      search_knowledge: 'Buscar conhecimento',
      search_knowledge_by_tags: 'Buscar por tags',
      get_related_knowledge: 'Ver itens relacionados',
      get_trending_tags: 'Ver tags em alta',
      list_knowledge_needing_review: 'Listar itens para revisão',
      list_high_confidence_knowledge: 'Listar itens de alta confiança',
      get_embedding_stats: 'Ver cobertura de embeddings',
      give_knowledge_feedback: 'Enviar feedback',
      classify_knowledge: 'Classificar conhecimento (escrita)',
      validate_knowledge: 'Validar conhecimento (escrita)',
    },
    signIn: 'Entrar',
    signInNotice: 'Entre na sua conta para criar chaves.',
    apiMissing: 'Endereço da API não configurado. Avise o time técnico.',
    errorGeneric: 'Não foi possível concluir. Tente de novo.',
    errorLimit: 'Sua organização já tem o máximo de chaves ativas.',
    errorForbidden: 'Sua conta não pode gerenciar chaves nesta organização.',
    languageLabel: 'Idioma',
  },
  en: {
    title: 'Developer MCP',
    intro: 'Connect your AI tools to the Vertal Knowledge Book. Create a key, copy the configuration, done.',
    keysTitle: '1. Create your key',
    keyName: 'Key name',
    keyNamePlaceholder: 'e.g. My editor',
    permissionRead: 'Read (search and look up)',
    permissionWrite: 'Write (classify and validate)',
    expiry: 'Expiry',
    expiryNever: 'Never expires',
    expiry30: '30 days',
    expiry90: '90 days',
    expiry365: '1 year',
    create: 'Create key',
    creating: 'Creating…',
    keyOnceTitle: 'Copy your key now',
    keyOnceBody: 'It is shown only once. If you lose it, revoke it and create another.',
    copy: 'Copy',
    copied: 'Copied',
    yourKeys: 'Your keys',
    noKeys: 'You have not created any keys yet.',
    revoke: 'Revoke',
    revoked: 'Revoked',
    active: 'Active',
    lastUsed: 'Last used',
    never: 'never',
    configTitle: '2. Configure your AI tool',
    configBody: 'Use the server address and the key created above.',
    toolsTitle: '3. What you can do',
    tools: {
      search_knowledge: 'Search knowledge',
      search_knowledge_by_tags: 'Search by tags',
      get_related_knowledge: 'See related items',
      get_trending_tags: 'See trending tags',
      list_knowledge_needing_review: 'List items needing review',
      list_high_confidence_knowledge: 'List high-confidence items',
      get_embedding_stats: 'See embedding coverage',
      give_knowledge_feedback: 'Send feedback',
      classify_knowledge: 'Classify knowledge (write)',
      validate_knowledge: 'Validate knowledge (write)',
    },
    signIn: 'Sign in',
    signInNotice: 'Sign in to create keys.',
    apiMissing: 'API address is not configured. Please tell the technical team.',
    errorGeneric: 'Could not complete. Please try again.',
    errorLimit: 'Your organization already has the maximum number of active keys.',
    errorForbidden: 'Your account cannot manage keys in this organization.',
    languageLabel: 'Language',
  },
  es: {
    title: 'MCP para desarrolladores',
    intro: 'Conecta tus herramientas de IA al Knowledge Book de Vertal. Crea una clave, copia la configuración y listo.',
    keysTitle: '1. Crea tu clave',
    keyName: 'Nombre de la clave',
    keyNamePlaceholder: 'Ej.: Mi editor',
    permissionRead: 'Leer (buscar y consultar)',
    permissionWrite: 'Escribir (clasificar y validar)',
    expiry: 'Validez',
    expiryNever: 'Sin vencimiento',
    expiry30: '30 días',
    expiry90: '90 días',
    expiry365: '1 año',
    create: 'Crear clave',
    creating: 'Creando…',
    keyOnceTitle: 'Copia tu clave ahora',
    keyOnceBody: 'Solo se muestra una vez. Si la pierdes, revócala y crea otra.',
    copy: 'Copiar',
    copied: 'Copiado',
    yourKeys: 'Tus claves',
    noKeys: 'Todavía no has creado ninguna clave.',
    revoke: 'Revocar',
    revoked: 'Revocada',
    active: 'Activa',
    lastUsed: 'Último uso',
    never: 'nunca',
    configTitle: '2. Configura tu herramienta de IA',
    configBody: 'Usa la dirección del servidor y la clave creada arriba.',
    toolsTitle: '3. Qué puedes hacer',
    tools: {
      search_knowledge: 'Buscar conocimiento',
      search_knowledge_by_tags: 'Buscar por etiquetas',
      get_related_knowledge: 'Ver elementos relacionados',
      get_trending_tags: 'Ver etiquetas en tendencia',
      list_knowledge_needing_review: 'Listar elementos para revisar',
      list_high_confidence_knowledge: 'Listar elementos de alta confianza',
      get_embedding_stats: 'Ver cobertura de embeddings',
      give_knowledge_feedback: 'Enviar comentarios',
      classify_knowledge: 'Clasificar conocimiento (escritura)',
      validate_knowledge: 'Validar conocimiento (escritura)',
    },
    signIn: 'Iniciar sesión',
    signInNotice: 'Inicia sesión para crear claves.',
    apiMissing: 'La dirección de la API no está configurada. Avisa al equipo técnico.',
    errorGeneric: 'No se pudo completar. Inténtalo de nuevo.',
    errorLimit: 'Tu organización ya tiene el máximo de claves activas.',
    errorForbidden: 'Tu cuenta no puede gestionar claves en esta organización.',
    languageLabel: 'Idioma',
  },
};

type Texts = typeof dictionaries['pt-BR'];

/** Each language must match the pt-BR shape, so a missing or extra key is a compile error. */
const checked: Record<Locale, Texts> = dictionaries;

export const LOCALE_STORAGE_KEY = 'vertal.locale';

/** Saved choice, then the browser languages, then English. */
export function resolveLocale(
  saved: string | null,
  browserLanguages: readonly string[] = []
): Locale {
  const candidates = [saved, ...browserLanguages].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
    const language = candidate.split('-')[0].toLowerCase();
    const byLanguage = SUPPORTED_LOCALES.find((locale) => locale.split('-')[0] === language);
    if (byLanguage) return byLanguage;
  }
  return 'en';
}

export function getTexts(locale: Locale): Texts {
  return checked[locale];
}
