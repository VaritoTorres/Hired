/**
 * @file auth.service.ts
 * @description Central authentication service for HIRED.
 *
 * Delegates all Supabase Auth operations through SupabaseService (singleton client).
 * Exposes RxJS Observables so consumers can reactively bind to auth state.
 *
 * Public API
 * ──────────
 *  register(email, password, fullName) → Promise<void>
 *  login(email, password)             → Promise<void>
 *  logout()                           → Promise<void>
 *  getCurrentUser()                   → Observable<AppUser | null>
 *  isAuthenticated()                  → Observable<boolean>
 *  getUserRole()                      → Observable<UserRole | null>  (placeholder)
 */
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, map } from 'rxjs';
import { AuthError, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AppUser, UserRole } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router  = inject(Router);

  /**
   * Internal BehaviorSubject mirrors the Supabase session user.
   * Initialised as null; updated on every auth-state change.
   */
  private readonly _currentUser$ = new BehaviorSubject<AppUser | null>(null);

  constructor() {
    // Mirror Supabase session changes into our own AppUser model.
    this.supabase.session$.subscribe((session) => {
      this._currentUser$.next(session ? this.mapUser(session.user) : null);
    });
  }

  // ─── Auth operations ─────────────────────────────────────────────────────────

  /**
   * Register a new user.
   * @throws {AuthError} if Supabase returns an error.
   */
  async register(email: string, password: string, fullName: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) throw this.normalizeError(error);
  }

  /**
   * Sign in with email and password.
   * Navigates to /dashboard on success.
   * @throws {AuthError} on failure.
   */
  async login(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw this.normalizeError(error);

    await this.router.navigate(['/dashboard']);
  }

  /**
   * Sign out the current session and redirect to the login page.
   */
  async logout(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();

    if (error) {
      console.error('[AuthService] logout error:', error.message);
    }

    this._currentUser$.next(null);
    await this.router.navigate(['/auth/login']);
  }

  // ─── Reactive accessors ───────────────────────────────────────────────────────

  /**
   * Observable stream of the current authenticated user.
   * Emits null when the user is not authenticated.
   */
  getCurrentUser(): Observable<AppUser | null> {
    return this._currentUser$.asObservable();
  }

  /**
   * Observable boolean indicating whether a user session is active.
   */
  isAuthenticated(): Observable<boolean> {
    return this._currentUser$.pipe(map((user) => user !== null));
  }

  /**
   * Placeholder: emits the user's role.
   * In Phase 2 this will query the `profiles` table in PostgreSQL.
   */
  getUserRole(): Observable<UserRole | null> {
    return this._currentUser$.pipe(
      map((user) => (user?.role ?? null) as UserRole | null)
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /** Map a raw Supabase User to our internal AppUser interface. */
  private mapUser(raw: User): AppUser {
    return {
      id:        raw.id,
      email:     raw.email ?? '',
      fullName:  raw.user_metadata?.['full_name'] ?? '',
      avatarUrl: raw.user_metadata?.['avatar_url'] ?? '',
      role:      (raw.user_metadata?.['role'] as UserRole) ?? UserRole.CANDIDATE,
      createdAt: raw.created_at,
    };
  }

  /** Normalise Supabase errors to standard Error objects. */
  private normalizeError(error: AuthError): Error {
    // Pass-through message so UI can display human-readable feedback.
    return new Error(error.message);
  }
}
