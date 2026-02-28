/**
 * @file navbar.component.ts
 * @description Top navigation bar for the authenticated shell.
 *
 * Displays the HIRED brand, active user info, and a logout action.
 * Subscribes to AuthService reactively — no manual session polling.
 */
import { Component, inject }             from '@angular/core';
import { CommonModule }                  from '@angular/common';
import { RouterModule }                  from '@angular/router';
import { AuthService }                   from '../../../core/services/auth.service';
import { AppUser }                       from '../../../core/models/user.model';
import { Observable }                    from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);

  readonly currentUser$: Observable<AppUser | null> =
    this.authService.getCurrentUser();

  async logout(): Promise<void> {
    await this.authService.logout();
  }
}
