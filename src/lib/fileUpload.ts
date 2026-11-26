import { supabase } from '@/integrations/supabase/client'

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  archive: ['application/zip', 'application/x-rar-compressed', 'application/vnd.rar'],
  spreadsheet: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'application/csv',
    'text/tab-separated-values',
  ],
}

/**
 * Extensões aceitas mesmo quando o navegador não informa o tipo (comum no
 * Windows com .csv, .xls e .rar). Mapeia extensão → categoria e tipo padrão.
 */
const EXTENSION_TYPES: Record<string, { category: FileCategory; mime: string }> = {
  xlsx: { category: 'spreadsheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xlsm: { category: 'spreadsheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls: { category: 'spreadsheet', mime: 'application/vnd.ms-excel' },
  ods: { category: 'spreadsheet', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  csv: { category: 'spreadsheet', mime: 'text/csv' },
  tsv: { category: 'spreadsheet', mime: 'text/tab-separated-values' },
  pdf: { category: 'document', mime: 'application/pdf' },
  doc: { category: 'document', mime: 'application/msword' },
  docx: { category: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  zip: { category: 'archive', mime: 'application/zip' },
  rar: { category: 'archive', mime: 'application/vnd.rar' },
}

/** Valor do atributo accept do seletor de arquivos: tipos + extensões aceitas. */
export const UPLOAD_ACCEPT = [
  'image/*', 'video/*', 'audio/*',
  ...Object.keys(EXTENSION_TYPES).map((e) => `.${e}`),
].join(',')

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Tipo efetivo do arquivo: o do navegador quando é aceito, senão o da extensão. */
export function resolveMimeType(file: Pick<File, 'name' | 'type'>): string {
  if (file.type && getAllAllowedTypes().includes(file.type)) return file.type
  return EXTENSION_TYPES[extensionOf(file.name)]?.mime ?? file.type
}

export function isSpreadsheetFile(file: Pick<File, 'name' | 'type'>): boolean {
  return getFileCategory(resolveMimeType(file)) === 'spreadsheet'
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'spreadsheet' | 'unknown'

export interface UploadedFile {
  url: string
  name: string
  size: number
  originalSize: number
  mimeType: string
  category: FileCategory
  path: string
  /** Para planilhas: conteúdo em CSV (amostra) para a IA ler os dados de verdade. */
  textPreview?: string
}

const SHEET_PREVIEW_MAX_ROWS = 200
const SHEET_PREVIEW_MAX_CHARS = 12000

/** Lê uma planilha (xlsx, xls, ods, csv) e devolve uma amostra em CSV por aba. */
export async function spreadsheetToText(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Não consegui ler a planilha.'))
    reader.readAsArrayBuffer(file)
  })
  const wb = XLSX.read(buffer, { type: 'array' })
  const parts: string[] = []
  let used = 0
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_csv(ws, { blankrows: false }).split('\n')
    const shown = rows.slice(0, SHEET_PREVIEW_MAX_ROWS)
    let block = `# Aba: ${sheetName} (${rows.length} linhas)\n${shown.join('\n')}`
    if (rows.length > shown.length) block += `\n… (+${rows.length - shown.length} linhas não mostradas)`
    if (used + block.length > SHEET_PREVIEW_MAX_CHARS) {
      parts.push(block.slice(0, Math.max(0, SHEET_PREVIEW_MAX_CHARS - used)) + '\n… (cortado)')
      break
    }
    parts.push(block)
    used += block.length
  }
  return parts.join('\n\n')
}

export function getFileCategory(mimeType: string): FileCategory {
  for (const [cat, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return cat as FileCategory
  }
  return 'unknown'
}

export function getAllAllowedTypes(): string[] {
  return Object.values(ALLOWED_TYPES).flat()
}

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100)
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo muito grande (máx. ${MAX_FILE_SIZE / 1024 / 1024}MB)`
  }
  const allAllowed = getAllAllowedTypes()
  if (!allAllowed.includes(resolveMimeType(file))) {
    return `Tipo de arquivo não suportado: ${file.type || file.name}. Aceitos: imagem, vídeo, áudio, PDF, Word, Excel/CSV/ODS e ZIP/RAR.`
  }
  return null
}

const COMPRESS_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const COMPRESS_MAX_WIDTH = 1920
const COMPRESS_QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  if (!COMPRESS_TYPES.includes(file.type)) return file
  // Skip small images (< 200KB)
  if (file.size < 200 * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > COMPRESS_MAX_WIDTH) {
        height = Math.round((height * COMPRESS_MAX_WIDTH) / width)
        width = COMPRESS_MAX_WIDTH
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      const outputType = file.type === 'image/png' ? 'image/webp' : file.type
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const ext = outputType === 'image/webp' ? '.webp' : file.name.substring(file.name.lastIndexOf('.'))
            const name = file.name.replace(/\.[^.]+$/, ext)
            resolve(new File([blob], name, { type: outputType }))
          } else {
            resolve(file) // Keep original if compressed is larger
          }
        },
        outputType,
        COMPRESS_QUALITY
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

export async function uploadFile(
  file: File,
  userId: string,
  onProgress?: (percent: number) => void
): Promise<UploadedFile> {
  const error = validateFile(file)
  if (error) throw new Error(error)

  onProgress?.(5)

  // Compress images before upload
  const processedFile = await compressImage(file)

  onProgress?.(15)

  const contentType = resolveMimeType(processedFile)
  const safeName = sanitizeFileName(processedFile.name)
  const timestamp = Date.now()
  const path = `${userId}/${timestamp}_${safeName}`

  console.log(`[uploadFile] Inciando upload para path: ${path}`, { contentType });
  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(path, processedFile, {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    console.error(`[uploadFile] Erro no upload:`, uploadError);
    throw new Error(`Upload falhou: ${uploadError.message}`)
  }
  console.log(`[uploadFile] Upload concluído com sucesso para: ${path}`);

  onProgress?.(90)

  const { data: urlData } = supabase.storage
    .from('uploads')
    .getPublicUrl(path)

  let textPreview: string | undefined
  if (getFileCategory(contentType) === 'spreadsheet') {
    try {
      textPreview = await spreadsheetToText(file)
    } catch (err) {
      console.warn('[uploadFile] Não consegui ler o conteúdo da planilha:', err)
    }
  }

  onProgress?.(100)

  return {
    textPreview,
    url: urlData.publicUrl,
    name: file.name,
    size: processedFile.size,
    originalSize: file.size,
    mimeType: contentType,
    category: getFileCategory(resolveMimeType(file)),
    path,
  }
}
