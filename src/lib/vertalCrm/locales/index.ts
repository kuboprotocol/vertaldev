// Vertal CRM · os 18 idiomas além de pt-BR/en/es (mesmos das páginas de SEO do CRM grátis).
import type { CrmLang } from '../../../../supabase/functions/_shared/vertalCrm/core';
import type { CrmLocaleSource } from '../i18n';
import { ptPT } from './pt-PT';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { nl } from './nl';
import { pl } from './pl';
import { tr } from './tr';
import { ru } from './ru';
import { uk } from './uk';
import { ar } from './ar';
import { hi } from './hi';
import { id } from './id';
import { vi } from './vi';
import { th } from './th';
import { ja } from './ja';
import { ko } from './ko';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

export const CRM_LOCALE_SOURCES: Record<Exclude<CrmLang, 'pt' | 'en' | 'es'>, CrmLocaleSource> = {
  'pt-PT': ptPT, fr, de, it, nl, pl, tr, ru, uk, ar, hi, id, vi, th, ja, ko, 'zh-CN': zhCN, 'zh-TW': zhTW,
};
