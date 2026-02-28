/**
 * @file error.interceptor.ts
 * @description Global HTTP error interceptor for HIRED.
 *
 * Responsibilities
 * ─────────────────
 *  - Intercept all HttpErrorResponse instances from Angular's HTTP layer.
 *  - Map status codes to user-friendly Spanish messages displayed via ToastService.
 *  - Log full error details to the console for debugging.
 *  - Re-throw the error as an Observable so individual callers can still handle
 *    domain-specific cases (e.g. form validation errors from 422 responses).
 *
 * Registration: added to app.config.ts alongside AppHttpInterceptor.
 *
 * Design note: this interceptor does NOT catch Supabase PostgREST errors
 * that arrive as successful HTTP 200 responses with an `error` field in the
 * JSON body — those are handled inside each domain service's catchError pipe.
 */
import { Injectable, inject }                       from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor,
         HttpRequest, HttpErrorResponse }            from '@angular/common/http';
import { Observable, throwError }                   from 'rxjs';
import { catchError }                               from 'rxjs/operators';
import { ToastService }                             from '../services/toast.service';

/** Human-readable messages per HTTP status group. */
const ERROR_MESSAGES: Record<number, string> = {
  0:   'Sin conexión. Verifica tu red e inténtalo de nuevo.',
  400: 'La solicitud contiene datos inválidos.',
  401: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'El recurso solicitado no fue encontrado.',
  409: 'Ya existe un registro con esos datos.',
  422: 'Los datos enviados no son válidos.',
  429: 'Demasiadas solicitudes. Espera un momento antes de continuar.',
  500: 'Error interno del servidor. Estamos trabajando en ello.',
  503: 'El servicio no está disponible temporalmente. Inténtalo más tarde.',
};

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private readonly toast = inject(ToastService);

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          this.handleHttpError(error);
        }
        return throwError(() => error);
      })
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private handleHttpError(error: HttpErrorResponse): void {
    const status  = error.status;
    const message = ERROR_MESSAGES[status] ?? `Error inesperado (${status}).`;

    // Always log the full error for debugging — never expose raw error to toast
    console.error(
      `[ErrorInterceptor] HTTP ${status} — ${error.url ?? 'unknown URL'}`,
      error
    );

    // 401 is logged but not toasted — AuthService manages session expiry UX
    if (status === 401) return;

    this.toast.error('Error de conexión', message);
  }
}
