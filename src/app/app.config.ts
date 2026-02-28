/**
 * @file app.config.ts
 * @description Root application configuration (Angular standalone bootstrap).
 *
 * Providers registered here are application-scoped singletons.
 * Keep this file lean — add domain providers inside their respective features.
 */
import {
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';

import { APP_ROUTES }         from './app.routes';
import { AppHttpInterceptor } from './core/interceptors/http.interceptor';
import { ErrorInterceptor }   from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zone change-detection with event coalescing for better performance.
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Router with component-input binding (pass route params as @Input)
    // and view-transitions API for smooth page changes.
    provideRouter(APP_ROUTES, withComponentInputBinding(), withViewTransitions()),

    // HttpClient with DI-based interceptors (class interceptors require this).
    provideHttpClient(withInterceptorsFromDi()),

    // JWT attachment interceptor — attaches Bearer token to every request.
    {
      provide:  HTTP_INTERCEPTORS,
      useClass: AppHttpInterceptor,
      multi:    true,
    },

    // Global error interceptor — maps HTTP errors to user-friendly toasts.
    {
      provide:  HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi:    true,
    },
  ],
};
