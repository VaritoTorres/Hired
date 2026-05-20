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
   * Sign in with email and password (local validation, no network call).
   * Validates against hardcoded credentials: admin@local.test / Password123!
   * Navigates to /dashboard on success.
   * @throws {Error} on invalid credentials.
   */
  async login(email: string, password: string): Promise<void> {
    // Local credential validation — no Supabase call
    const LOCAL_EMAIL = 'admin@local.test';
    const LOCAL_PASSWORD = 'Password123!';

    if (email !== LOCAL_EMAIL || password !== LOCAL_PASSWORD) {
      throw new Error('Credenciales inválidas');
    }

    // Create a mock AppUser and emit it
    const mockUser: AppUser = {
      id: 'local-user-1',
      email: LOCAL_EMAIL,
      fullName: 'Admin Local',
      avatarUrl: '',
      role: UserRole.CANDIDATE,
      createdAt: new Date().toISOString(),
    };

    this._currentUser$.next(mockUser);
    await this.router.navigate(['/dashboard']);
  }

  /**
   * Sign out the current session and redirect to the login page.
   * In local mode, simply clears the current user and navigates.
   */
  async logout(): Promise<void> {
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
