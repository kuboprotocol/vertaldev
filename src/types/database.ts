// Auto-generated from Supabase schema
// Run: supabase gen types typescript --project-id sccizjlpwezsgaxkclot

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          cover_image_url: string | null
          game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
          engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom'
          config: Json
          assets_count: number
          meshes_count: number
          textures_count: number
          animations_count: number
          scripts_count: number
          status: string
          is_multiplayer: boolean
          has_ai: boolean
          has_monetization: boolean
          monetization_type: string | null
          published_url: string | null
          embed_code: string | null
          plays: number
          likes: number
          rating: number
          created_at: string
          updated_at: string
          published_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          cover_image_url?: string | null
          game_type: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
          engine: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom'
          config?: Json
          assets_count?: number
          meshes_count?: number
          textures_count?: number
          animations_count?: number
          scripts_count?: number
          status?: string
          is_multiplayer?: boolean
          has_ai?: boolean
          has_monetization?: boolean
          monetization_type?: string | null
          published_url?: string | null
          embed_code?: string | null
          plays?: number
          likes?: number
          rating?: number
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          cover_image_url?: string | null
          game_type?: '2d' | '3d' | 'retro' | 'realistic' | 'metaverse' | '4d'
          engine?: 'babylon' | 'threejs' | 'playcanvas' | 'pixijs' | 'phaser' | 'custom'
          config?: Json
          assets_count?: number
          meshes_count?: number
          textures_count?: number
          animations_count?: number
          scripts_count?: number
          status?: string
          is_multiplayer?: boolean
          has_ai?: boolean
          has_monetization?: boolean
          monetization_type?: string | null
          published_url?: string | null
          embed_code?: string | null
          plays?: number
          likes?: number
          rating?: number
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
      }
      game_scenes: {
        Row: {
          id: string
          game_id: string
          user_id: string
          name: string
          description: string | null
          scene_data: Json
          thumbnail_url: string | null
          environment: string | null
          physics_enabled: boolean
          physics_type: string
          draw_calls: number
          polygon_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          game_id: string
          user_id: string
          name: string
          description?: string | null
          scene_data?: Json
          thumbnail_url?: string | null
          environment?: string | null
          physics_enabled?: boolean
          physics_type?: string
          draw_calls?: number
          polygon_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          user_id?: string
          name?: string
          description?: string | null
          scene_data?: Json
          thumbnail_url?: string | null
          environment?: string | null
          physics_enabled?: boolean
          physics_type?: string
          draw_calls?: number
          polygon_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      game_assets: {
        Row: {
          id: string
          game_id: string
          user_id: string
          name: string
          asset_type: string
          file_url: string
          file_size: number | null
          mime_type: string | null
          tags: string[]
          metadata: Json
          usage_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          game_id: string
          user_id: string
          name: string
          asset_type: string
          file_url: string
          file_size?: number | null
          mime_type?: string | null
          tags?: string[]
          metadata?: Json
          usage_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          user_id?: string
          name?: string
          asset_type?: string
          file_url?: string
          file_size?: number | null
          mime_type?: string | null
          tags?: string[]
          metadata?: Json
          usage_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      game_entities: {
        Row: {
          id: string
          scene_id: string
          game_id: string
          name: string
          entity_type: string
          position: Json
          rotation: Json
          scale: Json
          mesh_asset_id: string | null
          components: Json
          parent_entity_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scene_id: string
          game_id: string
          name: string
          entity_type: string
          position?: Json
          rotation?: Json
          scale?: Json
          mesh_asset_id?: string | null
          components?: Json
          parent_entity_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scene_id?: string
          game_id?: string
          name?: string
          entity_type?: string
          position?: Json
          rotation?: Json
          scale?: Json
          mesh_asset_id?: string | null
          components?: Json
          parent_entity_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      game_scripts: {
        Row: {
          id: string
          game_id: string
          user_id: string
          name: string
          description: string | null
          language: string
          source_code: string
          version: number
          is_builtin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          game_id: string
          user_id: string
          name: string
          description?: string | null
          language?: string
          source_code: string
          version?: number
          is_builtin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          user_id?: string
          name?: string
          description?: string | null
          language?: string
          source_code?: string
          version?: number
          is_builtin?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      game_builds: {
        Row: {
          id: string
          game_id: string
          user_id: string
          version: string
          build_status: string
          bundle_url: string | null
          bundle_size: number | null
          target_platform: string[] | null
          build_config: Json
          build_time_ms: number | null
          compressed_size: number | null
          created_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          game_id: string
          user_id: string
          version: string
          build_status?: string
          bundle_url?: string | null
          bundle_size?: number | null
          target_platform?: string[] | null
          build_config?: Json
          build_time_ms?: number | null
          compressed_size?: number | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          game_id?: string
          user_id?: string
          version?: string
          build_status?: string
          bundle_url?: string | null
          bundle_size?: number | null
          target_platform?: string[] | null
          build_config?: Json
          build_time_ms?: number | null
          compressed_size?: number | null
          created_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}
