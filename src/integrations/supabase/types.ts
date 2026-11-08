export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      office_documents: {
        Row: {
          content: Json | null
          created_at: string
          excerpt: string
          file_path: string | null
          file_name: string | null
          mime_type: string | null
          id: string
          kind: "doc" | "sheet" | "slides" | "pdf" | "file"
          size_bytes: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          excerpt?: string
          file_path?: string | null
          file_name?: string | null
          mime_type?: string | null
          id?: string
          kind: "doc" | "sheet" | "slides" | "pdf" | "file"
          size_bytes?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          excerpt?: string
          file_path?: string | null
          file_name?: string | null
          mime_type?: string | null
          id?: string
          kind?: "doc" | "sheet" | "slides" | "pdf" | "file"
          size_bytes?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creative_conversations: {
        Row: {
          archived: boolean | null
          created_at: string | null
          credits_used: number | null
          description: string | null
          free_conversations_used: number | null
          id: string
          model_used: string
          pinned: boolean | null
          tags: string[] | null
          title: string
          total_messages: number | null
          total_tokens: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archived?: boolean | null
          created_at?: string | null
          credits_used?: number | null
          description?: string | null
          free_conversations_used?: number | null
          id?: string
          model_used?: string
          pinned?: boolean | null
          tags?: string[] | null
          title: string
          total_messages?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archived?: boolean | null
          created_at?: string | null
          credits_used?: number | null
          description?: string | null
          free_conversations_used?: number | null
          id?: string
          model_used?: string
          pinned?: boolean | null
          tags?: string[] | null
          title?: string
          total_messages?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_free: boolean | null
          role: string
          tokens_used: number | null
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          role: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          role?: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "creative_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          ad_type: string
          created_at: string
          id: string
          last_shown_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_type?: string
          created_at?: string
          id?: string
          last_shown_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_type?: string
          created_at?: string
          id?: string
          last_shown_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_rewards: {
        Row: {
          ad_type: string
          created_at: string
          id: string
          reward_credits: number
          user_id: string
        }
        Insert: {
          ad_type?: string
          created_at?: string
          id?: string
          reward_credits?: number
          user_id: string
        }
        Update: {
          ad_type?: string
          created_at?: string
          id?: string
          reward_credits?: number
          user_id?: string
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          amount_cents: number
          commission_cents: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          rate: number
          referred_id: string
          source: string
          source_ref: string
          status: string
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          commission_cents: number
          created_at?: string
          currency: string
          id?: string
          paid_at?: string | null
          rate: number
          referred_id: string
          source: string
          source_ref: string
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          commission_cents?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          rate?: number
          referred_id?: string
          source?: string
          source_ref?: string
          status?: string
        }
        Relationships: []
      }
      agent_jobs: {
        Row: {
          agent_slug: string
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          credits_charged: number
          duration_ms: number | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          input: Json
          last_action_id: string | null
          last_error: string | null
          metadata: Json | null
          next_retry_at: string | null
          output: Json | null
          paused_at: string | null
          request_id: string | null
          retry_count: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_slug: string
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          credits_charged?: number
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          last_action_id?: string | null
          last_error?: string | null
          metadata?: Json | null
          next_retry_at?: string | null
          output?: Json | null
          paused_at?: string | null
          request_id?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_slug?: string
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          credits_charged?: number
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          last_action_id?: string | null
          last_error?: string | null
          metadata?: Json | null
          next_retry_at?: string | null
          output?: Json | null
          paused_at?: string | null
          request_id?: string | null
          retry_count?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["slug"]
          },
        ]
      }
      agent_registry: {
        Row: {
          category: string
          created_at: string
          credit_cost: number
          description: string
          edge_function: string
          icon: string | null
          metadata: Json
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          credit_cost?: number
          description: string
          edge_function: string
          icon?: string | null
          metadata?: Json
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          credit_cost?: number
          description?: string
          edge_function?: string
          icon?: string | null
          metadata?: Json
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_gateway_cache: {
        Row: {
          content: string
          created_at: string
          expires_at: string
          key: string
          model: string
          task_kind: string
        }
        Insert: {
          content: string
          created_at?: string
          expires_at: string
          key: string
          model: string
          task_kind: string
        }
        Update: {
          content?: string
          created_at?: string
          expires_at?: string
          key?: string
          model?: string
          task_kind?: string
        }
        Relationships: []
      }
      ai_gateway_runs: {
        Row: {
          attempts: string[]
          cached: boolean
          completion_tokens: number | null
          cost_usd: number
          created_at: string
          dropped_messages: number
          duration_ms: number | null
          error: string | null
          id: string
          model: string | null
          project_id: string | null
          prompt_tokens: number | null
          provider: string | null
          status: string
          task_kind: string
          tier: string | null
          user_id: string
        }
        Insert: {
          attempts?: string[]
          cached?: boolean
          completion_tokens?: number | null
          cost_usd?: number
          created_at?: string
          dropped_messages?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          task_kind: string
          tier?: string | null
          user_id: string
        }
        Update: {
          attempts?: string[]
          cached?: boolean
          completion_tokens?: number | null
          cost_usd?: number
          created_at?: string
          dropped_messages?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          task_kind?: string
          tier?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_gateway_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_gateway_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "published_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      api_credentials: {
        Row: {
          ciphertext: string
          connector_slug: string
          created_at: string
          id: string
          iv: string
          masked_hint: string | null
          tag: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          connector_slug: string
          created_at?: string
          id?: string
          iv: string
          masked_hint?: string | null
          tag: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          connector_slug?: string
          created_at?: string
          id?: string
          iv?: string
          masked_hint?: string | null
          tag?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_shares: {
        Row: {
          created_at: string
          download_count: number
          expires_at: string | null
          id: string
          label: string | null
          last_accessed_at: string | null
          password_hash: string
          revoked_at: string | null
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          expires_at?: string | null
          id?: string
          label?: string | null
          last_accessed_at?: string | null
          password_hash: string
          revoked_at?: string | null
          size_bytes?: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          download_count?: number
          expires_at?: string | null
          id?: string
          label?: string | null
          last_accessed_at?: string | null
          password_hash?: string
          revoked_at?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          currency: string
          custom_amount_enabled: boolean
          id: boolean
          max_credits: number
          min_credits: number
          price_per_credit_cents: number
          updated_at: string
        }
        Insert: {
          currency?: string
          custom_amount_enabled?: boolean
          id?: boolean
          max_credits?: number
          min_credits?: number
          price_per_credit_cents?: number
          updated_at?: string
        }
        Update: {
          currency?: string
          custom_amount_enabled?: boolean
          id?: boolean
          max_credits?: number
          min_credits?: number
          price_per_credit_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      cloud_sessions: {
        Row: {
          billed_minutes: number
          container_ref: string
          created_at: string
          credits_spent: number
          id: string
          idle_timeout_seconds: number
          last_activity_at: string
          preview_url: string | null
          project_id: string
          started_at: string
          status: string
          terminal_url: string | null
          terminated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billed_minutes?: number
          container_ref: string
          created_at?: string
          credits_spent?: number
          id?: string
          idle_timeout_seconds?: number
          last_activity_at?: string
          preview_url?: string | null
          project_id: string
          started_at?: string
          status?: string
          terminal_url?: string | null
          terminated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billed_minutes?: number
          container_ref?: string
          created_at?: string
          credits_spent?: number
          id?: string
          idle_timeout_seconds?: number
          last_activity_at?: string
          preview_url?: string | null
          project_id?: string
          started_at?: string
          status?: string
          terminal_url?: string | null
          terminated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connect_products: {
        Row: {
          connected_account_id: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          id: string
          name: string
          price_cents: number
          stripe_price_id: string | null
          stripe_product_id: string
        }
        Insert: {
          connected_account_id: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          price_cents: number
          stripe_price_id?: string | null
          stripe_product_id: string
        }
        Update: {
          connected_account_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          contact_email: string | null
          created_at: string
          display_name: string | null
          id: string
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connector_activity_logs: {
        Row: {
          connector_slug: string
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json | null
          status: string
          user_id: string
        }
        Insert: {
          connector_slug: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          connector_slug?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          estimated_volume: string | null
          full_name: string
          id: string
          message: string
          reason: string
          status: string
          team_size: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          estimated_volume?: string | null
          full_name: string
          id?: string
          message: string
          reason: string
          status?: string
          team_size?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          estimated_volume?: string | null
          full_name?: string
          id?: string
          message?: string
          reason?: string
          status?: string
          team_size?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contract_deployments: {
        Row: {
          abi: Json
          block_number: number | null
          chain_id: number
          contract_address: string
          contract_id: string
          created_at: string
          deployer_address: string
          events: Json
          explorer_url: string | null
          gas_used: string | null
          id: string
          network: string
          status: string
          tx_hash: string
          user_id: string
        }
        Insert: {
          abi?: Json
          block_number?: number | null
          chain_id?: number
          contract_address: string
          contract_id: string
          created_at?: string
          deployer_address: string
          events?: Json
          explorer_url?: string | null
          gas_used?: string | null
          id?: string
          network?: string
          status?: string
          tx_hash: string
          user_id: string
        }
        Update: {
          abi?: Json
          block_number?: number | null
          chain_id?: number
          contract_address?: string
          contract_id?: string
          created_at?: string
          deployer_address?: string
          events?: Json
          explorer_url?: string | null
          gas_used?: string | null
          id?: string
          network?: string
          status?: string
          tx_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_deployments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "generated_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_reports: {
        Row: {
          component_stack: string | null
          created_at: string
          health: Json | null
          id: string
          message: string
          metadata: Json | null
          resource: string | null
          retry_count: number | null
          route: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          health?: Json | null
          id?: string
          message: string
          metadata?: Json | null
          resource?: string | null
          retry_count?: number | null
          route?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          health?: Json | null
          id?: string
          message?: string
          metadata?: Json | null
          resource?: string | null
          retry_count?: number | null
          route?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      creative_assets: {
        Row: {
          cancelled_by: string | null
          correlation_id: string | null
          created_at: string
          credits_spent: number
          error_message: string | null
          id: string
          idempotency_key: string | null
          last_retry_at: string | null
          metadata: Json
          output_text: string | null
          output_url: string | null
          prompt: string | null
          retry_count: number | null
          status: string
          tool: string
          trace_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_by?: string | null
          correlation_id?: string | null
          created_at?: string
          credits_spent?: number
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          last_retry_at?: string | null
          metadata?: Json
          output_text?: string | null
          output_url?: string | null
          prompt?: string | null
          retry_count?: number | null
          status?: string
          tool: string
          trace_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_by?: string | null
          correlation_id?: string | null
          created_at?: string
          credits_spent?: number
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          last_retry_at?: string | null
          metadata?: Json
          output_text?: string | null
          output_url?: string | null
          prompt?: string | null
          retry_count?: number | null
          status?: string
          tool?: string
          trace_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creative_audit_logs: {
        Row: {
          asset_id: string | null
          created_at: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          tool: string | null
          user_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          tool?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          tool?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_audit_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_audit_schedules: {
        Row: {
          created_at: string | null
          email: string
          export_interval_days: number | null
          id: string
          is_active: boolean | null
          last_error_notified_at: string | null
          last_run: string | null
          schedule_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          export_interval_days?: number | null
          id?: string
          is_active?: boolean | null
          last_error_notified_at?: string | null
          last_run?: string | null
          schedule_time: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          export_interval_days?: number | null
          id?: string
          is_active?: boolean | null
          last_error_notified_at?: string | null
          last_run?: string | null
          schedule_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_audit_trail: {
        Row: {
          action: string
          correlation_id: string | null
          created_at: string | null
          id: string
          params: Json | null
          step: string
          trace_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          params?: Json | null
          step: string
          trace_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          params?: Json | null
          step?: string
          trace_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_economy_founders: {
        Row: {
          founder_number: number
          joined_at: string
          user_id: string
        }
        Insert: {
          founder_number?: never
          joined_at?: string
          user_id: string
        }
        Update: {
          founder_number?: never
          joined_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creative_export_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          export_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          export_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          export_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_export_audit_log_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "creative_export_history"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_export_history: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          file_url: string | null
          format: string
          generation_started_at: string | null
          generation_time_ms: number | null
          id: string
          included_count: number | null
          item_count: number | null
          item_ids: string[] | null
          last_retry_at: string | null
          period_end: string | null
          period_start: string | null
          retry_count: number | null
          schedule_id: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          file_url?: string | null
          format: string
          generation_started_at?: string | null
          generation_time_ms?: number | null
          id?: string
          included_count?: number | null
          item_count?: number | null
          item_ids?: string[] | null
          last_retry_at?: string | null
          period_end?: string | null
          period_start?: string | null
          retry_count?: number | null
          schedule_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          file_url?: string | null
          format?: string
          generation_started_at?: string | null
          generation_time_ms?: number | null
          id?: string
          included_count?: number | null
          item_count?: number | null
          item_ids?: string[] | null
          last_retry_at?: string | null
          period_end?: string | null
          period_start?: string | null
          retry_count?: number | null
          schedule_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_export_history_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "creative_audit_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_export_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          export_id: string | null
          id: string
          level: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          export_id?: string | null
          id?: string
          level?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          export_id?: string | null
          id?: string
          level?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_export_logs_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "creative_export_history"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_filter_presets: {
        Row: {
          created_at: string | null
          created_by: string | null
          filters: Json
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_notification_preferences: {
        Row: {
          created_at: string | null
          id: string
          include_investigation_link: boolean
          notify_cancel: boolean
          notify_retry: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          include_investigation_link?: boolean
          notify_cancel?: boolean
          notify_retry?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          include_investigation_link?: boolean
          notify_cancel?: boolean
          notify_retry?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_org_branding: {
        Row: {
          logo_url: string | null
          org_name: string | null
          primary_color: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          logo_url?: string | null
          org_name?: string | null
          primary_color?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          logo_url?: string | null
          org_name?: string | null
          primary_color?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_scheduled_exports: {
        Row: {
          created_at: string | null
          email: string
          id: string
          last_run_at: string | null
          schedule_time: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          last_run_at?: string | null
          schedule_time: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          last_run_at?: string | null
          schedule_time?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creative_user_settings: {
        Row: {
          filter: string | null
          id: string
          search_query: string | null
          sort_order: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          filter?: string | null
          id?: string
          search_query?: string | null
          sort_order?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          filter?: string | null
          id?: string
          search_query?: string | null
          sort_order?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_orders: {
        Row: {
          amount_cents: number
          created_at: string
          credited_at: string | null
          credits: number
          currency: string
          id: string
          metadata: Json
          package_id: string | null
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credited_at?: string | null
          credits: number
          currency?: string
          id?: string
          metadata?: Json
          package_id?: string | null
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credited_at?: string | null
          credits?: number
          currency?: string
          id?: string
          metadata?: Json
          package_id?: string | null
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "credit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          currency: string
          id: string
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          currency?: string
          id?: string
          name: string
          price_cents: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          balance_after: number
          category: string
          created_at: string
          delta: number
          id: string
          idempotency_key: string | null
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          balance_after: number
          category?: string
          created_at?: string
          delta: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          balance_after?: number
          category?: string
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          branch: string | null
          commit_message: string | null
          commit_sha: string | null
          created_at: string
          duration_ms: number | null
          environment: string
          estimated_duration_ms: number | null
          external_id: string | null
          finished_at: string | null
          healthy: boolean | null
          id: string
          is_current: boolean
          log: string
          meta: Json
          provider: string | null
          rolled_back_to: string | null
          source: string
          started_at: string
          status: string
          trigger_reason: string | null
          triggered_by: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          branch?: string | null
          commit_message?: string | null
          commit_sha?: string | null
          created_at?: string
          duration_ms?: number | null
          environment?: string
          estimated_duration_ms?: number | null
          external_id?: string | null
          finished_at?: string | null
          healthy?: boolean | null
          id?: string
          is_current?: boolean
          log?: string
          meta?: Json
          provider?: string | null
          rolled_back_to?: string | null
          source?: string
          started_at?: string
          status?: string
          trigger_reason?: string | null
          triggered_by?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          branch?: string | null
          commit_message?: string | null
          commit_sha?: string | null
          created_at?: string
          duration_ms?: number | null
          environment?: string
          estimated_duration_ms?: number | null
          external_id?: string | null
          finished_at?: string | null
          healthy?: boolean | null
          id?: string
          is_current?: boolean
          log?: string
          meta?: Json
          provider?: string | null
          rolled_back_to?: string | null
          source?: string
          started_at?: string
          status?: string
          trigger_reason?: string | null
          triggered_by?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployments_rolled_back_to_fkey"
            columns: ["rolled_back_to"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      design_library: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          name: string
          preview_data: string | null
          reuse_count: number
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          name?: string
          preview_data?: string | null
          reuse_count?: number
          snapshot: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          name?: string
          preview_data?: string | null
          reuse_count?: number
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      design_reuses: {
        Row: {
          created_at: string
          design_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          design_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          design_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_reuses_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "design_library"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      filter_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          sorting: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          sorting?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          sorting?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      game_assets: {
        Row: {
          asset_type: string
          created_at: string
          file_size: number | null
          file_url: string
          game_id: string
          id: string
          metadata: Json | null
          mime_type: string | null
          name: string
          tags: string[] | null
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          file_size?: number | null
          file_url: string
          game_id: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          name: string
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          file_size?: number | null
          file_url?: string
          game_id?: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          name?: string
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_assets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_builds: {
        Row: {
          build_config: Json | null
          build_status: string | null
          build_time_ms: number | null
          bundle_size: number | null
          bundle_url: string | null
          completed_at: string | null
          compressed_size: number | null
          created_at: string
          game_id: string
          id: string
          started_at: string | null
          target_platform: string[] | null
          user_id: string
          version: string
        }
        Insert: {
          build_config?: Json | null
          build_status?: string | null
          build_time_ms?: number | null
          bundle_size?: number | null
          bundle_url?: string | null
          completed_at?: string | null
          compressed_size?: number | null
          created_at?: string
          game_id: string
          id?: string
          started_at?: string | null
          target_platform?: string[] | null
          user_id: string
          version: string
        }
        Update: {
          build_config?: Json | null
          build_status?: string | null
          build_time_ms?: number | null
          bundle_size?: number | null
          bundle_url?: string | null
          completed_at?: string | null
          compressed_size?: number | null
          created_at?: string
          game_id?: string
          id?: string
          started_at?: string | null
          target_platform?: string[] | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_builds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_entities: {
        Row: {
          components: Json | null
          created_at: string
          entity_type: string
          game_id: string
          id: string
          mesh_asset_id: string | null
          name: string
          parent_entity_id: string | null
          position: Json | null
          rotation: Json | null
          scale: Json | null
          scene_id: string
          updated_at: string
        }
        Insert: {
          components?: Json | null
          created_at?: string
          entity_type: string
          game_id: string
          id?: string
          mesh_asset_id?: string | null
          name: string
          parent_entity_id?: string | null
          position?: Json | null
          rotation?: Json | null
          scale?: Json | null
          scene_id: string
          updated_at?: string
        }
        Update: {
          components?: Json | null
          created_at?: string
          entity_type?: string
          game_id?: string
          id?: string
          mesh_asset_id?: string | null
          name?: string
          parent_entity_id?: string | null
          position?: Json | null
          rotation?: Json | null
          scale?: Json | null
          scene_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_entities_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_entities_mesh_asset_id_fkey"
            columns: ["mesh_asset_id"]
            isOneToOne: false
            referencedRelation: "game_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_entities_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "game_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_entities_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "game_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      game_scenes: {
        Row: {
          created_at: string
          description: string | null
          draw_calls: number | null
          environment: string | null
          game_id: string
          id: string
          name: string
          physics_enabled: boolean | null
          physics_type: string | null
          polygon_count: number | null
          scene_data: Json | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          draw_calls?: number | null
          environment?: string | null
          game_id: string
          id?: string
          name: string
          physics_enabled?: boolean | null
          physics_type?: string | null
          polygon_count?: number | null
          scene_data?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          draw_calls?: number | null
          environment?: string | null
          game_id?: string
          id?: string
          name?: string
          physics_enabled?: boolean | null
          physics_type?: string | null
          polygon_count?: number | null
          scene_data?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_scenes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_scripts: {
        Row: {
          created_at: string
          description: string | null
          game_id: string
          id: string
          is_builtin: boolean | null
          language: string | null
          name: string
          source_code: string
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          game_id: string
          id?: string
          is_builtin?: boolean | null
          language?: string | null
          name: string
          source_code: string
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          game_id?: string
          id?: string
          is_builtin?: boolean | null
          language?: string | null
          name?: string
          source_code?: string
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_scripts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          animations_count: number | null
          assets_count: number | null
          config: Json | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          embed_code: string | null
          engine: string
          game_type: string
          has_ai: boolean | null
          has_monetization: boolean | null
          id: string
          is_multiplayer: boolean | null
          likes: number | null
          meshes_count: number | null
          monetization_type: string | null
          plays: number | null
          published_at: string | null
          published_url: string | null
          rating: number | null
          scripts_count: number | null
          status: string | null
          textures_count: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          animations_count?: number | null
          assets_count?: number | null
          config?: Json | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          embed_code?: string | null
          engine: string
          game_type: string
          has_ai?: boolean | null
          has_monetization?: boolean | null
          id?: string
          is_multiplayer?: boolean | null
          likes?: number | null
          meshes_count?: number | null
          monetization_type?: string | null
          plays?: number | null
          published_at?: string | null
          published_url?: string | null
          rating?: number | null
          scripts_count?: number | null
          status?: string | null
          textures_count?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          animations_count?: number | null
          assets_count?: number | null
          config?: Json | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          embed_code?: string | null
          engine?: string
          game_type?: string
          has_ai?: boolean | null
          has_monetization?: boolean | null
          id?: string
          is_multiplayer?: boolean | null
          likes?: number | null
          meshes_count?: number | null
          monetization_type?: string | null
          plays?: number | null
          published_at?: string | null
          published_url?: string | null
          rating?: number | null
          scripts_count?: number | null
          status?: string | null
          textures_count?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_contracts: {
        Row: {
          created_at: string
          decimals: number
          id: string
          initial_supply: number
          metadata: Json
          name: string
          plan_id: string | null
          solidity_version: string
          source_code: string
          standard: string
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decimals?: number
          id?: string
          initial_supply?: number
          metadata?: Json
          name: string
          plan_id?: string | null
          solidity_version?: string
          source_code: string
          standard?: string
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          decimals?: number
          id?: string
          initial_supply?: number
          metadata?: Json
          name?: string
          plan_id?: string | null
          solidity_version?: string
          source_code?: string
          standard?: string
          symbol?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "orchestration_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connections: {
        Row: {
          access_token_ciphertext: string | null
          access_token_iv: string | null
          access_token_tag: string | null
          connected_at: string
          github_avatar_url: string | null
          github_username: string | null
          id: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          access_token_tag?: string | null
          connected_at?: string
          github_avatar_url?: string | null
          github_username?: string | null
          id?: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          access_token_tag?: string | null
          connected_at?: string
          github_avatar_url?: string | null
          github_username?: string | null
          id?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          nonce: string
          return_url: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce: string
          return_url?: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce?: string
          return_url?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_accounts: {
        Row: {
          access_token_cache: string | null
          access_token_expires_at: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          last_synced_at: string | null
          refresh_token_ciphertext: string
          refresh_token_iv: string
          refresh_token_tag: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_cache?: string | null
          access_token_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          last_synced_at?: string | null
          refresh_token_ciphertext: string
          refresh_token_iv: string
          refresh_token_tag: string
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_cache?: string | null
          access_token_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          last_synced_at?: string | null
          refresh_token_ciphertext?: string
          refresh_token_iv?: string
          refresh_token_tag?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          nonce: string
          origin: string
          return_url: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce: string
          origin: string
          return_url: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce?: string
          origin?: string
          return_url?: string
          user_id?: string
        }
        Relationships: []
      }
      job_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          details: Json | null
          id: string
          job_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          job_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_audit_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kubo_dns_records: {
        Row: {
          created_at: string
          domain_id: string
          id: string
          ionos_record_id: string | null
          name: string
          priority: number | null
          record_type: string
          ttl: number
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          id?: string
          ionos_record_id?: string | null
          name: string
          priority?: number | null
          record_type: string
          ttl?: number
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          id?: string
          ionos_record_id?: string | null
          name?: string
          priority?: number | null
          record_type?: string
          ttl?: number
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "kubo_dns_records_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "kubo_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      kubo_domain_transfer_events: {
        Row: {
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          message: string | null
          metadata: Json
          to_status: string | null
          transfer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          to_status?: string | null
          transfer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          to_status?: string | null
          transfer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kubo_domain_transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "kubo_domain_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      kubo_domain_transfers: {
        Row: {
          auth_code: string
          cancel_reason: string | null
          cancel_requested_at: string | null
          completed_at: string | null
          current_registrar: string | null
          domain_id: string | null
          domain_name: string
          id: string
          ionos_transfer_id: string | null
          last_error: string | null
          last_notified_at: string | null
          last_notified_status: string | null
          last_retry_at: string | null
          next_retry_at: string | null
          notify_email: string | null
          retry_count: number
          started_at: string
          status: string
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_code: string
          cancel_reason?: string | null
          cancel_requested_at?: string | null
          completed_at?: string | null
          current_registrar?: string | null
          domain_id?: string | null
          domain_name: string
          id?: string
          ionos_transfer_id?: string | null
          last_error?: string | null
          last_notified_at?: string | null
          last_notified_status?: string | null
          last_retry_at?: string | null
          next_retry_at?: string | null
          notify_email?: string | null
          retry_count?: number
          started_at?: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_code?: string
          cancel_reason?: string | null
          cancel_requested_at?: string | null
          completed_at?: string | null
          current_registrar?: string | null
          domain_id?: string | null
          domain_name?: string
          id?: string
          ionos_transfer_id?: string | null
          last_error?: string | null
          last_notified_at?: string | null
          last_notified_status?: string | null
          last_retry_at?: string | null
          next_retry_at?: string | null
          notify_email?: string | null
          retry_count?: number
          started_at?: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kubo_domain_transfers_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "kubo_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      kubo_domains: {
        Row: {
          auto_renew: boolean
          contract_id: string | null
          created_at: string
          credits_spent: number
          domain_name: string
          expires_at: string | null
          id: string
          ionos_domain_id: string | null
          metadata: Json
          nameservers: string[] | null
          project_id: string | null
          source: string
          ssl_status: string
          status: string
          tld: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          contract_id?: string | null
          created_at?: string
          credits_spent?: number
          domain_name: string
          expires_at?: string | null
          id?: string
          ionos_domain_id?: string | null
          metadata?: Json
          nameservers?: string[] | null
          project_id?: string | null
          source: string
          ssl_status?: string
          status?: string
          tld: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          contract_id?: string | null
          created_at?: string
          credits_spent?: number
          domain_name?: string
          expires_at?: string | null
          id?: string
          ionos_domain_id?: string | null
          metadata?: Json
          nameservers?: string[] | null
          project_id?: string | null
          source?: string
          ssl_status?: string
          status?: string
          tld?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kubo_ionos_contracts: {
        Row: {
          admin_id: string | null
          contract_id: string
          created_at: string
          id: string
          plan: string
          reseller_reference: string
          resource_limits: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          contract_id: string
          created_at?: string
          id?: string
          plan?: string
          reseller_reference: string
          resource_limits?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          plan?: string
          reseller_reference?: string
          resource_limits?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      local_agent_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mobile_devices: {
        Row: {
          apns_token: string
          app_version: string | null
          created_at: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apns_token: string
          app_version?: string | null
          created_at?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apns_token?: string
          app_version?: string | null
          created_at?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      npc_memories: {
        Row: {
          created_at: string
          id: string
          memory: Json
          npc_id: string
          persona: string | null
          updated_at: string
          user_id: string
          world_seed: number
        }
        Insert: {
          created_at?: string
          id?: string
          memory?: Json
          npc_id: string
          persona?: string | null
          updated_at?: string
          user_id: string
          world_seed?: number
        }
        Update: {
          created_at?: string
          id?: string
          memory?: Json
          npc_id?: string
          persona?: string | null
          updated_at?: string
          user_id?: string
          world_seed?: number
        }
        Relationships: []
      }
      orchestration_plans: {
        Row: {
          capabilities: string[]
          correlation_id: string | null
          created_at: string
          id: string
          intent: string
          model: string
          prompt: string
          stack: Json
          task_states: Json
          tasks: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          capabilities?: string[]
          correlation_id?: string | null
          created_at?: string
          id?: string
          intent: string
          model?: string
          prompt: string
          stack?: Json
          task_states?: Json
          tasks?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          capabilities?: string[]
          correlation_id?: string | null
          created_at?: string
          id?: string
          intent?: string
          model?: string
          prompt?: string
          stack?: Json
          task_states?: Json
          tasks?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orchestrator_config: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      orchestrator_routing_log: {
        Row: {
          agent: string
          confidence: number | null
          correlation_id: string | null
          created_at: string
          id: string
          mode: string | null
          prompt: string
          reason: string | null
          request_id: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          agent: string
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          mode?: string | null
          prompt: string
          reason?: string | null
          request_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          agent?: string
          confidence?: number | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          mode?: string | null
          prompt?: string
          reason?: string | null
          request_id?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pending_credits: {
        Row: {
          applied_at: string | null
          applied_user_id: string | null
          created_at: string
          credits: number
          email: string
          granted_by: string | null
          id: string
          reason: string
        }
        Insert: {
          applied_at?: string | null
          applied_user_id?: string | null
          created_at?: string
          credits: number
          email: string
          granted_by?: string | null
          id?: string
          reason?: string
        }
        Update: {
          applied_at?: string | null
          applied_user_id?: string | null
          created_at?: string
          credits?: number
          email?: string
          granted_by?: string | null
          id?: string
          reason?: string
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          metric_name: string
          user_id: string | null
          value_ms: number
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          metric_name: string
          user_id?: string | null
          value_ms: number
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          metric_name?: string
          user_id?: string | null
          value_ms?: number
        }
        Relationships: []
      }
      plan_config: {
        Row: {
          ad_frequency_hours: number | null
          created_at: string
          daily_credits: number
          display_name: string
          partnership_required: boolean
          plan: string
          price_usd: number
          signup_credits: number
        }
        Insert: {
          ad_frequency_hours?: number | null
          created_at?: string
          daily_credits?: number
          display_name: string
          partnership_required?: boolean
          plan: string
          price_usd?: number
          signup_credits?: number
        }
        Update: {
          ad_frequency_hours?: number | null
          created_at?: string
          daily_credits?: number
          display_name?: string
          partnership_required?: boolean
          plan?: string
          price_usd?: number
          signup_credits?: number
        }
        Relationships: []
      }
      prime_memories: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          project_id: string | null
          scope: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: string
          project_id?: string | null
          scope: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          scope?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prime_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prime_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "published_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          referral_code: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          referral_code?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          referral_code?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_versions: {
        Row: {
          created_at: string | null
          description: string | null
          generated_code: string | null
          id: string
          project_id: string
          published_at: string | null
          title: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          generated_code?: string | null
          id?: string
          project_id: string
          published_at?: string | null
          title: string
          version_number?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          generated_code?: string | null
          id?: string
          project_id?: string
          published_at?: string | null
          title?: string
          version_number?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          generated_code: string | null
          id: string
          is_published: boolean
          messages: Json | null
          published_at: string | null
          published_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          generated_code?: string | null
          id?: string
          is_published?: boolean
          messages?: Json | null
          published_at?: string | null
          published_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          generated_code?: string | null
          id?: string
          is_published?: boolean
          messages?: Json | null
          published_at?: string | null
          published_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          apns_id: string | null
          body: string
          created_at: string
          error_reason: string | null
          id: string
          kind: string
          metadata: Json
          status: string
          title: string
          triggered_by: string | null
          user_id: string
        }
        Insert: {
          apns_id?: string | null
          body: string
          created_at?: string
          error_reason?: string | null
          id?: string
          kind?: string
          metadata?: Json
          status?: string
          title: string
          triggered_by?: string | null
          user_id: string
        }
        Update: {
          apns_id?: string | null
          body?: string
          created_at?: string
          error_reason?: string | null
          id?: string
          kind?: string
          metadata?: Json
          status?: string
          title?: string
          triggered_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pwa_telemetry_audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string | null
          deleted_count: number
          filters: Json
          id: string
        }
        Insert: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          deleted_count?: number
          filters?: Json
          id?: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          deleted_count?: number
          filters?: Json
          id?: string
        }
        Relationships: []
      }
      pwa_telemetry_events: {
        Row: {
          canvas_id: string | null
          created_at: string
          id: string
          metadata: Json
          session_id: string
          type: string
          url: string
          user_id: string | null
        }
        Insert: {
          canvas_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          session_id: string
          type: string
          url: string
          user_id?: string | null
        }
        Update: {
          canvas_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          session_id?: string
          type?: string
          url?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pwa_telemetry_export_jobs: {
        Row: {
          created_at: string | null
          error_message: string | null
          filters: Json | null
          format: string
          id: string
          progress: number | null
          result_url: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          filters?: Json | null
          format: string
          id?: string
          progress?: number | null
          result_url?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          filters?: Json | null
          format?: string
          id?: string
          progress?: number | null
          result_url?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pwa_telemetry_metrics: {
        Row: {
          created_at: string | null
          duration_ms: number
          filters: Json | null
          id: string
          operation: string
          row_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms: number
          filters?: Json | null
          id?: string
          operation: string
          row_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number
          filters?: Json | null
          id?: string
          operation?: string
          row_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      pwa_telemetry_settings: {
        Row: {
          anomaly_threshold_sigma: number | null
          created_at: string | null
          id: string
          is_notifications_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
          webhook_url: string | null
        }
        Insert: {
          anomaly_threshold_sigma?: number | null
          created_at?: string | null
          id?: string
          is_notifications_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          anomaly_threshold_sigma?: number | null
          created_at?: string | null
          id?: string
          is_notifications_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      pwa_telemetry_webhooks: {
        Row: {
          created_at: string | null
          event_types: string[]
          id: string
          is_active: boolean | null
          url: string
        }
        Insert: {
          created_at?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean | null
          url: string
        }
        Update: {
          created_at?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean | null
          url?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket_key: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          credits_awarded: number
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          credits_awarded?: number
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      render_auto_heal_policies: {
        Row: {
          connection_id: string
          created_at: string
          e2e_run_on_deploy: boolean
          e2e_webhook_url: string | null
          enabled: boolean
          health_url: string | null
          id: string
          max_restarts_per_hour: number
          rollback_on_fail: boolean
          service_id: string
          service_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          e2e_run_on_deploy?: boolean
          e2e_webhook_url?: string | null
          enabled?: boolean
          health_url?: string | null
          id?: string
          max_restarts_per_hour?: number
          rollback_on_fail?: boolean
          service_id: string
          service_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          e2e_run_on_deploy?: boolean
          e2e_webhook_url?: string | null
          enabled?: boolean
          health_url?: string | null
          id?: string
          max_restarts_per_hour?: number
          rollback_on_fail?: boolean
          service_id?: string
          service_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_auto_heal_policies_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "render_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      render_connections: {
        Row: {
          api_key_ciphertext: string
          api_key_hint: string | null
          api_key_iv: string
          api_key_tag: string
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_latency_ms: number | null
          last_status: string
          name: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          api_key_ciphertext: string
          api_key_hint?: string | null
          api_key_iv: string
          api_key_tag: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          name?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          api_key_ciphertext?: string
          api_key_hint?: string | null
          api_key_iv?: string
          api_key_tag?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      render_heal_events: {
        Row: {
          action: string
          connection_id: string | null
          created_at: string
          detail: Json
          id: string
          service_id: string
          status: string
          trigger: string
          user_id: string
        }
        Insert: {
          action: string
          connection_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          service_id: string
          status: string
          trigger: string
          user_id: string
        }
        Update: {
          action?: string
          connection_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          service_id?: string
          status?: string
          trigger?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_heal_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "render_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_errors: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          message: string
          meta: Json
          release: string | null
          severity: string
          stack: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          message: string
          meta?: Json
          release?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          message?: string
          meta?: Json
          release?: string | null
          severity?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          job_id: string | null
          metadata: Json
          request_id: string | null
          resource_id: string | null
          resource_type: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          job_id?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          job_id?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      session_builds: {
        Row: {
          arch: string
          command: string | null
          created_at: string
          credits_spent: number
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          kind: string
          logs: string
          platform: string
          preview_url: string | null
          project_id: string | null
          session_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arch?: string
          command?: string | null
          created_at?: string
          credits_spent?: number
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          logs?: string
          platform?: string
          preview_url?: string | null
          project_id?: string | null
          session_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arch?: string
          command?: string | null
          created_at?: string
          credits_spent?: number
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          logs?: string
          platform?: string
          preview_url?: string | null
          project_id?: string | null
          session_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_builds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cloud_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlink_clicks: {
        Row: {
          clicked_at: string
          completed: boolean
          completed_at: string | null
          id: string
          ip_address: string | null
          reward_credited: number
          shortlink_id: string
          user_id: string
        }
        Insert: {
          clicked_at?: string
          completed?: boolean
          completed_at?: string | null
          id?: string
          ip_address?: string | null
          reward_credited?: number
          shortlink_id: string
          user_id: string
        }
        Update: {
          clicked_at?: string
          completed?: boolean
          completed_at?: string | null
          id?: string
          ip_address?: string | null
          reward_credited?: number
          shortlink_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortlink_clicks_shortlink_id_fkey"
            columns: ["shortlink_id"]
            isOneToOne: false
            referencedRelation: "shortlinks"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlink_views: {
        Row: {
          id: string
          ip_address: unknown
          shortlink_id: string
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown
          shortlink_id: string
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown
          shortlink_id?: string
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortlink_views_shortlink_id_fkey"
            columns: ["shortlink_id"]
            isOneToOne: false
            referencedRelation: "shortlinks"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlinks: {
        Row: {
          created_at: string
          destination_url: string
          id: string
          is_active: boolean
          reward_credits: number
          slug: string
          title: string
          wait_seconds: number
        }
        Insert: {
          created_at?: string
          destination_url: string
          id?: string
          is_active?: boolean
          reward_credits?: number
          slug: string
          title?: string
          wait_seconds?: number
        }
        Update: {
          created_at?: string
          destination_url?: string
          id?: string
          is_active?: boolean
          reward_credits?: number
          slug?: string
          title?: string
          wait_seconds?: number
        }
        Relationships: []
      }
      skill_executions: {
        Row: {
          created_at: string
          credits_charged: number | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input: Json
          output: Json | null
          skill_name: string | null
          skill_slug: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits_charged?: number | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json
          output?: Json | null
          skill_name?: string | null
          skill_slug: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits_charged?: number | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input?: Json
          output?: Json | null
          skill_name?: string | null
          skill_slug?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      skill_imports: {
        Row: {
          cancel_requested: boolean
          created_at: string
          file_name: string
          id: string
          logs: Json
          notes: string | null
          progress: Json
          size_bytes: number | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string
          validation: Json | null
        }
        Insert: {
          cancel_requested?: boolean
          created_at?: string
          file_name: string
          id?: string
          logs?: Json
          notes?: string | null
          progress?: Json
          size_bytes?: number | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
          validation?: Json | null
        }
        Update: {
          cancel_requested?: boolean
          created_at?: string
          file_name?: string
          id?: string
          logs?: Json
          notes?: string | null
          progress?: Json
          size_bytes?: number | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
          validation?: Json | null
        }
        Relationships: []
      }
      slide_decks: {
        Row: {
          created_at: string
          id: string
          theme: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          theme?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          theme?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      slide_pages: {
        Row: {
          content: Json
          created_at: string
          deck_id: string
          id: string
          layout: string
          notes: string | null
          position: number
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          deck_id: string
          id?: string
          layout?: string
          notes?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          deck_id?: string
          id?: string
          layout?: string
          notes?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_pages_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "slide_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          edits_limit: number
          edits_used: number
          id: string
          is_active: boolean
          last_daily_credit_at: string | null
          paid_at: string | null
          partnership_agreement_signed: boolean
          plan: string
          signup_credits_granted: boolean
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          edits_limit?: number
          edits_used?: number
          id?: string
          is_active?: boolean
          last_daily_credit_at?: string | null
          paid_at?: string | null
          partnership_agreement_signed?: boolean
          plan?: string
          signup_credits_granted?: boolean
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          edits_limit?: number
          edits_used?: number
          id?: string
          is_active?: boolean
          last_daily_credit_at?: string | null
          paid_at?: string | null
          partnership_agreement_signed?: boolean
          plan?: string
          signup_credits_granted?: boolean
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_type: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          badge_type: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          badge_type?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string | null
          debt: number
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          debt?: number
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          debt?: number
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits_audit: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          changed_by: string | null
          created_at: string | null
          debt_after: number | null
          debt_before: number | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          changed_by?: string | null
          created_at?: string | null
          debt_after?: number | null
          debt_before?: number | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          changed_by?: string | null
          created_at?: string | null
          debt_after?: number | null
          debt_before?: number | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_activity_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vibe_agent_runs: {
        Row: {
          agent_id: string
          created_at: string
          credits_spent: number
          finished_at: string | null
          id: string
          output: string | null
          status: string
          steps: Json
          task: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          credits_spent?: number
          finished_at?: string | null
          id?: string
          output?: string | null
          status: string
          steps?: Json
          task: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          credits_spent?: number
          finished_at?: string | null
          id?: string
          output?: string | null
          status?: string
          steps?: Json
          task?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "vibe_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_agents: {
        Row: {
          created_at: string
          id: string
          instructions: string
          name: string
          tools: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions: string
          name: string
          tools?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          name?: string
          tools?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vibe_checkpoints: {
        Row: {
          commit_sha: string
          created_at: string
          credits_spent: number
          files_changed: Json
          id: string
          model_used: string | null
          parent_sha: string | null
          project_repo: string
          reverted_checkpoint_id: string | null
          summary: string
          user_id: string
        }
        Insert: {
          commit_sha: string
          created_at?: string
          credits_spent?: number
          files_changed?: Json
          id?: string
          model_used?: string | null
          parent_sha?: string | null
          project_repo: string
          reverted_checkpoint_id?: string | null
          summary: string
          user_id: string
        }
        Update: {
          commit_sha?: string
          created_at?: string
          credits_spent?: number
          files_changed?: Json
          id?: string
          model_used?: string | null
          parent_sha?: string | null
          project_repo?: string
          reverted_checkpoint_id?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_checkpoints_reverted_checkpoint_id_fkey"
            columns: ["reverted_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "vibe_checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          last_message_at: string
          message_count: number
          project_id: string | null
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          project_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          message_count?: number
          project_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "published_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          steps: Json
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          steps?: Json
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          steps?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "vibe_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_project_files: {
        Row: {
          commit_sha: string | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          path: string
          project_id: string | null
          source: string
          user_id: string
          version: number
        }
        Insert: {
          commit_sha?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          path: string
          project_id?: string | null
          source?: string
          user_id: string
          version?: number
        }
        Update: {
          commit_sha?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          path?: string
          project_id?: string | null
          source?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vibe_project_files_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "vibe_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "published_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_requirements: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          project_id: string | null
          reason: string | null
          secrets: string[]
          slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          project_id?: string | null
          reason?: string | null
          secrets?: string[]
          slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          project_id?: string | null
          reason?: string | null
          secrets?: string[]
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_requirements_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "vibe_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibe_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "published_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_sandbox_sessions: {
        Row: {
          credits_charged: number
          e2b_sandbox_id: string | null
          ended_at: string | null
          error_message: string | null
          id: string
          last_heartbeat_at: string
          preview_url: string | null
          project_repo: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          credits_charged?: number
          e2b_sandbox_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          last_heartbeat_at?: string
          preview_url?: string | null
          project_repo: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          credits_charged?: number
          e2b_sandbox_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          last_heartbeat_at?: string
          preview_url?: string | null
          project_repo?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      web3_connections: {
        Row: {
          api_key_ciphertext: string | null
          api_key_hint: string | null
          api_key_iv: string | null
          api_key_tag: string | null
          connection_name: string
          created_at: string
          explorer_url: string
          id: string
          last_block: number | null
          last_checked_at: string | null
          last_error: string | null
          last_latency_ms: number | null
          last_status: string
          network: string
          provider: string
          rpc_url_ciphertext: string
          rpc_url_iv: string
          rpc_url_tag: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_ciphertext?: string | null
          api_key_hint?: string | null
          api_key_iv?: string | null
          api_key_tag?: string | null
          connection_name: string
          created_at?: string
          explorer_url: string
          id?: string
          last_block?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          network: string
          provider: string
          rpc_url_ciphertext: string
          rpc_url_iv: string
          rpc_url_tag: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_ciphertext?: string | null
          api_key_hint?: string | null
          api_key_iv?: string | null
          api_key_tag?: string | null
          connection_name?: string
          created_at?: string
          explorer_url?: string
          id?: string
          last_block?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string
          network?: string
          provider?: string
          rpc_url_ciphertext?: string
          rpc_url_iv?: string
          rpc_url_tag?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      api_credentials_safe: {
        Row: {
          connector_slug: string | null
          created_at: string | null
          id: string | null
          masked_hint: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connector_slug?: string | null
          created_at?: string | null
          id?: string | null
          masked_hint?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connector_slug?: string | null
          created_at?: string | null
          id?: string | null
          masked_hint?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      github_connections_safe: {
        Row: {
          connected_at: string | null
          github_avatar_url: string | null
          github_username: string | null
          id: string | null
          scope: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          github_avatar_url?: string | null
          github_username?: string | null
          id?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          github_avatar_url?: string | null
          github_username?: string | null
          id?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gmail_accounts_safe: {
        Row: {
          access_token_expires_at: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          last_synced_at: string | null
          scope: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          last_synced_at?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          last_synced_at?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      leaderboard_badges: {
        Row: {
          badge_type: string | null
          user_id: string | null
        }
        Insert: {
          badge_type?: string | null
          user_id?: string | null
        }
        Update: {
          badge_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      leaderboard_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      leaderboard_streaks: {
        Row: {
          current_streak: number | null
          last_activity_date: string | null
          longest_streak: number | null
          user_id: string | null
        }
        Insert: {
          current_streak?: number | null
          last_activity_date?: string | null
          longest_streak?: number | null
          user_id?: string | null
        }
        Update: {
          current_streak?: number | null
          last_activity_date?: string | null
          longest_streak?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      published_projects: {
        Row: {
          created_at: string | null
          description: string | null
          generated_code: string | null
          id: string | null
          is_published: boolean | null
          published_at: string | null
          published_url: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          generated_code?: string | null
          id?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_url?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          generated_code?: string | null
          id?: string | null
          is_published?: boolean | null
          published_at?: string | null
          published_url?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      web3_connections_safe: {
        Row: {
          api_key_hint: string | null
          connection_name: string | null
          created_at: string | null
          explorer_url: string | null
          id: string | null
          last_block: number | null
          last_checked_at: string | null
          last_error: string | null
          last_latency_ms: number | null
          last_status: string | null
          network: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          api_key_hint?: string | null
          connection_name?: string | null
          created_at?: string | null
          explorer_url?: string | null
          id?: string | null
          last_block?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string | null
          network?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_hint?: string | null
          connection_name?: string | null
          created_at?: string | null
          explorer_url?: string | null
          id?: string | null
          last_block?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          last_latency_ms?: number | null
          last_status?: string | null
          network?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_clear_connector_run: {
        Args: { _connector_slug: string; _run_id: string }
        Returns: number
      }
      admin_list_connector_runs: {
        Args: { _connector_slug: string; _limit?: number }
        Returns: {
          event_count: number
          is_mine: boolean
          run_id: string
          run_label: string
          started_at: string
          user_id: string
        }[]
      }
      apply_credit_debt: {
        Args: { _reward_amount: number; _user_id: string }
        Returns: {
          debt_paid: number
          new_balance: number
          new_debt: number
          reward_applied: number
        }[]
      }
      apply_daily_credits: { Args: never; Returns: undefined }
      bump_rate_limit: {
        Args: { _bucket: string; _user: string; _window_seconds: number }
        Returns: number
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      calculate_shortlink_rewards: {
        Args: { _reward_date?: string; _user_id: string }
        Returns: {
          base_reward: number
          bonus_reward: number
          reward_date: string
          total_reward: number
          user_balance_after: number
        }[]
      }
      charge_design_storage_daily: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      check_shortlink_limits: {
        Args: { _user_id: string }
        Returns: {
          active_count: number
          can_create_more: boolean
          daily_bonus_reward: number
          total_daily_reward: number
        }[]
      }
      design_storage_credits_per_day: {
        Args: { _count: number }
        Returns: number
      }
      execute_atomic_credit_deduction: {
        Args: {
          _amount: number
          _category?: string
          _idempotency_key?: string
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      execute_atomic_credit_topup: {
        Args: {
          _amount: number
          _category?: string
          _idempotency_key?: string
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      execute_job_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_correlation_id?: string
          p_job_id: string
        }
        Returns: Json
      }
      find_referrer_by_code: { Args: { _code: string }; Returns: string }
      get_creative_audit_logs: {
        Args: {
          p_end_date?: string
          p_id_field: string
          p_id_value: string
          p_search?: string
          p_start_date?: string
          p_table: string
        }
        Returns: Json
      }
      get_my_referral_code: { Args: never; Returns: string }
      get_user_credits: {
        Args: { _user_id: string }
        Returns: {
          available_balance: number
          balance: number
          debt: number
        }[]
      }
      get_user_shortlinks_with_stats: {
        Args: { _user_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          status: string
          title: string
          updated_at: string
          video_duration_seconds: number
          video_url: string
          view_count: number
        }[]
      }
      grant_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      grant_referral_daily_credits: { Args: never; Returns: number }
      has_any_role: { Args: { _roles: string[] }; Returns: boolean }
      has_role: { Args: { _role: string }; Returns: boolean }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_kubo_admin: { Args: never; Returns: boolean }
      is_skill_admin: { Args: never; Returns: boolean }
      log_connector_activity: {
        Args: {
          _connector_slug: string
          _event_type: string
          _message: string
          _metadata?: Json
          _status?: string
        }
        Returns: string
      }
      log_security_audit: {
        Args: {
          _action: string
          _actor_role?: string
          _actor_user_id?: string
          _error_message?: string
          _ip?: unknown
          _job_id?: string
          _metadata?: Json
          _request_id?: string
          _resource_id?: string
          _resource_type: string
          _success?: boolean
          _user_agent?: string
        }
        Returns: string
      }
      record_affiliate_commission: {
        Args: {
          _amount_cents: number
          _currency: string
          _referred_id: string
          _source: string
          _source_ref: string
        }
        Returns: number
      }
      record_shortlink_view: {
        Args: {
          _ip_address: unknown
          _shortlink_id: string
          _user_agent: string
        }
        Returns: {
          success: boolean
          view_count: number
        }[]
      }
      reuse_published_design: {
        Args: { _design_id: string }
        Returns: Json
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
