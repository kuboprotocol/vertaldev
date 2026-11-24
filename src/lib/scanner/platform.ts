// Ponte entre o scanner e cada plataforma: câmera nativa e compartilhamento no Android/iOS, download no navegador (Mac, Windows, Linux).
import { Capacitor } from '@capacitor/core';

export type DeliveryResult = 'shared' | 'downloaded';

/** Converte bytes em base64 em blocos (evita estourar a pilha com PDFs grandes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/**
 * Foto pela câmera ou pela galeria do aparelho (Android/iOS).
 * Devolve null se o usuário cancelar. Na web não é usada: lá vale o seletor de arquivos.
 */
export async function takeNativePhoto(): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      quality: 92,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      saveToGallery: false,
      correctOrientation: true,
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    return new File([blob], `foto-${Date.now()}.${photo.format === 'png' ? 'png' : 'jpg'}`, { type: blob.type || `image/${photo.format}` });
  } catch (err) {
    // Cancelar no sheet da câmera chega como erro no Capacitor: não é falha para o usuário.
    if (String(err).toLowerCase().includes('cancel')) return null;
    throw err;
  }
}

/**
 * Entrega o PDF: no celular grava em cache e abre o compartilhamento do sistema
 * (Salvar em Arquivos, Drive, e-mail, impressão…). No navegador baixa o arquivo.
 */
export async function deliverPdf(bytes: Uint8Array, filename: string): Promise<DeliveryResult> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: filename, data: bytesToBase64(bytes), directory: Directory.Cache });
    await Share.share({ title: filename, files: [written.uri], dialogTitle: 'Salvar ou enviar PDF' });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
