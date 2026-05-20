/**
 * @file admin.model.ts
 * @description TypeScript interfaces matching the four SuperAdmin tables
 * created in migration 003_superadmin.sql, plus the return shapes of the
 * two SECURITY DEFINER RPC functions.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export type AdminRole = 'superadmin' | 'moderator';

export type AuditAction =
  | 'UPDATE_WEIGHTS'
  | 'UPDATE_CERT_RULES'
  | 'DEACTIVATE_USER'
  | 'REACTIVATE_USER'
  | 'ADD_ADMIN'
  | 'REMOVE_ADMIN'
  | 'UPDATE_SIMULATION'
  | 'DELETE_SIMULATION'
  | 'UPDATE_TECHNOLOGY'
  | 'DELETE_TECHNOLOGY'
  | 'REVOKE_CERTIFICATE';

// ---------------------------------------------------------------------------
// Table row interfaces
// ---------------------------------------------------------------------------

/** Row in public.admin_users */
export interface AdminUser {
  id:            string;
  user_id:       string;
  email:         string;
  display_name:  string;
  role:          AdminRole;
  is_active:     boolean;
  created_at:    string;
  last_login_at: string | null;
}

/** Row in public.certification_rules */
export interface CertificationRule {
  id:                        string;
  /** null = global default */
  technology_id:             string | null;
  technology_name?:          string;   // joined
  min_score_percentage:      number;
  min_attempts:              number;
  passing_streak_required:   number;
  xp_reward:                 number;
  certificate_validity_days: number;
  is_active:                 boolean;
  notes:                     string | null;
  created_by:                string | null;
  updated_by:                string | null;
  created_at:                string;
  updated_at:                string;
}

/** Row in public.scoring_weights_config */
export interface ScoringWeightsConfig {
  id:                     string;
  /** null = global default */
  technology_id:          string | null;
  technology_name?:       string;   // joined
  weight_concepts:        number;
  weight_problem_solving: number;
  weight_clean_code:      number;
  weight_performance:     number;
  is_active:              boolean;
  notes:                  string | null;
  created_by:             string | null;
  updated_by:             string | null;
  created_at:             string;
  updated_at:             string;
}

/** Row in public.audit_logs */
export interface AuditLog {
  id:          string;
  admin_id:    string;
  admin_email?: string;   // joined
  action:      string;
  entity_type: string;
  entity_id:   string | null;
  old_value:   Record<string, unknown> | null;
  new_value:   Record<string, unknown> | null;
  ip_address:  string | null;
  user_agent:  string | null;
  created_at:  string;
}

// ---------------------------------------------------------------------------
// RPC return shapes
// ---------------------------------------------------------------------------

/** Shape returned by get_admin_metrics() RPC */
export interface AdminMetrics {
  total_users:          number;
  active_last_7d:       number;
  active_last_30d:      number;
  total_attempts:       number;
  total_certificates:   number;
  avg_score_global:     number;
  pct_certified:        number;
  level_distribution:   Record<string, number>;
  attempts_last_7d:     number;
  metrics_generated_at: string;
}

/** One simulation with statistically suspicious high average */
export interface HighScoreSimulationAnomaly {
  simulation_id:    string;
  simulation_title: string;
  avg_score:        number;
  total_attempts:   number;
}

/** User with suspiciously many consecutive perfect scores */
export interface PerfectStreakAnomaly {
  user_id:         string;
  full_name:       string;
  perfect_attempts: number;
}

/** User with abnormal XP spike in a single day */
export interface XpSpikeAnomaly {
  user_id:   string;
  full_name: string;
  daily_xp:  number;
  day:       string;
}

/** Shape returned by detect_anomalies() RPC */
export interface AnomalyReport {
  high_avg_score_simulations: HighScoreSimulationAnomaly[];
  suspicious_perfect_streaks: PerfectStreakAnomaly[];
  xp_spike_users:             XpSpikeAnomaly[];
  detected_at:                string;
}

// ---------------------------------------------------------------------------
// UI helper: section labels for the sidebar
// ---------------------------------------------------------------------------
export interface AdminNavItem {
  label:  string;
  path:   string;
  icon:   string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: 'Panel',          path: 'dashboard',    icon: '📊' },
  { label: 'Tecnologías',    path: 'technologies', icon: '🛠️' },
  { label: 'Simulaciones',   path: 'simulations',  icon: '📝' },
  { label: 'Reglas',         path: 'rules',        icon: '⚖️' },
  { label: 'Analíticas',     path: 'analytics',    icon: '🔍' },
  { label: 'Certificados',   path: 'certificates', icon: '🎓' },
];
