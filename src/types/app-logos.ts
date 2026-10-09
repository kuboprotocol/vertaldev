export interface AppLogo {
  id: string
  app_id: string
  user_id: string
  name: string
  storage_path: string
  file_format: 'png' | 'jpg' | 'svg' | 'webp'
  file_size: number
  width?: number
  height?: number
  is_active: boolean
  is_primary: boolean
  created_at: string
  updated_at?: string
  description?: string
  color_palette?: string[] // RGB hex colors
  tags?: string[] // 'favicon', 'social', 'hero', etc
}

export interface AppLogosResponse {
  logos: AppLogo[]
  count: number
}

export interface UploadLogoResponse {
  success: boolean
  logo: Omit<AppLogo, 'publicUrl'>
  publicUrl: string
}
