/**
 * @file certificate.model.ts
 * @description Models for the `certificates` table (Phase 9 — professional tier).
 *
 * Auto-issuance rules (all checked by PostgreSQL trigger):
 *  • average_score ≥ min_score_percentage  (from certification_rules)
 *  • total_attempts ≥ min_attempts
 *  • Level assigned: ≥85 → senior | ≥70 → mid
 *
 * Public verification:  /verify/:code  (no auth required)
 * Public profile:       /u/:slug       (no auth required)
 */

/** Level tiers for which certificates can be issued. */
export type CertificateLevel = 'mid' | 'senior';

/** Human-readable labels and accent colors per certificate level. */
export const CERTIFICATE_META: Record<CertificateLevel, { label: string; color: string; minScore: number }> = {
  mid: {
    label:    'Mid-Level',
    color:    '#6366f1',
    minScore: 70,
  },
  senior: {
    label:    'Senior',
    color:    '#16a34a',
    minScore: 85,
  },
};

/**
 * Full row representation of the `certificates` table.
 * Issued exclusively by the PostgreSQL trigger — never from the client.
 */
export interface Certificate {
  id:                  string;
  user_id:             string;
  technology_id:       string;

  /** Renamed from level_achieved in migration 004 */
  level_certified:     CertificateLevel;

  /** Running weighted average at time of issuance */
  average_score:       number;

  /** 100 − (stddev × 2.5) — lower variability = higher score */
  consistency_score:   number;

  /** Composite quality index (0–100): consistency 40% + depth 30% + score 30% */
  reliability_index:   number;

  /** Total completed attempts that contributed to issuance */
  attempts_count:      number;

  /** ISO-8601 timestamp when the certificate was issued */
  issued_at:           string;

  /** Human-readable code — format: HIRED-REACT-9F4X2KQ8 */
  verification_code:   string;

  /** URL-safe slug for public profile link */
  public_slug:         string;

  /** False = valid | True = revoked by admin */
  is_revoked:          boolean;

  /** Set when is_revoked transitions to true */
  revoked_at:          string | null;
  revocation_reason:   string | null;

  /** Reserved for future PDF export */
  pdf_url:             string | null;

  created_at:          string;
}

/**
 * `Certificate` joined with denormalised technology fields.
 * Returned by getUserCertificates() for the dashboard gallery.
 */
export interface CertificateWithTechnology extends Certificate {
  technology: {
    id:       string;
    name:     string;
    slug:     string;
    icon_url: string | null;
  };
}

// ---------------------------------------------------------------------------
// Public-facing shapes — returned by the SECURITY DEFINER RPCs
// (no sensitive fields, safe to display without auth)
// ---------------------------------------------------------------------------

/**
 * Shape returned by get_certificate_by_code() RPC.
 * Used by the /verify/:code public page.
 */
export interface PublicCertificate {
  id:                 string;
  verification_code:  string;
  public_slug:        string;
  level_certified:    CertificateLevel;
  average_score:      number;
  consistency_score:  number;
  reliability_index:  number;
  attempts_count:     number;
  issued_at:          string;
  is_revoked:         boolean;
  revocation_reason:  string | null;
  revoked_at:         string | null;
  /** Profile fields joined by the RPC */
  user_full_name:     string;
  technology_name:    string;
  technology_slug:    string;
  technology_icon:    string | null;
  /** Sentinel: present only when cert is not found */
  error?:             string;
}

/** One certificate entry inside a public profile */
export interface PublicProfileCert {
  verification_code:  string;
  public_slug:        string;
  level_certified:    CertificateLevel;
  average_score:      number;
  consistency_score:  number;
  reliability_index:  number;
  issued_at:          string;
  technology_name:    string;
  technology_slug:    string;
  technology_icon:    string | null;
}

/** One score entry inside a public profile */
export interface PublicProfileScore {
  technology_name:   string;
  average_score:     number;
  level_estimated:   string;
  total_attempts:    number;
  consistency_score: number;
}

/**
 * Shape returned by get_public_profile() RPC.
 * Used by the /u/:slug public page.
 */
export interface PublicProfile {
  full_name:          string;
  total_xp:           number;
  global_rank_title:  string;
  last_active_at:     string | null;
  certificates:       PublicProfileCert[];
  top_scores:         PublicProfileScore[];
  /** Sentinel: present only when profile is not found */
  error?:             string;
}
