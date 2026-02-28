/**
 * @file toast.service.ts
 * @description Centralised notification service for HIRED.
 *
 * Provides a simple API to push success / error / info / warning toasts
 * from anywhere in the application without direct component coupling.
 *
 * Consumers subscribe to `toasts$` and render the queue — the default
 * implementation uses the MainLayoutComponent's toast outlet.
 *
 * Auto-dismiss is handled via RxJS timer inside the service so no component
 * needs to manage its own timeout logic.
 */
import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  /** Unique identifier used as the DOM key / remove handle */
  id: string;
  severity: ToastSeverity;
  title: string;
  message?: string;
  /** Auto-dismiss after this many milliseconds (default 4000) */
  duration: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Current queue of active toasts. */
  private readonly _toasts$ = new BehaviorSubject<Toast[]>([]);

  /** Public observable — subscribe in the toast container component. */
  readonly toasts$ = this._toasts$.asObservable();

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Show a success notification. */
  success(title: string, message?: string, duration = 4000): void {
    this.push({ severity: 'success', title, message, duration });
  }

  /** Show an error notification. */
  error(title: string, message?: string, duration = 6000): void {
    this.push({ severity: 'error', title, message, duration });
  }

  /** Show an informational notification. */
  info(title: string, message?: string, duration = 4000): void {
    this.push({ severity: 'info', title, message, duration });
  }

  /** Show a warning notification. */
  warning(title: string, message?: string, duration = 5000): void {
    this.push({ severity: 'warning', title, message, duration });
  }

  /**
   * Programmatically remove a toast before its auto-dismiss fires.
   * Called by the toast container when the user clicks the × button.
   */
  dismiss(id: string): void {
    this._toasts$.next(this._toasts$.getValue().filter((t) => t.id !== id));
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private push(toast: Omit<Toast, 'id'>): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const full: Toast = { ...toast, id };

    // Append to queue
    this._toasts$.next([...this._toasts$.getValue(), full]);

    // Schedule auto-dismiss
    setTimeout(() => this.dismiss(id), toast.duration);
  }
}
