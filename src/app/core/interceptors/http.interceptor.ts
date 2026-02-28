/**
 * @file http.interceptor.ts
 * @description Centralised HTTP interceptor for the HIRED application.
 *
 * Responsibilities:
 *  - Attach the Supabase JWT access token to every outgoing request via
 *    the Authorization header (Bearer scheme).
 *  - Pipe through non-Supabase requests unchanged (safe for external APIs).
 *
 * Add additional cross-cutting concerns here (e.g. loading spinner, retry
 * logic) rather than scattering them across individual services.
 */
import { Injectable, inject }                                    from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, from, switchMap }                          from 'rxjs';
import { SupabaseService }                                      from '../services/supabase.service';

@Injectable()
export class AppHttpInterceptor implements HttpInterceptor {
  private readonly supabase = inject(SupabaseService);

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // Fetch the session asynchronously and inject the token if present.
    return from(this.supabase.getSession()).pipe(
      switchMap((session) => {
        if (!session?.access_token) {
          return next.handle(req);
        }

        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        return next.handle(authReq);
      })
    );
  }
}
