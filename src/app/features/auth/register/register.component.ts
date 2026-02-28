/**
 * @file register.component.ts
 * @description Registration form component.
 *
 * - Reactive form with all required validators.
 * - Password confirmation cross-field validator.
 * - Delegates to AuthService.register() — no business logic here.
 * - Shows a success state prompting email confirmation (Supabase behaviour).
 */
import { Component, inject, OnInit }        from '@angular/core';
import { CommonModule }                     from '@angular/common';
import { RouterModule }                     from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
}                                           from '@angular/forms';
import { AuthService }                      from '../../../core/services/auth.service';

/** Cross-field validator: password and confirmPassword must match. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pw      = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { passwordsMismatch: true } : null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent implements OnInit {
  private readonly fb          = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  registerForm!: FormGroup;
  loading       = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  ngOnInit(): void {
    this.registerForm = this.fb.group(
      {
        fullName:        ['', [Validators.required, Validators.minLength(2)]],
        email:           ['', [Validators.required, Validators.email]],
        password:        ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
        terms:           [false, Validators.requiredTrue],
      },
      { validators: passwordsMatchValidator }
    );
  }

  // ── Field helpers ──────────────────────────────────────────────────────────

  get fullName()        { return this.registerForm.get('fullName')!;        }
  get email()           { return this.registerForm.get('email')!;           }
  get password()        { return this.registerForm.get('password')!;        }
  get confirmPassword() { return this.registerForm.get('confirmPassword')!; }
  get terms()           { return this.registerForm.get('terms')!;           }

  get passwordsMismatch(): boolean {
    return (
      this.registerForm.hasError('passwordsMismatch') &&
      this.confirmPassword.touched
    );
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading        = true;
    this.errorMessage   = null;
    this.successMessage = null;

    try {
      const { email, password, fullName } = this.registerForm.value as {
        email: string;
        password: string;
        fullName: string;
      };

      await this.authService.register(email, password, fullName);

      this.successMessage =
        '¡Cuenta creada! Revisa tu correo para confirmar tu dirección.';
      this.registerForm.reset();
    } catch (err: unknown) {
      this.errorMessage =
        err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.';
    } finally {
      this.loading = false;
    }
  }
}
