/**
 * @file dashboard.component.ts
 * @description Main authenticated landing page.
 * Shows a personalised welcome and quick-access cards for each feature.
 */
import { Component, inject }  from '@angular/core';
import { CommonModule }       from '@angular/common';
import { RouterModule }       from '@angular/router';
import { AuthService }        from '../../core/services/auth.service';
import { AppUser }            from '../../core/models/user.model';
import { Observable }         from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);

  readonly currentUser$: Observable<AppUser | null> =
    this.authService.getCurrentUser();
}
