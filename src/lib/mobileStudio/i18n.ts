// Textos das páginas Android Studio, iOS / Xcode e Google Play Console (pt-BR, en, es).
// Idioma: ?lang= → Ajustes → Idioma / perfil / navegador (mesma regra do Agendador e do WhatsApp).
export type MsLang = 'pt' | 'en' | 'es'

export function msLang(hint: string | null | undefined): MsLang {
  const s = (hint ?? '').toLowerCase()
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('en')) return 'en'
  return 'pt'
}

export interface MsTexts {
  back: string
  via: string
  // Google Play Console
  playTitle: string
  playIntro: string
  playAccessTitle: string
  playAccessSteps: string[]
  playChatTitle: string
  playChatExamples: string[]
  // Android Studio
  androidTitle: string
  androidHonest: string
  androidLoginTitle: string
  androidLoginIntro: string
  // iOS / Xcode
  iosTitle: string
  iosHonest: string
  iosKeyTitle: string
  iosKeySteps: string[]
  iosKeyIntro: string
  iosAppleIdNote: string
  // Projeto (GitHub)
  projectTitle: string
  projectIntro: string
  repoLabel: string
  repoPlaceholder: string
  repoInvalid: string
  loadingRepos: string
  noGithub: string
  connectGithub: string
  pickRepo: string
  androidIdeSteps: string[]
  iosIdeSteps: string[]
  commandsTitle: string
  commandsNote: string
  iosMacNote: string
  copy: string
  copied: string
  downloadZip: string
  openGithub: string
}

const pt: MsTexts = {
  back: 'Voltar aos conectores',
  via: 'Vertal Dev · Conectores',
  playTitle: 'Google Play Console',
  playIntro: 'Entre com a sua conta Google (login oficial do Google, OAuth). O Vertal pede só a permissão do Google Play Developer API.',
  playAccessTitle: 'Importante: libere o acesso no Play Console',
  playAccessSteps: [
    'O login prova quem você é, mas o Google só responde sobre os apps que essa conta pode ver no Play Console.',
    'Se você é o dono da conta de desenvolvedor, já tem acesso. Se não, peça ao dono: Play Console → Usuários e permissões → Convidar novo usuário → e-mail desta conta Google → dê acesso aos apps (ver informações do app; responder avaliações, se quiser responder pelo chat).',
    'O convite pode levar alguns minutos para valer. Sem ele, o Google responde "sem permissão" (403).',
  ],
  playChatTitle: 'Depois de conectar, peça no Vertal Chat:',
  playChatExamples: [
    '“Mostre as avaliações recentes do app com.empresa.app”',
    '“Em que faixa está a última versão do com.empresa.app?”',
    '“Liste as assinaturas do com.empresa.app”',
    '“Responda a avaliação … com: Obrigado!” (pede a sua aprovação)',
  ],
  androidTitle: 'Android Studio',
  androidHonest: 'O Android Studio é um app de desktop: ele não tem login OAuth nem API para terceiros. Aqui você entra com Google (a mesma conexão do Google Play Console, para publicar e acompanhar o app) e abre o seu projeto no Android Studio pelo GitHub.',
  androidLoginTitle: 'Entrar com Google',
  androidLoginIntro: 'É a mesma conexão do conector Google Play Console: conectar aqui conecta lá também.',
  iosTitle: 'iOS / Xcode',
  iosHonest: 'A Apple não oferece login OAuth para terceiros no Xcode nem no App Store Connect (e o “Entrar com Apple” só identifica a pessoa, não dá acesso ao App Store Connect). Por isso a conexão é pela chave de API do time, do jeito oficial da Apple.',
  iosKeyTitle: 'Chave de API do App Store Connect',
  iosKeySteps: [
    'No App Store Connect (precisa ser Admin): Usuários e Acesso → Integrações → App Store Connect API → Chaves do time.',
    'Gere uma chave com o papel App Manager (ou Developer, se só quiser ler builds). Copie o Issuer ID (no topo) e o Key ID.',
    'Baixe o arquivo AuthKey_<KeyID>.p8 (a Apple só deixa baixar uma vez) e cole o conteúdo inteiro no campo “Private key (.p8)”.',
    'A chave fica criptografada no servidor do Vertal (nunca no navegador). Para revogar, desconecte aqui e revogue a chave no App Store Connect.',
  ],
  iosKeyIntro: 'Cole os três dados da chave. O Vertal testa a chave listando os seus apps antes de salvar.',
  iosAppleIdNote: 'Depois de conectar, peça no Vertal Chat: “liste os meus apps no App Store Connect”, “quais builds subiram do app …”, “mostre as avaliações do app …”.',
  projectTitle: 'Abrir o projeto',
  projectIntro: 'Escolha o repositório do GitHub com o seu projeto (por exemplo, o que você exportou do Vertal Dev).',
  repoLabel: 'Repositório (owner/repo ou URL do GitHub)',
  repoPlaceholder: 'ex.: minha-conta/meu-app',
  repoInvalid: 'Informe um repositório do GitHub no formato owner/repo.',
  loadingRepos: 'Carregando seus repositórios…',
  noGithub: 'Conecte o GitHub para escolher da lista (ou cole o owner/repo abaixo).',
  connectGithub: 'Entrar com GitHub',
  pickRepo: 'Seus repositórios',
  androidIdeSteps: [
    'Android Studio → File → New → Project from Version Control (ou “Get from VCS” na tela inicial).',
    'Cole a URL de clone abaixo e clique em Clone. Na primeira vez, o Android Studio pede para entrar no GitHub (login do próprio GitHub).',
    'Projeto web (React/Vite): rode os comandos do Capacitor abaixo e abra a pasta android/ que eles criam.',
  ],
  iosIdeSteps: [
    'Num Mac: Xcode → Integrate → Clone… (ou “Clone Git Repository” na tela inicial) e cole a URL de clone abaixo.',
    'Projeto web (React/Vite): rode os comandos do Capacitor abaixo; o último abre o projeto iOS no Xcode.',
    'Para publicar: Product → Archive → Distribute App. O build aparece depois em “builds” pelo Vertal Chat.',
  ],
  commandsTitle: 'Comandos (Capacitor)',
  commandsNote: 'Se o projeto já tem capacitor.config, pule o “npx cap init”. Ajuste o --web-dir se o build não sair em dist.',
  iosMacNote: 'Precisa de um Mac com Xcode e CocoaPods; o iOS não compila no Windows/Linux.',
  copy: 'Copiar',
  copied: 'Copiado',
  downloadZip: 'Baixar ZIP',
  openGithub: 'Abrir no GitHub',
}

const en: MsTexts = {
  back: 'Back to connectors',
  via: 'Vertal Dev · Connectors',
  playTitle: 'Google Play Console',
  playIntro: 'Sign in with your Google account (official Google sign-in, OAuth). Vertal only asks for the Google Play Developer API permission.',
  playAccessTitle: 'Important: grant access in Play Console',
  playAccessSteps: [
    'Signing in proves who you are, but Google only answers about the apps this account can see in Play Console.',
    'If you own the developer account, you already have access. Otherwise ask the owner: Play Console → Users and permissions → Invite new user → this Google account e-mail → grant app access (view app information; reply to reviews if you want to reply from the chat).',
    'The invite can take a few minutes to apply. Without it Google answers "permission denied" (403).',
  ],
  playChatTitle: 'After connecting, ask Vertal Chat:',
  playChatExamples: [
    '“Show the latest reviews of com.company.app”',
    '“Which track is the latest version of com.company.app on?”',
    '“List the subscriptions of com.company.app”',
    '“Reply to review … with: Thanks!” (asks for your approval)',
  ],
  androidTitle: 'Android Studio',
  androidHonest: 'Android Studio is a desktop app: it has no OAuth sign-in or API for third parties. Here you sign in with Google (the same connection as Google Play Console, to publish and track the app) and open your project in Android Studio from GitHub.',
  androidLoginTitle: 'Sign in with Google',
  androidLoginIntro: 'This is the same connection as the Google Play Console connector: connecting here connects it there too.',
  iosTitle: 'iOS / Xcode',
  iosHonest: 'Apple offers no third-party OAuth for Xcode or App Store Connect (and “Sign in with Apple” only identifies a person, it does not grant App Store Connect access). So the connection uses a team API key, Apple’s official way.',
  iosKeyTitle: 'App Store Connect API key',
  iosKeySteps: [
    'In App Store Connect (Admin role): Users and Access → Integrations → App Store Connect API → Team Keys.',
    'Generate a key with the App Manager role (or Developer, if you only need to read builds). Copy the Issuer ID (at the top) and the Key ID.',
    'Download AuthKey_<KeyID>.p8 (Apple lets you download it only once) and paste its whole content in “Private key (.p8)”.',
    'The key is stored encrypted on Vertal’s server (never in the browser). To revoke it, disconnect here and revoke the key in App Store Connect.',
  ],
  iosKeyIntro: 'Paste the three key values. Vertal tests the key by listing your apps before saving.',
  iosAppleIdNote: 'After connecting, ask Vertal Chat: “list my apps in App Store Connect”, “which builds were uploaded for app …”, “show the reviews of app …”.',
  projectTitle: 'Open the project',
  projectIntro: 'Pick the GitHub repository with your project (for example, the one you exported from Vertal Dev).',
  repoLabel: 'Repository (owner/repo or GitHub URL)',
  repoPlaceholder: 'e.g. my-account/my-app',
  repoInvalid: 'Enter a GitHub repository as owner/repo.',
  loadingRepos: 'Loading your repositories…',
  noGithub: 'Connect GitHub to pick from the list (or paste owner/repo below).',
  connectGithub: 'Sign in with GitHub',
  pickRepo: 'Your repositories',
  androidIdeSteps: [
    'Android Studio → File → New → Project from Version Control (or “Get from VCS” on the welcome screen).',
    'Paste the clone URL below and click Clone. The first time, Android Studio asks you to sign in to GitHub (GitHub’s own sign-in).',
    'Web project (React/Vite): run the Capacitor commands below and open the android/ folder they create.',
  ],
  iosIdeSteps: [
    'On a Mac: Xcode → Integrate → Clone… (or “Clone Git Repository” on the welcome screen) and paste the clone URL below.',
    'Web project (React/Vite): run the Capacitor commands below; the last one opens the iOS project in Xcode.',
    'To publish: Product → Archive → Distribute App. The build then shows up under “builds” in Vertal Chat.',
  ],
  commandsTitle: 'Commands (Capacitor)',
  commandsNote: 'If the project already has capacitor.config, skip “npx cap init”. Change --web-dir if the build is not output to dist.',
  iosMacNote: 'Requires a Mac with Xcode and CocoaPods; iOS does not build on Windows/Linux.',
  copy: 'Copy',
  copied: 'Copied',
  downloadZip: 'Download ZIP',
  openGithub: 'Open on GitHub',
}

const es: MsTexts = {
  back: 'Volver a los conectores',
  via: 'Vertal Dev · Conectores',
  playTitle: 'Google Play Console',
  playIntro: 'Inicia sesión con tu cuenta de Google (inicio de sesión oficial de Google, OAuth). Vertal solo pide el permiso de Google Play Developer API.',
  playAccessTitle: 'Importante: da acceso en Play Console',
  playAccessSteps: [
    'El inicio de sesión prueba quién eres, pero Google solo responde sobre las apps que esta cuenta puede ver en Play Console.',
    'Si eres dueño de la cuenta de desarrollador, ya tienes acceso. Si no, pídeselo al dueño: Play Console → Usuarios y permisos → Invitar usuario nuevo → correo de esta cuenta de Google → acceso a las apps (ver información de la app; responder reseñas si quieres responder desde el chat).',
    'La invitación puede tardar unos minutos. Sin ella Google responde "sin permiso" (403).',
  ],
  playChatTitle: 'Después de conectar, pide en Vertal Chat:',
  playChatExamples: [
    '“Muestra las reseñas recientes de com.empresa.app”',
    '“¿En qué pista está la última versión de com.empresa.app?”',
    '“Lista las suscripciones de com.empresa.app”',
    '“Responde la reseña … con: ¡Gracias!” (pide tu aprobación)',
  ],
  androidTitle: 'Android Studio',
  androidHonest: 'Android Studio es una app de escritorio: no tiene inicio de sesión OAuth ni API para terceros. Aquí inicias sesión con Google (la misma conexión de Google Play Console, para publicar y seguir la app) y abres tu proyecto en Android Studio desde GitHub.',
  androidLoginTitle: 'Iniciar sesión con Google',
  androidLoginIntro: 'Es la misma conexión del conector Google Play Console: conectar aquí también lo conecta allí.',
  iosTitle: 'iOS / Xcode',
  iosHonest: 'Apple no ofrece OAuth para terceros en Xcode ni en App Store Connect (y “Iniciar sesión con Apple” solo identifica a la persona, no da acceso a App Store Connect). Por eso la conexión usa una clave de API del equipo, la forma oficial de Apple.',
  iosKeyTitle: 'Clave de API de App Store Connect',
  iosKeySteps: [
    'En App Store Connect (rol Admin): Usuarios y acceso → Integraciones → App Store Connect API → Claves del equipo.',
    'Genera una clave con el rol App Manager (o Developer, si solo quieres leer builds). Copia el Issuer ID (arriba) y el Key ID.',
    'Descarga AuthKey_<KeyID>.p8 (Apple solo deja descargarlo una vez) y pega todo su contenido en “Private key (.p8)”.',
    'La clave se guarda cifrada en el servidor de Vertal (nunca en el navegador). Para revocarla, desconecta aquí y revoca la clave en App Store Connect.',
  ],
  iosKeyIntro: 'Pega los tres datos de la clave. Vertal prueba la clave listando tus apps antes de guardar.',
  iosAppleIdNote: 'Después de conectar, pide en Vertal Chat: “lista mis apps en App Store Connect”, “qué builds se subieron de la app …”, “muestra las reseñas de la app …”.',
  projectTitle: 'Abrir el proyecto',
  projectIntro: 'Elige el repositorio de GitHub con tu proyecto (por ejemplo, el que exportaste de Vertal Dev).',
  repoLabel: 'Repositorio (owner/repo o URL de GitHub)',
  repoPlaceholder: 'ej.: mi-cuenta/mi-app',
  repoInvalid: 'Indica un repositorio de GitHub como owner/repo.',
  loadingRepos: 'Cargando tus repositorios…',
  noGithub: 'Conecta GitHub para elegir de la lista (o pega owner/repo abajo).',
  connectGithub: 'Iniciar sesión con GitHub',
  pickRepo: 'Tus repositorios',
  androidIdeSteps: [
    'Android Studio → File → New → Project from Version Control (o “Get from VCS” en la pantalla de inicio).',
    'Pega la URL de clonado abajo y haz clic en Clone. La primera vez, Android Studio pide iniciar sesión en GitHub (inicio de sesión del propio GitHub).',
    'Proyecto web (React/Vite): ejecuta los comandos de Capacitor de abajo y abre la carpeta android/ que crean.',
  ],
  iosIdeSteps: [
    'En un Mac: Xcode → Integrate → Clone… (o “Clone Git Repository” en la pantalla de inicio) y pega la URL de clonado.',
    'Proyecto web (React/Vite): ejecuta los comandos de Capacitor de abajo; el último abre el proyecto iOS en Xcode.',
    'Para publicar: Product → Archive → Distribute App. El build aparece luego en “builds” desde Vertal Chat.',
  ],
  commandsTitle: 'Comandos (Capacitor)',
  commandsNote: 'Si el proyecto ya tiene capacitor.config, omite “npx cap init”. Cambia --web-dir si el build no sale en dist.',
  iosMacNote: 'Necesita un Mac con Xcode y CocoaPods; iOS no compila en Windows/Linux.',
  copy: 'Copiar',
  copied: 'Copiado',
  downloadZip: 'Descargar ZIP',
  openGithub: 'Abrir en GitHub',
}

export const MS_UI: Record<MsLang, MsTexts> = { pt, en, es }
