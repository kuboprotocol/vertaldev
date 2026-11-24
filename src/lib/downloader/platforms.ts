// Plataformas do downloader: a mesma lista que a edge function creative-download aplica.
export { checkDownloaderHost, DOWNLOADER_PLATFORMS, DOWNLOADER_COMING_SOON } from '../../../supabase/functions/_shared/downloaderPlatforms';
export type { DownloaderCheck } from '../../../supabase/functions/_shared/downloaderPlatforms';

export const DOWNLOADER_LIVE_LABEL = 'TikTok, Kwai, Instagram e X';
export const DOWNLOADER_SOON_NOTE = 'YouTube em breve';
