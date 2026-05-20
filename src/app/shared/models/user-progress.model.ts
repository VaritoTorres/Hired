/**
 * @file user-progress.model.ts
 * @description Models for the `user_progress` table and the XP/rank system.
 *
 * user_progress stores per-user, per-technology progress data:
 *  - XP accumulated through practice
 *  - Best score and streak days
 *  - Level unlocked based on best score
 *
 * XP rules (computed server-side — NEVER in the client):
 *  Base           : +50   (completing any simulation)
 *  Score bonus    : ≥85 → +50 | 70–84 → +25 | 50–69 → +10
 *  Improvement    : new_score > old_avg → +20
 *  Streak multi   : streak_days ≥ 2 → ×1.5 (ceiling)
 *
 * Global rank titles (based on profiles.total_xp):
 *  0–499    → Rookie
 *  500–1499 → Explorer
 *  1500–2999→ Challenger
 *  3000+    → Elite
 */

/** One of the four global rank title strings. */
export type RankTitle = 'Rookie' | 'Explorer' | 'Challenger' | 'Elite';

/** Display metadata for each rank: accent color and description copy. */
export const RANK_META: Record<RankTitle, { color: string; description: string; minXp: number }> = {
  Rookie: {
    color:       '#94a3b8',
    description: 'Estás comenzando tu camino técnico. ¡Sigue practicando!',
    minXp:       0,
  },
  Explorer: {
    color:       '#f59e0b',
    description: 'Estás explorando tecnologías. ¡Vas por buen camino!',
    minXp:       500,
  },
  Challenger: {
    color:       '#6366f1',
    description: 'Tienes habilidades sólidas. ¡Desafía los problemas difíciles!',
    minXp:       1500,
  },
  Elite: {
    color:       '#16a34a',
    description: '¡Nivel élite! Estás listo para cualquier entrevista técnica.',
    minXp:       3000,
  },
};

/**
 * Returns the RankTitle for a given XP total.
 * Keeps presentation logic in one place without importing the metadata.
 */
export function getRankTitle(xp: number): RankTitle {
  if (xp >= 3000) return 'Elite';
  if (xp >= 1500) return 'Challenger';
  if (xp >= 500)  return 'Explorer';
  return 'Rookie';
}

/**
 * Returns how many XP points are needed to reach the next rank.
 * Returns 0 when the user is already at the top rank.
 */
export function xpToNextRank(xp: number): number {
  if (xp >= 3000) return 0;
  if (xp >= 1500) return 3000 - xp;
  if (xp >= 500)  return 1500 - xp;
  return 500 - xp;
}

/**
 * Row representation of the `user_progress` table.
 * Written exclusively by the PostgreSQL trigger — never from client-side.
 */
export interface UserProgress {
  /** UUID primary key */
  id: string;

  /** FK → profiles.id */
  user_id: string;

  /** FK → technologies.id */
  technology_id: string;

  /** Total completed attempts for this technology */
  total_attempts: number;

  /** Highest weighted score achieved (0–100) */
  best_score: number;

  /** Consecutive days of practice. Resets if a day is missed. */
  streak_days: number;

  /** ISO-8601 date string (YYYY-MM-DD) of the last activity */
  last_activity_date: string | null;

  /**
   * Tier unlocked based on best_score.
   * Mirrors hired_estimate_level() thresholds.
   */
  level_unlocked: 'beginner' | 'junior' | 'mid' | 'senior';

  /** Total XP earned for this technology */
  xp_points: number;

  /** ISO-8601 row creation timestamp */
  created_at: string;

  /** ISO-8601 last-updated timestamp */
  updated_at: string;
}

/**
 * `UserProgress` joined with denormalised technology fields.
 * Returned by the `get_user_progress_with_technology` RPC.
 */
export interface UserProgressWithTechnology extends UserProgress {
  technology_name:     string;
  technology_slug:     string;
  technology_icon_url: string | null;
}
