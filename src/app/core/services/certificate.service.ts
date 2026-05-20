/**
 * @file certificate.service.ts
 * @description Domain service for reading, verifying, and managing certificates.
 *
 * Certificates are auto-issued by the PostgreSQL trigger installed in
 * migration 004_certificates_professional.sql.
 * This service is READ-ONLY from the user side.
 *
 * Public API
 * ───────────
 *  getUserCertificates()          → CertificateWithTechnology[]  (authenticated)
 *  getPublicCertificate(code)     → PublicCertificate             (no auth)
 *  getPublicProfile(slug)         → PublicProfile                 (no auth)
 *  revokeCertificate(id, reason)  → void                         (admin only)
 *  getAllCertificates(limit?)      → CertificateAdmin[]           (admin only)
 */
import { Injectable, inject }           from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }              from './supabase.service';
import { AuthService }                  from './auth.service';
import { ToastService }                 from './toast.service';
import {
  CertificateWithTechnology,
  PublicCertificate,
  PublicProfile,
} from '../../shared/models/certificate.model';

/** Flat certificate row used in the admin revocation list */
export interface CertificateAdmin {
  id:                string;
  user_full_name:    string;
  technology_name:   string;
  level_certified:   string;
  average_score:     number;
  reliability_index: number;
  verification_code: string;
  issued_at:         string;
  is_revoked:        boolean;
  revocation_reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Authenticated user API ────────────────────────────────────────────────

  /**
   * Retrieve all certificates earned by the authenticated user,
   * joined with technology metadata.
   */
  getUserCertificates(): Observable<CertificateWithTechnology[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('certificates')
            .select(`
              id,
              user_id,
              technology_id,
              level_certified,
              average_score,
              consistency_score,
              reliability_index,
              attempts_count,
              issued_at,
              verification_code,
              public_slug,
              is_revoked,
              revoked_at,
              revocation_reason,
              pdf_url,
              created_at,
              technology:technologies ( id, name, slug, icon_url )
            `)
            .eq('user_id', user.id)
            .order('issued_at', { ascending: false })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as CertificateWithTechnology[];
      }),
      catchError((err) => {
        console.error('[CertificateService] getUserCertificates error:', err.message);
        return [[] as CertificateWithTechnology[]];
      })
    );
  }

  // ─── Public API (no auth required) ────────────────────────────────────────

  /**
   * Look up a certificate by its human-readable verification code.
   * Calls the SECURITY DEFINER RPC — works without a session token.
   *
   * @param code  e.g. "HIRED-REACT-9F4X2KQ8"
   */
  async getPublicCertificate(code: string): Promise<PublicCertificate | null> {
    const { data, error } = await this.supabase.client
      .rpc('get_certificate_by_code', { p_code: code.trim().toUpperCase() });

    if (error) throw new Error(error.message);
    const result = data as PublicCertificate;
    if (result?.error) return null;
    return result;
  }

  /**
   * Load a public profile by its slug.
   * Calls the SECURITY DEFINER RPC — works without a session token.
   *
   * @param slug  e.g. "react-a1b2c3"
   */
  async getPublicProfile(slug: string): Promise<PublicProfile | null> {
    const { data, error } = await this.supabase.client
      .rpc('get_public_profile', { p_slug: slug.toLowerCase() });

    if (error) throw new Error(error.message);
    const result = data as PublicProfile;
    if (result?.error) return null;
    return result;
  }

  // ─── Admin API ─────────────────────────────────────────────────────────────

  /**
   * List ALL certificates (admin only).
   * Uses a direct table query; RLS enforces admin_users check via policy.
   */
  async getAllCertificates(limit = 200): Promise<CertificateAdmin[]> {
    const { data, error } = await this.supabase.client
      .from('certificates')
      .select(`
        id,
        level_certified,
        average_score,
        reliability_index,
        verification_code,
        issued_at,
        is_revoked,
        revocation_reason,
        profiles!user_id ( full_name ),
        technologies!technology_id ( name )
      `)
      .order('issued_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as RawAdminCertRow[]).map((row) => ({
      id:                row.id,
      user_full_name:    (row.profiles as { full_name: string } | null)?.full_name ?? '—',
      technology_name:   (row.technologies as { name: string } | null)?.name ?? '—',
      level_certified:   row.level_certified,
      average_score:     row.average_score,
      reliability_index: row.reliability_index,
      verification_code: row.verification_code,
      issued_at:         row.issued_at,
      is_revoked:        row.is_revoked,
      revocation_reason: row.revocation_reason,
    }));
  }

  /**
   * Revoke a certificate (admin only).
   * Calls the SECURITY DEFINER RPC which also writes to audit_logs.
   */
  async revokeCertificate(certId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase.client
      .rpc('revoke_certificate', {
        p_cert_id: certId,
        p_reason:  reason ?? null,
      });

    if (error) throw new Error(error.message);
  }
}

// Private row shape returned by the admin join query
interface RawAdminCertRow extends Record<string, unknown> {
  id:                string;
  level_certified:   string;
  average_score:     number;
  reliability_index: number;
  verification_code: string;
  issued_at:         string;
  is_revoked:        boolean;
  revocation_reason: string | null;
  profiles:          { full_name: string } | null;
  technologies:      { name: string } | null;
}

