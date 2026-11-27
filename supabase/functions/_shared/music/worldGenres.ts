// Vertal Music AI · catálogo de ritmos e gêneros do mundo (Studio de Música, API e MusKAI).
// Puro (navegador, Vitest e edge functions). O campo "Estilo" continua sendo texto livre: este catálogo só
// ajuda a achar e escrever o ritmo, e dá ao motor uma descrição curta de instrumentos/levada para ritmos
// regionais que ele conhece menos pelo nome. Os 18 estilos antigos do Studio NÃO ganham descrição extra
// (o pedido deles fica idêntico ao de antes).
//
// Motor próprio: ACE-Step 1.5 (MIT) — "1000+ instruments and styles" e letras em 50+ idiomas
// (https://github.com/ace-step/ACE-Step-1.5). Reserva opcional: sunoapi.org (style = tags).

export interface WorldGenre {
  /** Nome como aparece e vai para o motor. */
  name: string;
  /** Região/país (para busca e agrupamento). */
  region: string;
  /** Instrumentos e levada típicos, em inglês (o motor entende melhor). Vazio = o nome basta. */
  hint: string;
  /** Outros nomes para a busca. */
  aka?: string[];
}

const G = (name: string, region: string, hint = "", aka: string[] = []): WorldGenre => ({ name, region, hint, aka });

/** Os estilos que o Studio já tinha (ordem e textos mantidos). */
export const LEGACY_STUDIO_STYLES = [
  "Pop", "Trap Gospel", "Lo-fi", "Drill", "Funk BR", "Sertanejo", "MPB", "Samba", "Pagode", "Forró",
  "Reggaeton", "EDM", "Rock", "R&B", "Hip-Hop", "Jazz", "Cinematic", "Phonk",
] as const;

export const WORLD_GENRES: WorldGenre[] = [
  // Brasil
  G("Funk carioca", "Brasil", "Brazilian funk carioca, tamborzão beat, 130 bpm, heavy 808, MC vocals", ["baile funk", "funk rj"]),
  G("Sertanejo universitário", "Brasil", "Brazilian sertanejo, viola caipira, acoustic guitar, accordion, duo harmonies"),
  G("Axé", "Brasil", "Brazilian axé music from Bahia, electric guitar, brass, timbau and repique percussion, carnival energy"),
  G("Bossa nova", "Brasil", "bossa nova, nylon-string guitar syncopated comping, soft brushed drums, intimate vocals"),
  G("Samba-enredo", "Brasil", "samba-enredo, full bateria, surdo, tamborim, cuíca, cavaquinho, carnival choir"),
  G("Samba de roda", "Brasil", "samba de roda from Bahia, pandeiro, atabaque, viola machete, call and response"),
  G("Choro", "Brasil", "Brazilian choro, bandolim, cavaquinho, 7-string guitar, pandeiro, virtuosic melody"),
  G("Frevo", "Brasil", "frevo from Pernambuco, fast brass band, snare, 2/4 carnival march"),
  G("Maracatu", "Brasil", "maracatu nação, alfaia drums, gonguê bell, caixa, Afro-Brazilian procession groove"),
  G("Baião", "Brasil", "baião, accordion, zabumba, triangle, northeastern Brazil"),
  G("Xote", "Brasil", "xote, accordion, zabumba, triangle, slow northeastern dance"),
  G("Piseiro", "Brasil", "piseiro, electronic keyboard, accordion lines, pisadinha beat", ["pisadinha"]),
  G("Brega funk", "Brasil", "brega funk from Recife, synth bass, funk drums, catchy hooks"),
  G("Tecnobrega", "Brasil", "tecnobrega from Pará, electronic drums, synths, aparelhagem party"),
  G("Arrocha", "Brasil", "arrocha, romantic keyboard, saxophone, slow sensual groove"),
  G("Carimbó", "Brasil", "carimbó from Pará, curimbó drums, banjo, maracas, flute"),
  G("Gospel brasileiro", "Brasil", "Brazilian gospel worship, piano, strings, choir, uplifting"),
  G("Moda de viola", "Brasil", "moda de viola, viola caipira duo, rural Brazil"),
  G("Lambada", "Brasil", "lambada, accordion, guitarrada, fast tropical beat"),
  // América Latina e Caribe
  G("Cumbia", "Colômbia", "cumbia, accordion, guacharaca, tambora, gaita flute, 2/4 shuffle"),
  G("Vallenato", "Colômbia", "vallenato, accordion, caja vallenata, guacharaca"),
  G("Champeta", "Colômbia", "champeta, African guitar, Caribbean percussion, Cartagena dance"),
  G("Bachata", "República Dominicana", "bachata, requinto guitar arpeggios, bongos, güira, romantic vocals"),
  G("Merengue", "República Dominicana", "merengue, tambora, güira, accordion, fast 2/4"),
  G("Dembow", "República Dominicana", "dominican dembow, repetitive snare, heavy bass, street vocals"),
  G("Salsa", "Cuba / Porto Rico", "salsa, piano montuno, horns, congas, timbales, clave"),
  G("Son cubano", "Cuba", "son cubano, tres guitar, bongos, maracas, claves, double bass"),
  G("Timba", "Cuba", "timba, funky Cuban dance band, piano, brass, congas"),
  G("Bolero", "América Latina", "bolero, romantic guitars, requinto, soft percussion"),
  G("Tango", "Argentina", "tango, bandoneón, violin, piano, double bass, staccato marcato"),
  G("Cuarteto", "Argentina", "cuarteto cordobés, keyboard, accordion, tun-ta-ta beat"),
  G("Chamamé", "Argentina", "chamamé, accordion, guitar, 6/8 lilting rhythm"),
  G("Folklore andino", "Andes", "Andean folk, charango, quena, zampoña, bombo"),
  G("Huayno", "Peru / Bolívia", "huayno, charango, quena, harp, Andean"),
  G("Mariachi", "México", "mariachi, trumpets, violins, vihuela, guitarrón"),
  G("Ranchera", "México", "ranchera, mariachi band, emotional vocals"),
  G("Norteño", "México", "norteño, button accordion, bajo sexto, polka rhythm"),
  G("Banda sinaloense", "México", "banda sinaloense, tuba, brass band, clarinets, tambora"),
  G("Corridos tumbados", "México", "corridos tumbados, requinto guitar, tuba, trap-influenced vocals"),
  G("Reggae", "Jamaica", "reggae, one drop, offbeat skank guitar, deep bass"),
  G("Dancehall", "Jamaica", "dancehall, digital riddim, deejay vocals"),
  G("Ska", "Jamaica", "ska, upstroke guitar, walking bass, horns"),
  G("Soca", "Trinidad e Tobago", "soca, fast carnival groove, steel pan, synth brass"),
  G("Calypso", "Trinidad e Tobago", "calypso, steel pan, acoustic guitar, playful vocals"),
  G("Kompa", "Haiti", "kompa, Haitian konpa, guitar, keyboard, steady dance groove", ["konpa"]),
  G("Zouk", "Antilhas", "zouk, French Caribbean, synth, romantic groove"),
  G("Latin trap", "América Latina", "latin trap, 808, hi-hat rolls, Spanish vocals"),
  // América do Norte
  G("Country", "EUA", "country, acoustic guitar, pedal steel, fiddle"),
  G("Bluegrass", "EUA", "bluegrass, banjo, mandolin, fiddle, upright bass"),
  G("Blues", "EUA", "blues, 12-bar, electric guitar, harmonica"),
  G("Gospel", "EUA", "gospel, Hammond organ, choir, handclaps"),
  G("Soul", "EUA", "soul, horns, Rhodes, warm vocals"),
  G("Funk", "EUA", "funk, slap bass, clavinet, tight horns"),
  G("Disco", "EUA", "disco, four-on-the-floor, strings, octave bass"),
  G("House", "EUA", "house, four-on-the-floor, piano chords"),
  G("Techno", "Alemanha / EUA", "techno, driving kick, hypnotic synths"),
  G("Trap", "EUA", "trap, 808, hi-hat rolls"),
  G("Indie rock", "Global", ""),
  G("Metal", "Global", "heavy metal, distorted guitars, double kick"),
  G("Punk", "Global", "punk rock, fast power chords"),
  G("Synthwave", "Global", "synthwave, 80s analog synths, gated drums"),
  G("Drum and bass", "Reino Unido", "drum and bass, 174 bpm breakbeats, reese bass", ["dnb"]),
  G("UK garage", "Reino Unido", "UK garage, 2-step shuffle, chopped vocals"),
  G("Grime", "Reino Unido", "grime, 140 bpm, square-wave bass, MC"),
  // Europa
  G("Fado", "Portugal", "fado, Portuguese guitar, classical guitar, melancholic vocals"),
  G("Flamenco", "Espanha", "flamenco, flamenco guitar, palmas, cajón, cante jondo"),
  G("Rumba catalana", "Espanha", "rumba catalana, guitar ventilador strum, palmas"),
  G("Chanson", "França", "French chanson, accordion, acoustic guitar, intimate vocals"),
  G("Schlager", "Alemanha / Áustria", "German schlager, upbeat pop, synths, sing-along chorus"),
  G("Polka", "Europa Central", "polka, accordion, brass, 2/4 oom-pah"),
  G("Musica napoletana", "Itália", "Neapolitan song, mandolin, guitar, operatic vocals"),
  G("Italo disco", "Itália", "italo disco, synths, vocoder, 80s"),
  G("Rebetiko", "Grécia", "rebetiko, bouzouki, baglamas"),
  G("Laïko", "Grécia", "Greek laïko, bouzouki, modern pop"),
  G("Celtic", "Irlanda / Escócia", "Celtic folk, fiddle, tin whistle, bodhrán, uilleann pipes"),
  G("Balkan brass", "Bálcãs", "Balkan brass band, trumpets, tuba, odd meters"),
  G("Turbo-folk", "Bálcãs", "turbo-folk, accordion, synths, dance beat"),
  G("Klezmer", "Europa Oriental", "klezmer, clarinet, violin, accordion"),
  G("Russian chanson", "Rússia", "Russian chanson, guitar, accordion"),
  G("Nordic folk", "Escandinávia", "Nordic folk, nyckelharpa, hardanger fiddle"),
  G("Eurodance", "Europa", "eurodance, 90s, synth stabs, female hook"),
  // Oriente Médio e Norte da África
  G("Arabic pop", "Mundo árabe", "Arabic pop, oud, qanun, darbuka, maqam melodies"),
  G("Raï", "Argélia", "raï, Algerian, synths, darbuka, gasba flute"),
  G("Gnawa", "Marrocos", "gnawa, guembri bass lute, qraqeb castanets, trance"),
  G("Chaabi", "Marrocos / Argélia", "chaabi, mandole, violin, darbuka"),
  G("Dabke", "Levante", "dabke, mijwiz, tabl drum, line dance"),
  G("Khaleeji", "Golfo", "khaleeji, oud, Gulf percussion, handclaps"),
  G("Mahraganat", "Egito", "mahraganat, Egyptian electro shaabi, autotune"),
  G("Turkish pop", "Turquia", "Turkish pop, bağlama, darbuka, strings"),
  G("Arabesk", "Turquia", "Turkish arabesk, strings, melancholic"),
  G("Persian pop", "Irã", "Persian pop, santur, tar, tombak"),
  G("Mizrahi", "Israel", "Mizrahi pop, bouzouki, Middle Eastern scales"),
  // África subsaariana
  G("Afrobeats", "Nigéria / Gana", "afrobeats, syncopated percussion, log drum, guitar licks, pidgin vocals"),
  G("Afrobeat", "Nigéria", "Fela-style afrobeat, horns, polyrhythm, long grooves"),
  G("Amapiano", "África do Sul", "amapiano, log drum bass, shakers, jazzy keys, 112 bpm"),
  G("Gqom", "África do Sul", "gqom, dark broken kicks, Durban"),
  G("Kwaito", "África do Sul", "kwaito, slow house beat, chanted vocals"),
  G("Highlife", "Gana", "highlife, palm-wine guitar, horns"),
  G("Soukous", "Congo", "soukous, fast sebene guitars, rumba congolaise", ["rumba congolaise"]),
  G("Bongo Flava", "Tanzânia", "bongo flava, Swahili pop, taarab influences"),
  G("Mbalax", "Senegal", "mbalax, sabar drums, tama talking drum"),
  G("Kizomba", "Angola", "kizomba, slow sensual beat, synth bass"),
  G("Semba", "Angola", "semba, guitar, percussion, Angolan dance"),
  G("Kuduro", "Angola", "kuduro, fast electronic, aggressive beat"),
  G("Morna", "Cabo Verde", "morna, cavaquinho, guitar, melancholic"),
  G("Funaná", "Cabo Verde", "funaná, gaita accordion, ferrinho"),
  G("Marrabenta", "Moçambique", "marrabenta, guitars, upbeat dance"),
  G("Ethio-jazz", "Etiópia", "Ethio-jazz, pentatonic modes, horns, Rhodes"),
  G("Taarab", "África Oriental", "taarab, oud, qanun, Swahili coast orchestra"),
  // Ásia do Sul
  G("Bollywood", "Índia", "Bollywood filmi song, strings, tabla, dholak, lush orchestra"),
  G("Bhangra", "Índia / Paquistão", "bhangra, dhol, tumbi, Punjabi vocals"),
  G("Qawwali", "Paquistão / Índia", "qawwali, harmonium, tabla, handclaps, Sufi devotional chorus"),
  G("Carnatic", "Sul da Índia", "Carnatic classical, veena, mridangam, violin"),
  G("Hindustani classical", "Norte da Índia", "Hindustani classical, sitar, tabla, tanpura drone"),
  G("Ghazal", "Índia / Paquistão", "ghazal, harmonium, tabla, poetic Urdu vocals"),
  G("Tamil kuthu", "Índia", "Tamil kuthu, thappu drums, fast dance"),
  G("Baila", "Sri Lanka", "baila, 6/8, guitar, festive"),
  // Leste e Sudeste da Ásia
  G("K-pop", "Coreia do Sul", "K-pop, polished synth pop, dance break, group vocals"),
  G("Trot", "Coreia do Sul", "Korean trot, vibrato vocals, 2-beat"),
  G("J-pop", "Japão", "J-pop, bright synths, catchy melody"),
  G("City pop", "Japão", "Japanese city pop, 80s, slap bass, Rhodes, brass"),
  G("Enka", "Japão", "enka, shamisen, strings, vibrato ballad"),
  G("Anime song", "Japão", "anime opening, energetic rock, fast tempo", ["anisong"]),
  G("Mandopop", "China / Taiwan", "Mandopop ballad, piano, strings"),
  G("Cantopop", "Hong Kong", "Cantopop, 80s-90s ballad, synths"),
  G("Chinese traditional", "China", "Chinese traditional, guzheng, erhu, pipa, dizi"),
  G("Gamelan", "Indonésia", "gamelan, metallophones, gongs, interlocking patterns"),
  G("Dangdut", "Indonésia", "dangdut, tabla-like gendang, suling flute, Malay melody"),
  G("Kroncong", "Indonésia", "kroncong, ukulele, cello pizzicato, flute"),
  G("OPM", "Filipinas", "Original Pilipino Music ballad, acoustic guitar"),
  G("V-pop", "Vietnã", "V-pop, Vietnamese pop ballad"),
  G("Luk thung", "Tailândia", "luk thung, khaen, Thai country"),
  G("Mor lam", "Tailândia / Laos", "mor lam, khaen mouth organ, phin lute"),
  // Oceania
  G("Polynesian", "Polinésia", "Polynesian, ukulele, log drums, island harmonies"),
  G("Hawaiian", "Havaí", "Hawaiian, slack-key guitar, steel guitar, ukulele"),
  G("Aboriginal didgeridoo", "Austrália", "didgeridoo drone, clapsticks"),
  // Global
  G("Lo-fi hip-hop", "Global", "lo-fi hip-hop, dusty drums, jazzy chords, vinyl crackle"),
  G("Ambient", "Global", "ambient, pads, slow evolving textures"),
  G("Orchestral", "Global", "orchestral, full symphony orchestra"),
  G("Worship", "Global", "contemporary worship, piano, pads, congregational chorus"),
  G("Children's song", "Global", "children's song, simple melody, playful"),
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Todas as opções do seletor: os estilos antigos primeiro, depois o catálogo do mundo (sem repetir). */
export function musicStyleOptions(): Array<{ name: string; region: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; region: string }> = [];
  for (const n of LEGACY_STUDIO_STYLES) {
    seen.add(norm(n));
    out.push({ name: n, region: "" });
  }
  for (const g of WORLD_GENRES) {
    if (seen.has(norm(g.name))) continue;
    seen.add(norm(g.name));
    out.push({ name: g.name, region: g.region });
  }
  return out;
}

/** Busca por nome, apelido ou região (sem acento, sem maiúsculas). */
export function searchMusicStyles(q: string, limit = 60): Array<{ name: string; region: string }> {
  const n = norm(q);
  const all = musicStyleOptions();
  if (!n) return all.slice(0, limit);
  const aka = new Map(WORLD_GENRES.map((g) => [g.name, (g.aka ?? []).map(norm)]));
  return all
    .filter((o) => norm(o.name).includes(n) || norm(o.region).includes(n) || (aka.get(o.name) ?? []).some((a) => a.includes(n)))
    .slice(0, limit);
}

/**
 * Descrição extra para o motor quando o estilo é um ritmo do catálogo (fora dos 18 antigos).
 * Estilo livre ou antigo → "" (o pedido fica igual ao de antes).
 */
export function genreHint(style: string): string {
  const n = norm(style);
  if (!n || (LEGACY_STUDIO_STYLES as readonly string[]).some((s) => norm(s) === n)) return "";
  const g = WORLD_GENRES.find((x) => norm(x.name) === n || (x.aka ?? []).some((a) => norm(a) === n));
  return g?.hint ?? "";
}

// ─── Idiomas das letras ──────────────────────────────────────────────────
// Lista oficial do ACE-Step 1.5 (acestep/constants.py VALID_LANGUAGES): 50 idiomas + "unknown".
export const MUSIC_LYRIC_LANGUAGES: Record<string, string> = {
  pt: "Português", en: "English", es: "Español", fr: "Français", de: "Deutsch", it: "Italiano", ja: "日本語", ko: "한국어",
  zh: "中文 (普通话)", yue: "粵語", ar: "العربية", hi: "हिन्दी", ru: "Русский", tr: "Türkçe", nl: "Nederlands", pl: "Polski",
  sv: "Svenska", no: "Norsk", da: "Dansk", fi: "Suomi", el: "Ελληνικά", he: "עברית", fa: "فارسی", ur: "اردو",
  bn: "বাংলা", pa: "ਪੰਜਾਬੀ", ta: "தமிழ்", te: "తెలుగు", ne: "नेपाली", sa: "संस्कृतम्", th: "ไทย", vi: "Tiếng Việt",
  id: "Bahasa Indonesia", ms: "Bahasa Melayu", tl: "Tagalog", sw: "Kiswahili", uk: "Українська", cs: "Čeština",
  sk: "Slovenčina", hu: "Magyar", ro: "Română", bg: "Български", hr: "Hrvatski", sr: "Српски", lt: "Lietuvių",
  is: "Íslenska", ca: "Català", az: "Azərbaycanca", ht: "Kreyòl ayisyen", la: "Latina",
};
