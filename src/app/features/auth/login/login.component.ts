import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ButtonComponent } from '../../../shared/components/ui/button/button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  constructor(private router: Router) {}

  onSubmit(evt: Event) {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    // If form is invalid, add helper class to show validation state
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const data = new FormData(form);
    const email = data.get('email') as string | null;
    // Placeholder: replace with real auth call
    console.log('Login', { email });
    // Navigate to dashboard after successful login (placeholder)
    this.router.navigate(['/dashboard']);
  }
}
