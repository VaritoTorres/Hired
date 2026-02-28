/**
 * @file api.service.ts
 * @description Base data-access service that wraps the Supabase client.
 *
 * Provides generic typed helpers for interacting with PostgREST tables.
 * Feature-specific services should extend or compose this service rather
 * than calling `supabase.client` directly.
 *
 * Phase 1 exposes only the primitives needed to bootstrap CRUD patterns.
 * Extend in Phase 2 with pagination, filtering, and realtime subscriptions.
 */
import { Injectable, inject }                from '@angular/core';
import { PostgrestSingleResponse }           from '@supabase/supabase-js';
import { SupabaseService }                   from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  protected readonly supabase = inject(SupabaseService);

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Fetch all rows from a table with optional column selection.
   * @param table  PostgREST table name.
   * @param select Column projection string (default: '*').
   */
  protected async getAll<T>(table: string, select = '*'): Promise<T[]> {
    const { data, error } = await this.supabase.client
      .from(table)
      .select(select);

    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  }

  /**
   * Fetch a single row by primary key `id`.
   */
  protected async getById<T>(table: string, id: string, select = '*'): Promise<T> {
    const { data, error }: PostgrestSingleResponse<T> = await this.supabase.client
      .from(table)
      .select(select)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as T;
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Insert a new row and return the created record.
   */
  protected async insert<T>(table: string, payload: Partial<T>): Promise<T> {
    const { data, error }: PostgrestSingleResponse<T> = await this.supabase.client
      .from(table)
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as T;
  }

  /**
   * Update an existing row by `id` and return the updated record.
   */
  protected async update<T>(
    table: string,
    id: string,
    payload: Partial<T>
  ): Promise<T> {
    const { data, error }: PostgrestSingleResponse<T> = await this.supabase.client
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as T;
  }

  /**
   * Hard-delete a row by `id`.
   */
  protected async remove(table: string, id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}

