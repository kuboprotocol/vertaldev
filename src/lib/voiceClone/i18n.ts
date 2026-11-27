// Vertal · Clonador de voz — idioma da tela (painel do Clonador e botões "Usar minha voz" do Studio de Música).
//
// Segue o idioma do app (o mesmo cadastro de 65 idiomas/variantes do Vertal Chat), na ordem:
//   Ajustes → Idioma (≠ automático) → idioma do último pedido no chat → navegador → perfil → pt-BR.
// Antes o painel usava só o idioma do navegador: um brasileiro com navegador em inglês via textos em inglês
// no meio da tela em português.
// Textos completos em pt/en/es/fr/de/it; os demais idiomas usam a variante-mãe (pt-PT → pt, fr-CH → fr)
// ou o inglês. Mensagens do servidor seguem pt/en/es (voiceMessage).
import { getSchedulerLangSetting, getSchedulerProfileLocale } from '@/lib/chatScheduler/client';
import { normLang, schedLang } from '../../../supabase/functions/_shared/chatSchedulerI18n';
import { detectLang } from '../../../supabase/functions/_shared/chatScheduler';
import type { VoiceLang } from '../../../supabase/functions/_shared/voiceClone';

/** Idioma do último pedido escrito no Vertal Chat (gravado pelo chat ao enviar). */
export const REQUEST_LANG_KEY = 'vertal-chat-request-lang';

export function rememberRequestLang(text: string): void {
  const l = detectLang(text);
  if (!l) return;
  try {
    localStorage.setItem(REQUEST_LANG_KEY, l);
  } catch { /* modo privado: segue sem */ }
}

function storedRequestLang(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(REQUEST_LANG_KEY) : null;
  } catch {
    return null;
  }
}

function browserLang(): string | null {
  try {
    return typeof navigator !== 'undefined' ? navigator.language || null : null;
  } catch {
    return null;
  }
}

/** Código do idioma do app (um dos 65 do cadastro), pela ordem do topo. */
export function voiceUiLangCode(o: { setting?: string | null; request?: string | null; browser?: string | null; profile?: string | null } = {}): string {
  const setting = o.setting !== undefined ? o.setting : getSchedulerLangSetting();
  const request = o.request !== undefined ? o.request : storedRequestLang();
  const browser = o.browser !== undefined ? o.browser : browserLang();
  const profile = o.profile !== undefined ? o.profile : getSchedulerProfileLocale();
  return schedLang(normLang(setting) ?? normLang(request) ?? normLang(browser) ?? normLang(profile) ?? 'pt-BR');
}

/** Idioma das mensagens do servidor (pt/en/es). */
export function voiceServerLang(code: string = voiceUiLangCode()): VoiceLang {
  const c = code.toLowerCase();
  if (c.startsWith('pt')) return 'pt';
  if (c.startsWith('es')) return 'es';
  return c ? 'en' : 'pt';
}

export type VoiceUiDict = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it';
const DICTS: VoiceUiDict[] = ['pt', 'en', 'es', 'fr', 'de', 'it'];

/** Dicionário a usar: o próprio idioma, a variante-mãe ou o inglês. */
export function voiceUiDict(code: string = voiceUiLangCode()): VoiceUiDict {
  const base = code.toLowerCase().split('-')[0];
  return (DICTS as string[]).includes(base) ? (base as VoiceUiDict) : 'en';
}

export const VOICE_PANEL_TEXT = {
  pt: {
    title: 'Clonador de voz', intro: 'Grave de 10 a 60 segundos falando normalmente, num lugar silencioso. Quanto mais natural, melhor fica.',
    disabled: 'O Clonador de voz ainda não está liberado para a sua conta.', engineOff: 'O motor de voz ainda está sendo ligado. Você já pode salvar a voz; falar e cantar ficam disponíveis em breve.',
    record: 'Gravar', stop: 'Parar', upload: 'Enviar arquivo', name: 'Nome da voz', save: 'Salvar minha voz',
    consent: 'Confirmo que esta voz é minha ou que tenho autorização por escrito do dono para cloná-la.',
    saved: 'Suas vozes', none: 'Nenhuma voz salva ainda.', del: 'Apagar', test: 'Testar: escreva algo para a sua voz falar',
    speak: 'Falar com esta voz', short: 'A amostra precisa ter pelo menos {s} segundos.', long: 'A amostra pode ter no máximo {s} segundos.',
    ok: 'Voz salva. Agora é só pedir no chat: "canta essa música com a minha voz".', history: 'Últimos áudios',
    micErr: 'Não consegui acessar o microfone. Libere o microfone no navegador ou envie um arquivo.', free: 'grátis', credits: 'crédito(s)',
    waiting: 'Gerando… ({s}s)', processing: 'processando', failed: 'falhou (crédito devolvido)',
    sampleLang: 'Idioma que você fala na amostra', speechLang: 'Idioma da fala', auto: 'Automático (pelo texto)',
    langNote: 'A fala lê {n} idiomas; cantar com a sua voz funciona em qualquer idioma.', fallback: 'Este idioma não está na lista da fala: usei {l}.',
  },
  en: {
    title: 'Voice cloner', intro: 'Record 10 to 60 seconds speaking normally, in a quiet place. The more natural, the better.',
    disabled: "The voice cloner isn't enabled for your account yet.", engineOff: 'The voice engine is still being switched on. You can save your voice now; speaking and singing come soon.',
    record: 'Record', stop: 'Stop', upload: 'Upload file', name: 'Voice name', save: 'Save my voice',
    consent: "I confirm this voice is mine or that I have the owner's written permission to clone it.",
    saved: 'Your voices', none: 'No saved voices yet.', del: 'Delete', test: 'Test: type something for your voice to say',
    speak: 'Speak with this voice', short: 'The sample needs at least {s} seconds.', long: 'The sample can be at most {s} seconds.',
    ok: 'Voice saved. Now just ask in the chat: "sing this song with my voice".', history: 'Latest audio',
    micErr: "Couldn't access the microphone. Allow it in the browser or upload a file.", free: 'free', credits: 'credit(s)',
    waiting: 'Generating… ({s}s)', processing: 'processing', failed: 'failed (credit refunded)',
    sampleLang: 'Language you speak in the sample', speechLang: 'Speech language', auto: 'Automatic (from the text)',
    langNote: 'Speech reads {n} languages; singing with your voice works in any language.', fallback: "This language isn't in the speech list: used {l}.",
  },
  es: {
    title: 'Clonador de voz', intro: 'Graba de 10 a 60 segundos hablando normalmente, en un lugar silencioso. Cuanto más natural, mejor.',
    disabled: 'El clonador de voz aún no está habilitado para tu cuenta.', engineOff: 'El motor de voz aún se está activando. Ya puedes guardar tu voz; hablar y cantar llegan pronto.',
    record: 'Grabar', stop: 'Parar', upload: 'Subir archivo', name: 'Nombre de la voz', save: 'Guardar mi voz',
    consent: 'Confirmo que esta voz es mía o que tengo autorización escrita del titular para clonarla.',
    saved: 'Tus voces', none: 'Aún no hay voces guardadas.', del: 'Borrar', test: 'Prueba: escribe algo para que tu voz lo diga',
    speak: 'Hablar con esta voz', short: 'La muestra necesita al menos {s} segundos.', long: 'La muestra puede tener como máximo {s} segundos.',
    ok: 'Voz guardada. Ahora pídelo en el chat: "canta esta canción con mi voz".', history: 'Últimos audios',
    micErr: 'No pude acceder al micrófono. Permítelo en el navegador o sube un archivo.', free: 'gratis', credits: 'crédito(s)',
    waiting: 'Generando… ({s}s)', processing: 'procesando', failed: 'falló (crédito devuelto)',
    sampleLang: 'Idioma que hablas en la muestra', speechLang: 'Idioma del habla', auto: 'Automático (por el texto)',
    langNote: 'El habla lee {n} idiomas; cantar con tu voz funciona en cualquier idioma.', fallback: 'Este idioma no está en la lista del habla: usé {l}.',
  },
  fr: {
    title: 'Cloneur de voix', intro: 'Enregistrez 10 à 60 secondes en parlant normalement, dans un endroit calme. Plus c’est naturel, mieux c’est.',
    disabled: 'Le cloneur de voix n’est pas encore activé pour votre compte.', engineOff: 'Le moteur vocal est en cours d’activation. Vous pouvez déjà enregistrer votre voix ; parler et chanter arrivent bientôt.',
    record: 'Enregistrer', stop: 'Arrêter', upload: 'Envoyer un fichier', name: 'Nom de la voix', save: 'Enregistrer ma voix',
    consent: 'Je confirme que cette voix est la mienne ou que j’ai l’autorisation écrite de son titulaire pour la cloner.',
    saved: 'Vos voix', none: 'Aucune voix enregistrée pour le moment.', del: 'Supprimer', test: 'Test : écrivez quelque chose que votre voix dira',
    speak: 'Parler avec cette voix', short: 'L’échantillon doit durer au moins {s} secondes.', long: 'L’échantillon peut durer au maximum {s} secondes.',
    ok: 'Voix enregistrée. Demandez maintenant dans le chat : « chante cette chanson avec ma voix ».', history: 'Derniers audios',
    micErr: 'Impossible d’accéder au micro. Autorisez-le dans le navigateur ou envoyez un fichier.', free: 'gratuit', credits: 'crédit(s)',
    waiting: 'Génération… ({s} s)', processing: 'en cours', failed: 'échec (crédit remboursé)',
    sampleLang: 'Langue parlée dans l’échantillon', speechLang: 'Langue de la parole', auto: 'Automatique (selon le texte)',
    langNote: 'La parole lit {n} langues ; chanter avec votre voix fonctionne dans toutes les langues.', fallback: 'Cette langue n’est pas dans la liste de la parole : j’ai utilisé {l}.',
  },
  de: {
    title: 'Stimmenkloner', intro: 'Nimm 10 bis 60 Sekunden auf, in denen du normal sprichst, an einem ruhigen Ort. Je natürlicher, desto besser.',
    disabled: 'Der Stimmenkloner ist für dein Konto noch nicht freigeschaltet.', engineOff: 'Die Stimm-Engine wird gerade eingeschaltet. Du kannst deine Stimme schon speichern; Sprechen und Singen folgen bald.',
    record: 'Aufnehmen', stop: 'Stopp', upload: 'Datei hochladen', name: 'Name der Stimme', save: 'Meine Stimme speichern',
    consent: 'Ich bestätige, dass dies meine Stimme ist oder dass ich die schriftliche Erlaubnis der Person habe, sie zu klonen.',
    saved: 'Deine Stimmen', none: 'Noch keine Stimme gespeichert.', del: 'Löschen', test: 'Test: Schreib etwas, das deine Stimme sagen soll',
    speak: 'Mit dieser Stimme sprechen', short: 'Die Aufnahme muss mindestens {s} Sekunden lang sein.', long: 'Die Aufnahme darf höchstens {s} Sekunden lang sein.',
    ok: 'Stimme gespeichert. Bitte jetzt im Chat: „sing dieses Lied mit meiner Stimme“.', history: 'Letzte Audios',
    micErr: 'Kein Zugriff auf das Mikrofon. Erlaube es im Browser oder lade eine Datei hoch.', free: 'kostenlos', credits: 'Credit(s)',
    waiting: 'Wird erstellt… ({s} s)', processing: 'in Arbeit', failed: 'fehlgeschlagen (Credit erstattet)',
    sampleLang: 'Sprache in der Aufnahme', speechLang: 'Sprache der Sprachausgabe', auto: 'Automatisch (nach Text)',
    langNote: 'Die Sprachausgabe liest {n} Sprachen; Singen mit deiner Stimme klappt in jeder Sprache.', fallback: 'Diese Sprache ist nicht in der Liste: {l} verwendet.',
  },
  it: {
    title: 'Clonatore di voce', intro: 'Registra da 10 a 60 secondi parlando normalmente, in un posto silenzioso. Più è naturale, meglio è.',
    disabled: 'Il clonatore di voce non è ancora attivo per il tuo account.', engineOff: 'Il motore vocale si sta avviando. Puoi già salvare la tua voce; parlare e cantare arrivano presto.',
    record: 'Registra', stop: 'Ferma', upload: 'Carica file', name: 'Nome della voce', save: 'Salva la mia voce',
    consent: 'Confermo che questa voce è mia o che ho l’autorizzazione scritta del titolare per clonarla.',
    saved: 'Le tue voci', none: 'Nessuna voce salvata.', del: 'Elimina', test: 'Prova: scrivi qualcosa da far dire alla tua voce',
    speak: 'Parla con questa voce', short: 'Il campione deve durare almeno {s} secondi.', long: 'Il campione può durare al massimo {s} secondi.',
    ok: 'Voce salvata. Ora chiedi in chat: "canta questa canzone con la mia voce".', history: 'Ultimi audio',
    micErr: 'Non riesco ad accedere al microfono. Consentilo nel browser o carica un file.', free: 'gratis', credits: 'credito/i',
    waiting: 'Generazione… ({s} s)', processing: 'in corso', failed: 'non riuscito (credito restituito)',
    sampleLang: 'Lingua parlata nel campione', speechLang: 'Lingua del parlato', auto: 'Automatica (dal testo)',
    langNote: 'Il parlato legge {n} lingue; cantare con la tua voce funziona in qualsiasi lingua.', fallback: 'Questa lingua non è nell’elenco del parlato: ho usato {l}.',
  },
} as const satisfies Record<VoiceUiDict, Record<string, string>>;

export const MUSIC_VOICE_TEXT = {
  pt: { use: 'Usar minha voz', sing: 'Cantar com minha voz', clone: 'Clonar minha voz', auto: 'Cantar com minha voz automaticamente nas próximas músicas', working: 'Cantando com a sua voz… ({s}s)', done: 'Versão com a sua voz', credits: 'crédito(s)' },
  en: { use: 'Use my voice', sing: 'Sing with my voice', clone: 'Clone my voice', auto: 'Sing new songs with my voice automatically', working: 'Singing with your voice… ({s}s)', done: 'Version with your voice', credits: 'credit(s)' },
  es: { use: 'Usar mi voz', sing: 'Cantar con mi voz', clone: 'Clonar mi voz', auto: 'Cantar automáticamente las próximas canciones con mi voz', working: 'Cantando con tu voz… ({s}s)', done: 'Versión con tu voz', credits: 'crédito(s)' },
  fr: { use: 'Utiliser ma voix', sing: 'Chanter avec ma voix', clone: 'Cloner ma voix', auto: 'Chanter automatiquement les prochaines chansons avec ma voix', working: 'Chant avec votre voix… ({s} s)', done: 'Version avec votre voix', credits: 'crédit(s)' },
  de: { use: 'Meine Stimme verwenden', sing: 'Mit meiner Stimme singen', clone: 'Meine Stimme klonen', auto: 'Neue Lieder automatisch mit meiner Stimme singen', working: 'Singe mit deiner Stimme… ({s} s)', done: 'Version mit deiner Stimme', credits: 'Credit(s)' },
  it: { use: 'Usa la mia voce', sing: 'Canta con la mia voce', clone: 'Clona la mia voce', auto: 'Canta automaticamente le prossime canzoni con la mia voce', working: 'Canto con la tua voce… ({s} s)', done: 'Versione con la tua voce', credits: 'credito/i' },
} as const satisfies Record<VoiceUiDict, Record<string, string>>;
