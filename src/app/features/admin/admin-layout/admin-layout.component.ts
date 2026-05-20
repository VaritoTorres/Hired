/**
 * @file admin-layout.component.ts
 * @description Shell component for the admin section.
 * Renders a persistent sidebar navigation and a <router-outlet> for child routes.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule }    from '@angular/common';
import { AdminService }    from '../../../core/services/admin.service';
import { ADMIN_NAV_ITEMS, AdminNavItem } from '../../../shared/models/admin.model';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css'],
})
export class AdminLayoutComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly navItems: AdminNavItem[] = ADMIN_NAV_ITEMS;
  readonly isVerified = signal(false);
  readonly loading    = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      this.isVerified.set(await this.adminService.isAdmin());
    } finally {
      this.loading.set(false);
    }
  }
}
