/**
 * @file admin.service.ts
 * @description Data-access service for the SuperAdmin module.
 *
 * All methods require the caller to be an authenticated admin_user (enforced
 * by Supabase RLS + SECURITY DEFINER functions).  The Angular adminGuard
 * prevents reaching routes that invoke this service.
 *
 * Public API
 * ──────────
 *  isAdmin()                                    → Promise<boolean>
 *  getMetrics()                                 → Promise<AdminMetrics>
 *  detectAnomalies()                            → Promise<AnomalyReport>
 *
 *  Technologies
 *  getTechnologies()                            → Promise<Technology[]>
 *  updateTechnology(id, patch)                  → Promise<void>
 *
 *  Simulations
 *  getSimulations(opts?)                        → Promise<Simulation[]>
 *  updateSimulation(id, patch)                  → Promise<void>
 *  deleteSimulation(id)                         → Promise<void>
 *
 *  Certification rules
 *  getCertificationRules()                      → Promise<CertificationRule[]>
 *  upsertCertificationRule(rule)                → Promise<CertificationRule>
 *
 *  Scoring weights
 *  getScoringWeights()                          → Promise<ScoringWeightsConfig[]>
 *  upsertScoringWeights(config)                 → Promise<ScoringWeightsConfig>
 *
 *  Audit
 *  getAuditLogs(limit?)                         → Promise<AuditLog[]>
 *  writeAuditLog(entry)                         → Promise<void>
 */
import { Injectable, inject } from '@angular/core';
import { SupabaseService }    from './supabase.service';
import {
  AdminMetrics,
  AnomalyReport,
  AuditAction,
  AuditLog,
  CertificationRule,
  ScoringWeightsConfig,
} from '../../shared/models/admin.model';

// Lightweight types for data we read from the technologies / simulations tables.
// Adjust once you have dedicated model files for those domains.
export interface Technology {
  id:         string;
  name:       string;
  category:   string | null;
  created_at: string;
}

export interface Simulation {
  id:               string;
  title:            string;
  technology_id:    string | null;
  level:            string | null;
  version:          number | null;
  duration_minutes: number | null;
  is_active:        boolean;
  created_at:       string;
}

interface AuditEntry {
  action:      AuditAction;
  entity_type: string;
  entity_id?:  string;
  old_value?:  Record<string, unknown>;
  new_value?:  Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SupabaseService);

  // ─── Auth helpers ──────────────────────────────────────────────────────────

  /** Returns true if the current session belongs to an active admin_user. */
  async isAdmin(): Promise<boolean> {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return false;

    const { data } = await this.supabase.client
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    return !!data;
  }

  // ─── Metrics / Anomalies ───────────────────────────────────────────────────

  /** Call the get_admin_metrics() SECURITY DEFINER RPC. */
  async getMetrics(): Promise<AdminMetrics> {
    const { data, error } = await this.supabase.client
      .rpc('get_admin_metrics');

    if (error) throw new Error(`get_admin_metrics: ${error.message}`);
    return data as AdminMetrics;
  }

  /** Call the detect_anomalies() SECURITY DEFINER RPC. */
  async detectAnomalies(): Promise<AnomalyReport> {
    const { data, error } = await this.supabase.client
      .rpc('detect_anomalies');

    if (error) throw new Error(`detect_anomalies: ${error.message}`);
    return data as AnomalyReport;
  }

  // ─── Technologies ──────────────────────────────────────────────────────────

  async getTechnologies(): Promise<Technology[]> {
    const { data, error } = await this.supabase.client
      .from('technologies')
      .select('*')
      .order('name');

    if (error) throw new Error(error.message);
    return (data ?? []) as Technology[];
  }

  async updateTechnology(id: string, patch: Partial<Technology>): Promise<void> {
    const old = await this.supabase.client
      .from('technologies').select('*').eq('id', id).single();

    const { error } = await this.supabase.client
      .from('technologies')
      .update(patch)
      .eq('id', id);

    if (error) throw new Error(error.message);

    await this.writeAuditLog({
      action:      'UPDATE_TECHNOLOGY',
      entity_type: 'technologies',
      entity_id:   id,
      old_value:   old.data as Record<string, unknown>,
      new_value:   patch    as Record<string, unknown>,
    });
  }

  // ─── Simulations ───────────────────────────────────────────────────────────

  async getSimulations(opts?: { technologyId?: string; limit?: number }): Promise<Simulation[]> {
    let query = this.supabase.client
      .from('simulations')
      .select('*')
      .order('created_at', { ascending: false });

    if (opts?.technologyId) {
      query = query.eq('technology_id', opts.technologyId);
    }
    if (opts?.limit) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Simulation[];
  }

  async updateSimulation(id: string, patch: Partial<Simulation>): Promise<void> {
    const old = await this.supabase.client
      .from('simulations').select('*').eq('id', id).single();

    const { error } = await this.supabase.client
      .from('simulations')
      .update(patch)
      .eq('id', id);

    if (error) throw new Error(error.message);

    await this.writeAuditLog({
      action:      'UPDATE_SIMULATION',
      entity_type: 'simulations',
      entity_id:   id,
      old_value:   old.data as Record<string, unknown>,
      new_value:   patch    as Record<string, unknown>,
    });
  }

  async deleteSimulation(id: string): Promise<void> {
    const old = await this.supabase.client
      .from('simulations').select('*').eq('id', id).single();

    const { error } = await this.supabase.client
      .from('simulations')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    await this.writeAuditLog({
      action:      'DELETE_SIMULATION',
      entity_type: 'simulations',
      entity_id:   id,
      old_value:   old.data as Record<string, unknown>,
    });
  }

  // ─── Certification Rules ───────────────────────────────────────────────────

  async getCertificationRules(): Promise<CertificationRule[]> {
    const { data, error } = await this.supabase.client
      .from('certification_rules')
      .select(`
        *,
        technologies ( name )
      `)
      .order('technology_id', { nullsFirst: true });

    if (error) throw new Error(error.message);

    return ((data ?? []) as RawCertRuleRow[]).map((row) => ({
      ...row,
      technology_name: (row.technologies as { name: string } | null)?.name ?? 'Global (default)',
    })) as unknown as CertificationRule[];
  }

  async upsertCertificationRule(
    rule: Omit<CertificationRule, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'technology_name'>,
  ): Promise<CertificationRule> {
    const { data: { user } } = await this.supabase.client.auth.getUser();

    const { data, error } = await this.supabase.client
      .from('certification_rules')
      .upsert({ ...rule, updated_by: user?.id }, { onConflict: 'technology_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.writeAuditLog({
      action:      'UPDATE_CERT_RULES',
      entity_type: 'certification_rules',
      entity_id:   (data as { id: string }).id,
      new_value:   rule as Record<string, unknown>,
    });

    return data as unknown as CertificationRule;
  }

  // ─── Scoring Weights ───────────────────────────────────────────────────────

  async getScoringWeights(): Promise<ScoringWeightsConfig[]> {
    const { data, error } = await this.supabase.client
      .from('scoring_weights_config')
      .select(`
        *,
        technologies ( name )
      `)
      .order('technology_id', { nullsFirst: true });

    if (error) throw new Error(error.message);

    return ((data ?? []) as RawWeightsRow[]).map((row) => ({
      ...row,
      technology_name: (row.technologies as { name: string } | null)?.name ?? 'Global (default)',
    })) as unknown as ScoringWeightsConfig[];
  }

  async upsertScoringWeights(
    config: Omit<ScoringWeightsConfig, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'technology_name'>,
  ): Promise<ScoringWeightsConfig> {
    const sumCheck =
      config.weight_concepts +
      config.weight_problem_solving +
      config.weight_clean_code +
      config.weight_performance;

    if (Math.abs(sumCheck - 1) > 0.0001) {
      throw new Error(`Weights must sum to 1.0 (current sum: ${sumCheck.toFixed(4)})`);
    }

    const { data: { user } } = await this.supabase.client.auth.getUser();

    const { data, error } = await this.supabase.client
      .from('scoring_weights_config')
      .upsert({ ...config, updated_by: user?.id }, { onConflict: 'technology_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await this.writeAuditLog({
      action:      'UPDATE_WEIGHTS',
      entity_type: 'scoring_weights_config',
      entity_id:   (data as { id: string }).id,
      new_value:   config as Record<string, unknown>,
    });

    return data as unknown as ScoringWeightsConfig;
  }

  // ─── Audit Logs ────────────────────────────────────────────────────────────

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    const { data, error } = await this.supabase.client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as AuditLog[];
  }

  async writeAuditLog(entry: AuditEntry): Promise<void> {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    if (!user) return;

    const { error } = await this.supabase.client
      .from('audit_logs')
      .insert({
        admin_id:    user.id,
        action:      entry.action,
        entity_type: entry.entity_type,
        entity_id:   entry.entity_id  ?? null,
        old_value:   entry.old_value  ?? null,
        new_value:   entry.new_value  ?? null,
      });

    // Audit failures are non-fatal — log to console only
    if (error) {
      console.error('[AdminService] Failed to write audit log:', error.message);
    }
  }
}

// Private row shapes returned by Supabase join queries
interface RawCertRuleRow extends Record<string, unknown> {
  technologies: { name: string } | null;
}

interface RawWeightsRow extends Record<string, unknown> {
  technologies: { name: string } | null;
}
