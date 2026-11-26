// Vertal Prospector · endereço, telefone e site no cartão do lead (dados já gravados em prospector_leads / CSV:
// address = "rua, número - bairro", city). Link do mapa = busca do Google Maps pelo endereço (nada é enviado ao lead).
import type { UiLang } from '@/lib/vertalUiLang';

export interface LeadPlace {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  domain?: string | null;
}

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** "São Paulo" + áreas da campanha "São Paulo, SP; Campinas, SP" → "São Paulo, SP" (estado só quando a área diz). */
export function cityWithState(city: string | null | undefined, areas: string[] = []): string {
  const c = clean(city);
  if (!c) return '';
  if (/,\s*\S/.test(c)) return c;
  for (const a of areas) {
    const [head, ...rest] = a.split(',').map((x) => x.trim());
    if (head && rest.length && norm(head) === norm(c)) return `${c}, ${rest.join(', ')}`;
  }
  return c;
}

/** Linha de endereço do cartão: "Rua X, 123 - Bairro · São Paulo, SP" (o que existir). */
export function leadAddressLine(l: LeadPlace, areas: string[] = []): string {
  const street = clean(l.address);
  const city = cityWithState(l.city, areas);
  if (street && city && norm(street).includes(norm(clean(l.city)))) return street;
  return [street, city].filter(Boolean).join(' · ');
}

/** Busca do Google Maps pelo endereço (com o nome da empresa quando só há cidade). Null sem endereço nem cidade. */
export function leadMapUrl(l: LeadPlace, areas: string[] = []): string | null {
  const street = clean(l.address);
  const city = cityWithState(l.city, areas);
  if (!street && !city) return null;
  const q = (street ? [clean(l.name), street, city] : [clean(l.name), city]).filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** tel: só com dígitos e + (null se não houver pelo menos 8 dígitos). */
export function leadTelHref(phone: string | null | undefined): string | null {
  const first = clean(phone).split(/[;,/]/)[0] ?? '';
  const d = first.replace(/[^\d+]/g, '');
  return d.replace(/\D/g, '').length >= 8 ? `tel:${d}` : null;
}

export const LEAD_CARD_TEXT: Record<UiLang, { address: string; map: string; phone: string; site: string }> = {
  pt: { address: 'Endereço', map: 'Ver no mapa', phone: 'Telefone', site: 'Site' },
  'pt-PT': { address: 'Morada', map: 'Ver no mapa', phone: 'Telefone', site: 'Site' },
  en: { address: 'Address', map: 'View on map', phone: 'Phone', site: 'Website' },
  es: { address: 'Dirección', map: 'Ver en el mapa', phone: 'Teléfono', site: 'Sitio' },
  fr: { address: 'Adresse', map: 'Voir sur la carte', phone: 'Téléphone', site: 'Site web' },
  de: { address: 'Adresse', map: 'Auf der Karte ansehen', phone: 'Telefon', site: 'Website' },
  it: { address: 'Indirizzo', map: 'Vedi sulla mappa', phone: 'Telefono', site: 'Sito web' },
  nl: { address: 'Adres', map: 'Op de kaart bekijken', phone: 'Telefoon', site: 'Website' },
  pl: { address: 'Adres', map: 'Zobacz na mapie', phone: 'Telefon', site: 'Strona www' },
  tr: { address: 'Adres', map: 'Haritada gör', phone: 'Telefon', site: 'Web sitesi' },
  ru: { address: 'Адрес', map: 'На карте', phone: 'Телефон', site: 'Сайт' },
  uk: { address: 'Адреса', map: 'На мапі', phone: 'Телефон', site: 'Сайт' },
  ar: { address: 'العنوان', map: 'عرض على الخريطة', phone: 'الهاتف', site: 'الموقع الإلكتروني' },
  hi: { address: 'पता', map: 'मैप पर देखें', phone: 'फ़ोन', site: 'वेबसाइट' },
  id: { address: 'Alamat', map: 'Lihat di peta', phone: 'Telepon', site: 'Situs web' },
  vi: { address: 'Địa chỉ', map: 'Xem trên bản đồ', phone: 'Điện thoại', site: 'Trang web' },
  th: { address: 'ที่อยู่', map: 'ดูบนแผนที่', phone: 'โทรศัพท์', site: 'เว็บไซต์' },
  ja: { address: '住所', map: '地図で見る', phone: '電話番号', site: 'ウェブサイト' },
  ko: { address: '주소', map: '지도에서 보기', phone: '전화번호', site: '웹사이트' },
  'zh-CN': { address: '地址', map: '在地图上查看', phone: '电话', site: '网站' },
  'zh-TW': { address: '地址', map: '在地圖上查看', phone: '電話', site: '網站' },
};
