// Fusos horários do Vertal Clock: catálogo de cidades, busca e contas de horário.
//
// Módulo puro (só usa Intl, sem DOM): serve o painel, o Vertal Chat e o widget
// incorporável. As regras de fuso e horário de verão vêm do próprio navegador
// (banco IANA), então não há tabela de offsets para manter aqui.

export interface City {
  /** Identificador IANA, ex.: "America/Sao_Paulo". */
  tz: string;
  city: string;
  country: string;
  /** Código ISO de 2 letras do país (bandeira). */
  cc: string;
  /** Outros nomes pelos quais a cidade é procurada (sem acento, minúsculas). */
  aliases?: string[];
}

type Row = [tz: string, city: string, country: string, cc: string, aliases?: string];

// Cidade principal de cada fuso primeiro: é ela que responde pela busca do país.
const ROWS: Row[] = [
  // Brasil
  ['America/Sao_Paulo', 'Brasília', 'Brasil', 'BR', 'brasil,brazil,horario de brasilia,hora de brasilia,brasilia time,brt,df'],
  ['America/Sao_Paulo', 'São Paulo', 'Brasil', 'BR', 'sp,sampa'],
  ['America/Sao_Paulo', 'Rio de Janeiro', 'Brasil', 'BR', 'rio,rj'],
  ['America/Sao_Paulo', 'Belo Horizonte', 'Brasil', 'BR', 'bh,minas gerais'],
  ['America/Sao_Paulo', 'Curitiba', 'Brasil', 'BR', 'parana'],
  ['America/Sao_Paulo', 'Porto Alegre', 'Brasil', 'BR', 'rio grande do sul'],
  ['America/Sao_Paulo', 'Florianópolis', 'Brasil', 'BR', 'floripa,santa catarina'],
  ['America/Sao_Paulo', 'Goiânia', 'Brasil', 'BR', 'goias'],
  ['America/Bahia', 'Salvador', 'Brasil', 'BR', 'bahia'],
  ['America/Recife', 'Recife', 'Brasil', 'BR', 'pernambuco'],
  ['America/Fortaleza', 'Fortaleza', 'Brasil', 'BR', 'ceara'],
  ['America/Belem', 'Belém', 'Brasil', 'BR', 'para'],
  ['America/Manaus', 'Manaus', 'Brasil', 'BR', 'amazonas'],
  ['America/Cuiaba', 'Cuiabá', 'Brasil', 'BR', 'mato grosso'],
  ['America/Campo_Grande', 'Campo Grande', 'Brasil', 'BR', 'mato grosso do sul'],
  ['America/Porto_Velho', 'Porto Velho', 'Brasil', 'BR', 'rondonia'],
  ['America/Boa_Vista', 'Boa Vista', 'Brasil', 'BR', 'roraima'],
  ['America/Rio_Branco', 'Rio Branco', 'Brasil', 'BR', 'acre,ac,hora do acre'],
  ['America/Noronha', 'Fernando de Noronha', 'Brasil', 'BR', 'noronha'],
  // América do Norte
  ['America/New_York', 'Nova York', 'Estados Unidos', 'US', 'new york,nova iorque,ny,nyc,eua,usa,estados unidos,united states,est,edt,eastern'],
  ['America/New_York', 'Washington', 'Estados Unidos', 'US', 'washington dc,dc'],
  ['America/New_York', 'Miami', 'Estados Unidos', 'US', 'florida,orlando'],
  ['America/New_York', 'Boston', 'Estados Unidos', 'US'],
  ['America/New_York', 'Atlanta', 'Estados Unidos', 'US'],
  ['America/Chicago', 'Chicago', 'Estados Unidos', 'US', 'cst,cdt,central'],
  ['America/Chicago', 'Houston', 'Estados Unidos', 'US', 'texas,dallas,austin'],
  ['America/Denver', 'Denver', 'Estados Unidos', 'US', 'mst,mdt,mountain,colorado'],
  ['America/Phoenix', 'Phoenix', 'Estados Unidos', 'US', 'arizona'],
  ['America/Los_Angeles', 'Los Angeles', 'Estados Unidos', 'US', 'la,california,pst,pdt,pacific,hollywood'],
  ['America/Los_Angeles', 'Las Vegas', 'Estados Unidos', 'US', 'vegas,nevada'],
  ['America/Los_Angeles', 'São Francisco', 'Estados Unidos', 'US', 'san francisco,sf,vale do silicio,silicon valley'],
  ['America/Los_Angeles', 'Seattle', 'Estados Unidos', 'US'],
  ['America/Anchorage', 'Anchorage', 'Estados Unidos', 'US', 'alasca,alaska'],
  ['Pacific/Honolulu', 'Honolulu', 'Estados Unidos', 'US', 'havai,hawaii'],
  ['America/Toronto', 'Toronto', 'Canadá', 'CA', 'canada,ottawa'],
  ['America/Toronto', 'Montreal', 'Canadá', 'CA', 'quebec'],
  ['America/Vancouver', 'Vancouver', 'Canadá', 'CA'],
  ['America/Edmonton', 'Calgary', 'Canadá', 'CA', 'edmonton,alberta'],
  ['America/Halifax', 'Halifax', 'Canadá', 'CA'],
  ['America/Mexico_City', 'Cidade do México', 'México', 'MX', 'mexico,mexico city,cdmx'],
  ['America/Cancun', 'Cancún', 'México', 'MX', 'cancun'],
  // América Central e Caribe
  ['America/Panama', 'Cidade do Panamá', 'Panamá', 'PA', 'panama'],
  ['America/Costa_Rica', 'San José', 'Costa Rica', 'CR', 'costa rica'],
  ['America/Guatemala', 'Cidade da Guatemala', 'Guatemala', 'GT', 'guatemala'],
  ['America/Havana', 'Havana', 'Cuba', 'CU', 'cuba'],
  ['America/Santo_Domingo', 'Santo Domingo', 'República Dominicana', 'DO', 'republica dominicana,punta cana'],
  ['America/Puerto_Rico', 'San Juan', 'Porto Rico', 'PR', 'porto rico,puerto rico'],
  ['America/Jamaica', 'Kingston', 'Jamaica', 'JM', 'jamaica'],
  // América do Sul
  ['America/Argentina/Buenos_Aires', 'Buenos Aires', 'Argentina', 'AR', 'argentina'],
  ['America/Santiago', 'Santiago', 'Chile', 'CL', 'chile'],
  ['America/Montevideo', 'Montevidéu', 'Uruguai', 'UY', 'uruguai,uruguay,montevideo'],
  ['America/Asuncion', 'Assunção', 'Paraguai', 'PY', 'paraguai,paraguay,asuncion'],
  ['America/La_Paz', 'La Paz', 'Bolívia', 'BO', 'bolivia'],
  ['America/Lima', 'Lima', 'Peru', 'PE', 'peru'],
  ['America/Bogota', 'Bogotá', 'Colômbia', 'CO', 'colombia,medellin'],
  ['America/Guayaquil', 'Quito', 'Equador', 'EC', 'equador,ecuador,guayaquil'],
  ['America/Caracas', 'Caracas', 'Venezuela', 'VE', 'venezuela'],
  // Europa
  ['Europe/London', 'Londres', 'Reino Unido', 'GB', 'london,inglaterra,england,reino unido,uk,united kingdom,gmt,bst'],
  ['Europe/Dublin', 'Dublin', 'Irlanda', 'IE', 'irlanda,ireland'],
  ['Europe/Lisbon', 'Lisboa', 'Portugal', 'PT', 'portugal,lisbon,porto'],
  ['Atlantic/Azores', 'Ponta Delgada', 'Portugal', 'PT', 'acores,azores'],
  ['Europe/Madrid', 'Madri', 'Espanha', 'ES', 'madrid,espanha,spain,barcelona'],
  ['Europe/Paris', 'Paris', 'França', 'FR', 'franca,france'],
  ['Europe/Brussels', 'Bruxelas', 'Bélgica', 'BE', 'belgica,belgium,brussels'],
  ['Europe/Amsterdam', 'Amsterdã', 'Países Baixos', 'NL', 'amsterdam,holanda,netherlands,paises baixos'],
  ['Europe/Berlin', 'Berlim', 'Alemanha', 'DE', 'berlin,alemanha,germany,munique,frankfurt,cet,cest'],
  ['Europe/Zurich', 'Zurique', 'Suíça', 'CH', 'zurich,suica,switzerland,genebra'],
  ['Europe/Rome', 'Roma', 'Itália', 'IT', 'rome,italia,italy,milao,milan'],
  ['Europe/Vienna', 'Viena', 'Áustria', 'AT', 'vienna,austria'],
  ['Europe/Prague', 'Praga', 'Tchéquia', 'CZ', 'prague,republica tcheca,tchequia,czechia'],
  ['Europe/Warsaw', 'Varsóvia', 'Polônia', 'PL', 'warsaw,polonia,poland'],
  ['Europe/Budapest', 'Budapeste', 'Hungria', 'HU', 'budapest,hungria,hungary'],
  ['Europe/Copenhagen', 'Copenhague', 'Dinamarca', 'DK', 'copenhagen,dinamarca,denmark'],
  ['Europe/Stockholm', 'Estocolmo', 'Suécia', 'SE', 'stockholm,suecia,sweden'],
  ['Europe/Oslo', 'Oslo', 'Noruega', 'NO', 'noruega,norway'],
  ['Europe/Helsinki', 'Helsinque', 'Finlândia', 'FI', 'helsinki,finlandia,finland'],
  ['Atlantic/Reykjavik', 'Reykjavik', 'Islândia', 'IS', 'islandia,iceland'],
  ['Europe/Athens', 'Atenas', 'Grécia', 'GR', 'athens,grecia,greece'],
  ['Europe/Bucharest', 'Bucareste', 'Romênia', 'RO', 'bucharest,romenia,romania'],
  ['Europe/Kyiv', 'Kiev', 'Ucrânia', 'UA', 'kyiv,ucrania,ukraine'],
  ['Europe/Istanbul', 'Istambul', 'Turquia', 'TR', 'istanbul,turquia,turkey,turkiye'],
  ['Europe/Moscow', 'Moscou', 'Rússia', 'RU', 'moscow,russia'],
  // África
  ['Africa/Casablanca', 'Casablanca', 'Marrocos', 'MA', 'marrocos,morocco'],
  ['Africa/Lagos', 'Lagos', 'Nigéria', 'NG', 'nigeria'],
  ['Africa/Accra', 'Acra', 'Gana', 'GH', 'accra,gana,ghana'],
  ['Africa/Cairo', 'Cairo', 'Egito', 'EG', 'egito,egypt'],
  ['Africa/Luanda', 'Luanda', 'Angola', 'AO', 'angola'],
  ['Africa/Maputo', 'Maputo', 'Moçambique', 'MZ', 'mocambique,mozambique'],
  ['Atlantic/Cape_Verde', 'Praia', 'Cabo Verde', 'CV', 'cabo verde,cape verde'],
  ['Africa/Nairobi', 'Nairóbi', 'Quênia', 'KE', 'nairobi,quenia,kenya'],
  ['Africa/Addis_Ababa', 'Adis Abeba', 'Etiópia', 'ET', 'addis ababa,etiopia,ethiopia'],
  ['Africa/Johannesburg', 'Joanesburgo', 'África do Sul', 'ZA', 'johannesburg,africa do sul,south africa,cidade do cabo,cape town'],
  // Oriente Médio
  ['Asia/Jerusalem', 'Jerusalém', 'Israel', 'IL', 'jerusalem,israel,tel aviv'],
  ['Asia/Riyadh', 'Riade', 'Arábia Saudita', 'SA', 'riyadh,arabia saudita,saudi arabia'],
  ['Asia/Qatar', 'Doha', 'Catar', 'QA', 'catar,qatar'],
  ['Asia/Dubai', 'Dubai', 'Emirados Árabes Unidos', 'AE', 'emirados,uae,abu dhabi'],
  ['Asia/Tehran', 'Teerã', 'Irã', 'IR', 'tehran,ira,iran'],
  // Ásia
  ['Asia/Karachi', 'Karachi', 'Paquistão', 'PK', 'paquistao,pakistan'],
  ['Asia/Kolkata', 'Nova Délhi', 'Índia', 'IN', 'new delhi,delhi,india,mumbai,bangalore,bengaluru,ist'],
  ['Asia/Dhaka', 'Daca', 'Bangladesh', 'BD', 'dhaka,bangladesh'],
  ['Asia/Kathmandu', 'Katmandu', 'Nepal', 'NP', 'kathmandu,nepal'],
  ['Asia/Almaty', 'Almaty', 'Cazaquistão', 'KZ', 'cazaquistao,kazakhstan'],
  ['Asia/Bangkok', 'Bangkok', 'Tailândia', 'TH', 'tailandia,thailand'],
  ['Asia/Ho_Chi_Minh', 'Ho Chi Minh', 'Vietnã', 'VN', 'vietna,vietnam,saigon,hanoi'],
  ['Asia/Jakarta', 'Jacarta', 'Indonésia', 'ID', 'jakarta,indonesia'],
  ['Asia/Makassar', 'Bali', 'Indonésia', 'ID', 'denpasar'],
  ['Asia/Singapore', 'Singapura', 'Singapura', 'SG', 'singapore'],
  ['Asia/Kuala_Lumpur', 'Kuala Lumpur', 'Malásia', 'MY', 'malasia,malaysia'],
  ['Asia/Manila', 'Manila', 'Filipinas', 'PH', 'filipinas,philippines'],
  ['Asia/Hong_Kong', 'Hong Kong', 'China', 'HK'],
  ['Asia/Shanghai', 'Pequim', 'China', 'CN', 'beijing,china,xangai,shanghai,shenzhen'],
  ['Asia/Taipei', 'Taipé', 'Taiwan', 'TW', 'taipei,taiwan'],
  ['Asia/Seoul', 'Seul', 'Coreia do Sul', 'KR', 'seoul,coreia,coreia do sul,korea,south korea'],
  ['Asia/Tokyo', 'Tóquio', 'Japão', 'JP', 'tokyo,japao,japan,osaka,jst'],
  // Oceania
  ['Australia/Perth', 'Perth', 'Austrália', 'AU'],
  ['Australia/Adelaide', 'Adelaide', 'Austrália', 'AU'],
  ['Australia/Brisbane', 'Brisbane', 'Austrália', 'AU'],
  ['Australia/Sydney', 'Sydney', 'Austrália', 'AU', 'australia,sidney,melbourne,canberra'],
  ['Pacific/Auckland', 'Auckland', 'Nova Zelândia', 'NZ', 'nova zelandia,new zealand,wellington'],
  ['Pacific/Fiji', 'Suva', 'Fiji', 'FJ', 'fiji'],
  ['Pacific/Tahiti', 'Papeete', 'Polinésia Francesa', 'PF', 'taiti,tahiti'],
  // Referência
  ['UTC', 'UTC', 'Tempo Universal Coordenado', 'UN', 'utc,zulu,tempo universal'],
];

export const CITIES: City[] = ROWS.map(([tz, city, country, cc, aliases]) => ({
  tz, city, country, cc,
  ...(aliases ? { aliases: aliases.split(',') } : {}),
}));

/** Minúsculas, sem acento e sem pontuação: "São Paulo" → "sao paulo". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/+\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Contas de horário ───────────────────────────────────────────────────

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Fuso do aparelho. */
export function localTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface ZoneParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
}

/** Data e hora de parede de um instante em um fuso. */
export function zoneParts(tz: string, at: number): ZoneParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(at))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  const { year, month, day, hour, minute, second } = out;
  return { year, month, day, hour: hour % 24, minute, second, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** Diferença do fuso para o UTC, em minutos (Brasília = -180). */
export function tzOffsetMinutes(tz: string, at: number): number {
  const p = zoneParts(tz, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
}

/**
 * Instante (ms) em que o relógio de um fuso marca a data e hora dadas.
 * Em horário inexistente (salto do horário de verão) devolve o instante logo após o salto.
 */
export function zonedToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall - tzOffsetMinutes(tz, wall) * 60_000;
  // Segunda passada: o offset do palpite pode ser o do outro lado de uma virada.
  guess = wall - tzOffsetMinutes(tz, guess) * 60_000;
  return guess;
}

/** "UTC−03:00", "UTC+05:30", "UTC". */
export function offsetLabel(tz: string, at: number): string {
  const min = tzOffsetMinutes(tz, at);
  if (min === 0) return 'UTC';
  const abs = Math.abs(min);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${min < 0 ? '−' : '+'}${hh}:${mm}`;
}

export interface ZoneDiff {
  /** Diferença em minutos para o fuso de referência. */
  minutes: number;
  /** -1 = ontem, 0 = hoje, 1 = amanhã (em relação ao fuso de referência). */
  dayShift: number;
}

export function zoneDiff(tz: string, baseTz: string, at: number): ZoneDiff {
  const a = zoneParts(tz, at);
  const b = zoneParts(baseTz, at);
  const days = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
  return { minutes: tzOffsetMinutes(tz, at) - tzOffsetMinutes(baseTz, at), dayShift: days };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hora de um fuso: "14:05", "2:05 PM", com segundos se pedido. */
export function formatZoneTime(tz: string, at: number, opts: { hour12?: boolean; seconds?: boolean } = {}): string {
  const p = zoneParts(tz, at);
  const tail = `:${pad(p.minute)}${opts.seconds ? `:${pad(p.second)}` : ''}`;
  if (!opts.hour12) return `${pad(p.hour)}${tail}`;
  return `${p.hour % 12 || 12}${tail} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** Data por extenso de um fuso, no idioma pedido: "quarta-feira, 11 de novembro". */
export function formatZoneDate(tz: string, at: number, locale = 'pt-BR'): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(at));
  } catch {
    const p = zoneParts(tz, at);
    return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  }
}

/** É dia (6h–18h) no fuso? Só para o ícone de sol ou lua. */
export function isDaytime(tz: string, at: number): boolean {
  const { hour } = zoneParts(tz, at);
  return hour >= 6 && hour < 18;
}

/** Bandeira do país a partir do código ISO ("BR" → 🇧🇷). */
export function flagEmoji(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc) || cc === 'UN') return '🌐';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ─── Busca ───────────────────────────────────────────────────────────────

interface Indexed {
  city: City;
  name: string;
  country: string;
  aliases: string[];
}

const INDEX: Indexed[] = CITIES.map((city) => ({
  city,
  name: normalize(city.city),
  country: normalize(city.country),
  aliases: city.aliases ?? [],
}));

/** Todos os fusos IANA do navegador, para achar o que não está no catálogo. */
function allIanaZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    return fn ? fn('timeZone') : [];
  } catch {
    return [];
  }
}

function cityFromIana(tz: string): City {
  const leaf = tz.split('/').pop() ?? tz;
  return { tz, city: leaf.replace(/_/g, ' '), country: tz.split('/')[0].replace(/_/g, ' '), cc: 'UN' };
}

function score(entry: Indexed, q: string): number {
  if (entry.name === q) return 100;
  if (entry.aliases.includes(q)) return 95;
  if (entry.country === q) return 80;
  if (entry.name.startsWith(q)) return 70;
  if (entry.aliases.some((a) => a.startsWith(q))) return 60;
  if (entry.country.startsWith(q)) return 50;
  if (q.length >= 3 && (entry.name.includes(q) || entry.aliases.some((a) => a.includes(q)))) return 40;
  if (q.length >= 3 && entry.country.includes(q)) return 30;
  return 0;
}

/** Tira "hora de", "horário em", "time in"… para sobrar só o lugar. */
function stripTimeWords(q: string): string {
  return q
    .replace(/^(que horas sao|what time is it|horario|hora|horas|time|fuso)\b/, '')
    .replace(/^\s*(de|do|da|em|no|na|in|at|of)\b/, '')
    .trim();
}

/** Cidades que casam com o texto, da melhor para a pior. Sem texto: o catálogo inteiro. */
export function searchCities(query: string, limit = 20): City[] {
  const raw = normalize(query);
  if (!raw) return CITIES.slice(0, limit);
  const q = stripTimeWords(raw) || raw;

  const hits = INDEX
    .map((entry, order) => ({ entry, order, s: Math.max(score(entry, q), q === raw ? 0 : score(entry, raw)) }))
    .filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .map((h) => h.entry.city);

  // Fora do catálogo: procura no banco IANA do navegador ("America/Thule", "Asia/Ulaanbaatar").
  if (hits.length < limit) {
    const seen = new Set(hits.map((c) => c.tz));
    const needle = q.replace(/ /g, '_');
    for (const tz of allIanaZones()) {
      if (seen.has(tz)) continue;
      const lower = tz.toLowerCase();
      if (lower === needle || (needle.length >= 3 && lower.split('/').pop()!.includes(needle))) {
        hits.push(cityFromIana(tz));
        if (hits.length >= limit) break;
      }
    }
  }
  return hits.slice(0, limit);
}

/** Melhor cidade para um texto livre ("japão", "hora de Brasília", "America/Sao_Paulo"). */
export function resolvePlace(query: string): City | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') && isValidTimeZone(trimmed)) return findCityByTz(trimmed);
  if (/^(utc|gmt|z)$/i.test(trimmed)) return findCityByTz('UTC');
  return searchCities(trimmed, 1)[0] ?? null;
}

/** Cidade principal de um fuso (a primeira do catálogo), ou uma montada a partir do nome IANA. */
export function findCityByTz(tz: string): City {
  return CITIES.find((c) => c.tz === tz) ?? cityFromIana(tz);
}
