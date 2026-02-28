/**
 * @file toast-container.component.ts
 * @description Renders the live toast notification queue.
 *
 * Subscribes to ToastService.toasts$ and renders stacked notifications
 * in the top-right corner.  Each toast auto-dismisses via the service
 * scheduler — no timeout logic here.
 *
 * Place <app-toast-container> once in MainLayoutComponent and AuthLayoutComponent.
 */
import { Component, inject } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { ToastService, Toast } from '../../../../core/services/toast.service';
import { Observable }        from 'rxjs';

@Component({
  selector:   'app-toast-container',
  standalone: true,
  imports:    [CommonModule],
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <div
        *ngFor="let toast of toasts$ | async; trackBy: trackById"
        class="toast toast--{{ toast.severity }}"
        role="alert">

        <div class="toast__body">
          <strong class="toast__title">{{ toast.title }}</strong>
          <p *ngIf="toast.message" class="toast__message">{{ toast.message }}</p>
        </div>

        <button
          class="toast__close"
          (click)="dismiss(toast.id)"
          aria-label="Cerrar notificación">
          ✕
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      max-width: 380px;
      width: calc(100vw - 2.5rem);
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: 0.625rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      border-left: 4px solid transparent;
      background: #fff;
      pointer-events: all;
      animation: slideIn 0.2s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(1rem); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .toast--success { border-color: #22c55e; }
    .toast--error   { border-color: #ef4444; }
    .toast--warning { border-color: #f59e0b; }
    .toast--info    { border-color: #6366f1; }

    .toast__body { flex: 1; min-width: 0; }
    .toast__title {
      display: block;
      font-size: 0.9375rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .toast__message {
      font-size: 0.8125rem;
      color: #475569;
      margin: 0.2rem 0 0;
      line-height: 1.4;
    }

    .toast__close {
      flex-shrink: 0;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.75rem;
      color: #94a3b8;
      padding: 0;
      line-height: 1;
      transition: color 0.15s;
    }
    .toast__close:hover { color: #1e293b; }
  `],
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);

  readonly toasts$: Observable<Toast[]> = this.toastService.toasts$;

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  trackById(_: number, toast: Toast): string {
    return toast.id;
  }
}
