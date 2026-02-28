/**
 * @file login.component.ts
 * @description Login page component.
 *
 * - Reactive form with client-side validation.
 * - Delegates authentication to AuthService (no business logic here).
 * - Reads `returnUrl` query param to support post-login redirections set by
 *   the authGuard.
 * - All async operations are tracked with a `loading` flag to disable the
 *   submit button and prevent double-submissions.
 */
import { Component, inject, OnInit }                  from '@angular/core';
import { CommonModule }                               from '@angular/common';
import { RouterModule, ActivatedRoute, Router }       from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
}                                                     from '@angular/forms';
import { AuthService }                                from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);

  /** Reactive form model */
  loginForm!: FormGroup;

  /** Tracks async operation — disables submit during request */
  loading = false;

  /** Server-side error message shown below the form */
  errorMessage: string | null = null;

  /** URL to redirect after successful login (set by authGuard) */
  private returnUrl = '/dashboard';

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    // Read returnUrl from the query string if the guard set one.
    this.returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
  }

  // ── Form field helpers ──────────────────────────────────────────────────────

  get email()    { return this.loginForm.get('email')!;    }
  get password() { return this.loginForm.get('password')!; }

  // ── Submission ──────────────────────────────────────────────────────────────

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading      = true;
    this.errorMessage = null;

    try {
      const { email, password } = this.loginForm.value as {
        email: string;
        password: string;
      };
      await this.authService.login(email, password);
      // AuthService.login() already navigates — this is a safety net.
      await this.router.navigateByUrl(this.returnUrl);
    } catch (err: unknown) {
      this.errorMessage =
        err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.';
    } finally {
      this.loading = false;
    }
  }
}
