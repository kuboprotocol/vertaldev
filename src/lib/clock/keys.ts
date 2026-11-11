// Chaves do Vertal Clock, sem dependências: quem só precisa saber se há alarme
// ligado (o app, ao iniciar) lê por aqui sem carregar o catálogo de cidades.
export const CLOCK_STORAGE_KEY = 'vertal-clock-v1';
/** Evento disparado em `window` a cada mudança (o app usa para ligar o despertador). */
export const CLOCK_CHANGE_EVENT = 'vertal-clock:change';
/** Lugar detectado pelo localizador (GPS), só para mostrar no relógio. */
export const CLOCK_PLACE_KEY = 'vertal-clock-place-v1';
