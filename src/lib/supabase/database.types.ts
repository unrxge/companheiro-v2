export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ArcType = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
export type ThematicTerritory =
  | 'creativity_devotion_curiosity'
  | 'healthy_masculinity_emotional_regulation'
  | 'inner_child_tending_expression'
  | 'slow_living_life_in_service'
export type EnergyLevel = 'low' | 'medium' | 'high'
export type CaptureStatus = 'captured' | 'developed' | 'activated' | 'archived'
export type IdeaStatus = 'developing' | 'ready' | 'active' | 'complete' | 'archived'
export type ProjectStatus = 'active' | 'complete' | 'archived'
export type PieceFormat = 'substack' | 'short_form' | 'both'
export type PieceStage = 'conceptualising' | 'writing' | 'translating' | 'executing' | 'posted'
export type LibraryType = 'music' | 'writing' | 'prompt' | 'reminder'
export type CheckInType = 'morning' | 'after_work' | 'evening' | 'moment'
export type TaskType = 'creation' | 'execution'
export type TaskStatus = 'pending' | 'complete'

// ─── Database schema ──────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      check_ins: {
        Row: {
          id: string
          user_id: string
          created_at: string
          raw_entry: string
          energy: EnergyLevel
          inner_weather: string
          creative_readiness: boolean
          creative_seed: string | null
          arc_texture: ArcType | null
          check_in_type: CheckInType | null
          dream_content: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          raw_entry: string
          energy: EnergyLevel
          inner_weather: string
          creative_readiness?: boolean
          creative_seed?: string | null
          arc_texture?: ArcType | null
          check_in_type?: CheckInType | null
          dream_content?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          raw_entry?: string
          energy?: EnergyLevel
          inner_weather?: string
          creative_readiness?: boolean
          creative_seed?: string | null
          arc_texture?: ArcType | null
          check_in_type?: CheckInType | null
          dream_content?: string | null
        }
      }
      captures: {
        Row: {
          id: string
          user_id: string
          created_at: string
          raw_input: string
          unpacked: string | null
          arc: ArcType | null
          thematic_territory: ThematicTerritory | null
          status: CaptureStatus
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          raw_input: string
          unpacked?: string | null
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          status?: CaptureStatus
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          raw_input?: string
          unpacked?: string | null
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          status?: CaptureStatus
        }
      }
      ideas: {
        Row: {
          id: string
          user_id: string
          created_at: string
          capture_id: string | null
          title: string
          one_sentence: string
          arc: ArcType | null
          thematic_territory: ThematicTerritory | null
          is_project: boolean
          status: IdeaStatus
          conceptualisation_log: Json | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          capture_id?: string | null
          title: string
          one_sentence: string
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          is_project?: boolean
          status?: IdeaStatus
          conceptualisation_log?: Json | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          capture_id?: string | null
          title?: string
          one_sentence?: string
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          is_project?: boolean
          status?: IdeaStatus
          conceptualisation_log?: Json | null
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          created_at: string
          idea_id: string | null
          title: string
          vision: string | null
          status: ProjectStatus
          piece_count: number
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          idea_id?: string | null
          title: string
          vision?: string | null
          status?: ProjectStatus
          piece_count?: number
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          idea_id?: string | null
          title?: string
          vision?: string | null
          status?: ProjectStatus
          piece_count?: number
        }
      }
      pieces: {
        Row: {
          id: string
          user_id: string
          created_at: string
          idea_id: string | null
          project_id: string | null
          title: string
          arc: ArcType | null
          thematic_territory: ThematicTerritory | null
          format: PieceFormat
          stage: PieceStage
          conviction_statement: string | null
          emotional_journey: string | null
          core_truth: string | null
          substack_goals: string | null
          short_form_goals: string | null
          open_threads: string[] | null
          substack_draft: string | null
          short_form_script: string | null
          next_action: string | null
          posted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          idea_id?: string | null
          project_id?: string | null
          title: string
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          format: PieceFormat
          stage?: PieceStage
          conviction_statement?: string | null
          emotional_journey?: string | null
          core_truth?: string | null
          substack_goals?: string | null
          short_form_goals?: string | null
          open_threads?: string[] | null
          substack_draft?: string | null
          short_form_script?: string | null
          next_action?: string | null
          posted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          idea_id?: string | null
          project_id?: string | null
          title?: string
          arc?: ArcType | null
          thematic_territory?: ThematicTerritory | null
          format?: PieceFormat
          stage?: PieceStage
          conviction_statement?: string | null
          emotional_journey?: string | null
          core_truth?: string | null
          substack_goals?: string | null
          short_form_goals?: string | null
          open_threads?: string[] | null
          substack_draft?: string | null
          short_form_script?: string | null
          next_action?: string | null
          posted_at?: string | null
        }
      }
      session_logs: {
        Row: {
          id: string
          user_id: string
          created_at: string
          piece_id: string
          what_was_done: string
          next_step: string
          duration_minutes: number | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          piece_id: string
          what_was_done: string
          next_step: string
          duration_minutes?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          piece_id?: string
          what_was_done?: string
          next_step?: string
          duration_minutes?: number | null
        }
      }
      post_publication_logs: {
        Row: {
          id: string
          user_id: string
          created_at: string
          piece_id: string
          thread: string | null
          what_it_opened: string | null
          unresolved: string | null
          natural_continuations: string[] | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          piece_id: string
          thread?: string | null
          what_it_opened?: string | null
          unresolved?: string | null
          natural_continuations?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          piece_id?: string
          thread?: string | null
          what_it_opened?: string | null
          unresolved?: string | null
          natural_continuations?: string[] | null
        }
      }
      re_ignition_library: {
        Row: {
          id: string
          user_id: string
          created_at: string
          type: LibraryType
          title: string
          content: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          type: LibraryType
          title: string
          content?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          type?: LibraryType
          title?: string
          content?: string | null
          notes?: string | null
        }
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          piece_id: string
          title: string
          type: TaskType
          status: TaskStatus
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          piece_id: string
          title: string
          type: TaskType
          status?: TaskStatus
          order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          piece_id?: string
          title?: string
          type?: TaskType
          status?: TaskStatus
          order?: number
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      arc_type: ArcType
      thematic_territory: ThematicTerritory
      energy_level: EnergyLevel
      capture_status: CaptureStatus
      idea_status: IdeaStatus
      project_status: ProjectStatus
      piece_format: PieceFormat
      piece_stage: PieceStage
      library_type: LibraryType
      check_in_type: CheckInType
      task_type: TaskType
      task_status: TaskStatus
    }
  }
}
