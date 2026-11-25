// Vertal Chat · Agendador — idiomas além de pt-BR/en/es (dicionário único: ver ../chatSchedulerI18n.ts).
// Traduções feitas por máquina (IA); precisam de revisão nativa antes de anunciar o idioma.
import type { SchedStrings } from "../chatSchedulerI18n.ts";
import { WEST_EUROPE } from "./westEurope.ts";
import { CENTRAL_EUROPE } from "./centralEurope.ts";
import { NORTH } from "./north.ts";
import { SOUTH_EAST } from "./southEast.ts";
import { CYRILLIC } from "./cyrillic.ts";
import { RTL } from "./rtl.ts";
import { ASIA } from "./asia.ts";
import { MORE } from "./more.ts";
import { VARIANTS } from "./variants.ts";

export const SCHEDULER_LANG_DATA: Record<string, SchedStrings> = {
  ...WEST_EUROPE,
  ...CENTRAL_EUROPE,
  ...NORTH,
  ...SOUTH_EAST,
  ...CYRILLIC,
  ...RTL,
  ...ASIA,
  ...MORE,
  ...VARIANTS,
};
