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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          created_at: string
          id: number
          message: string
          route: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          message: string
          route: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          message?: string
          route?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          event: string
          id: number
          route: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: never
          route: string
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: never
          route?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          account_email: string | null
          account_id: string
          created_at: string
          default_area: string | null
          feed_url: string | null
          id: string
          last_synced_at: string | null
          provider: string
          status: string
          status_detail: string | null
          sync_cursor: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          account_id: string
          created_at?: string
          default_area?: string | null
          feed_url?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          status?: string
          status_detail?: string | null
          sync_cursor?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          account_id?: string
          created_at?: string
          default_area?: string | null
          feed_url?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          status?: string
          status_detail?: string | null
          sync_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      share_links: {
        Row: {
          areas: string[]
          created_at: string
          expires_at: string | null
          id: string
          label: string | null
          last_viewed_at: string | null
          revoked_at: string | null
          token_hash: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          areas: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          areas?: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          body: string
          created_at: string
          date: string
          gratitude: string | null
          id: string
          mood: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          date: string
          gratitude?: string | null
          id?: string
          mood?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          date?: string
          gratitude?: string | null
          id?: string
          mood?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_steps: {
        Row: {
          created_at: string
          done: boolean
          goal_id: string
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          goal_id: string
          id?: string
          position?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          goal_id?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_steps_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          position: number
          term: string | null
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          term?: string | null
          user_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          term?: string | null
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          all_day: boolean
          area: string | null
          connection_id: string | null
          created_at: string
          date: string
          end_date: string | null
          ends_at: string | null
          external_calendar_id: string | null
          external_id: string | null
          html_link: string | null
          id: string
          location: string | null
          source: string
          starts_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          area?: string | null
          connection_id?: string | null
          created_at?: string
          date: string
          end_date?: string | null
          ends_at?: string | null
          external_calendar_id?: string | null
          external_id?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          source?: string
          starts_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          area?: string | null
          connection_id?: string | null
          created_at?: string
          date?: string
          end_date?: string | null
          ends_at?: string | null
          external_calendar_id?: string | null
          external_id?: string | null
          html_link?: string | null
          id?: string
          location?: string | null
          source?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          completed_at: string
          id: string
          label: string
          minutes: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          label: string
          minutes: number
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          label?: string
          minutes?: number
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          area: string
          created_at: string
          description: string | null
          id: string
          name: string
          progress: number
          project_id: string | null
          subproject_id: string | null
          updated_at: string
          position: number
          user_id: string
        }
        Insert: {
          area: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          progress?: number
          project_id?: string | null
          subproject_id?: string | null
          updated_at?: string
          position?: number
          user_id: string
        }
        Update: {
          area?: string
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          progress?: number
          project_id?: string | null
          subproject_id?: string | null
          updated_at?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      grounded_state: {
        Row: {
          created_at: string
          data: Json
          migrated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          migrated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          migrated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          created_at: string
          date: string
          habit_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          habit_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          area: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          position: number
          user_id: string
        }
        Insert: {
          area?: string
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          position?: number
          user_id: string
        }
        Update: {
          area?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      subprojects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subprojects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: string
          course_id: string | null
          created_at: string
          date: string | null
          description: string | null
          done: boolean
          id: string
          project_id: string | null
          subproject_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area: string
          course_id?: string | null
          created_at?: string
          date?: string | null
          description?: string | null
          done?: boolean
          id?: string
          project_id?: string | null
          subproject_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string
          course_id?: string | null
          created_at?: string
          date?: string | null
          description?: string | null
          done?: boolean
          id?: string
          project_id?: string | null
          subproject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_security: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_until: string | null
          passcode_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          passcode_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          passcode_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          accent: string
          assistant_length: string
          assistant_notes: string
          assistant_tone: string
          created_at: string
          default_cal_view: string
          density: string
          display_name: string
          nav_layout: string
          show_focus_timer: boolean
          updated_at: string
          user_id: string
          week_starts_on: number
          widgets: Json
        }
        Insert: {
          accent?: string
          assistant_length?: string
          assistant_notes?: string
          assistant_tone?: string
          created_at?: string
          default_cal_view?: string
          density?: string
          display_name?: string
          nav_layout?: string
          show_focus_timer?: boolean
          updated_at?: string
          user_id: string
          week_starts_on?: number
          widgets?: Json
        }
        Update: {
          accent?: string
          assistant_length?: string
          assistant_notes?: string
          assistant_tone?: string
          created_at?: string
          default_cal_view?: string
          density?: string
          display_name?: string
          nav_layout?: string
          show_focus_timer?: boolean
          updated_at?: string
          user_id?: string
          week_starts_on?: number
          widgets?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      admin_activity_weeks: {
        Args: Record<PropertyKey, never>
        Returns: { user_id: string; week_start: string }[]
      }
      change_passcode: {
        Args: { old_passcode: string; new_passcode: string }
        Returns: boolean
      }
      has_passcode: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      set_passcode: {
        Args: { new_passcode: string }
        Returns: undefined
      }
      verify_passcode: {
        Args: { candidate: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
