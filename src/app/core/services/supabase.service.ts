/**
 * @file supabase.service.ts
 * @description Singleton wrapper around the Supabase client.
 *
 * Responsibilities:
 *  - Instantiate and expose the Supabase client (single instance, providedIn root).
 *  - Expose session management helpers consumed by AuthService.
 *  - Re-emit auth state changes as an Observable for reactive patterns.
 *
 * NEVER instantiate createClient() outside this service.
 */
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  /** The single Supabase client instance shared across the entire application. */
  readonly client: SupabaseClient;

  /** Reactive stream of the current session — null when unauthenticated. */
  private readonly _session$ = new BehaviorSubject<Session | null>(null);
  readonly session$: Observable<Session | null> = this._session$.asObservable();

  constructor() {
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          // Persist session in localStorage so refreshes don't log the user out.
          persistSession: true,
          // Automatically refresh the JWT before it expires.
          autoRefreshToken: true,
          // Detect session from URL hash after OAuth/magic-link flows.
          detectSessionInUrl: true,
        },
      }
    );

    // Bootstrap: load any existing session stored in localStorage.
    this.client.auth.getSession().then(({ data }) => {
      this._session$.next(data.session);
    });

    // Subscribe to Supabase auth state changes and propagate them reactively.
    this.client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this._session$.next(session);
      }
    );
  }

  // ─── Public helpers ──────────────────────────────────────────────────────────

  /**
   * Returns the currently stored session snapshot (async, always fresh).
   * Prefer the `session$` observable for reactive data-binding.
   */
  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      console.error('[SupabaseService] getSession error:', error.message);
      return null;
    }
    return data.session;
  }

  /**
   * Convenience accessor — synchronous snapshot of the current session value.
   * Use only where async/reactive patterns are not feasible.
   */
  get currentSession(): Session | null {
    return this._session$.getValue();
  }
}
