/**
 * @file public-profile.component.ts
 * @description Public profile page — /u/:slug
 *
 * Fully public: no auth guard.
 * Shows verified certifications and technical scores without any private data.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }       from '@angular/common';
import { RouterModule }       from '@angular/router';
import { ActivatedRoute }     from '@angular/router';
import { CertificateService } from '../../core/services/certificate.service';
import {
  PublicProfile,
  PublicProfileCert,
  PublicProfileScore,
} from '../../shared/models/certificate.model';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './public-profile.component.html',
  styleUrls: ['./public-profile.component.css'],
})
export class PublicProfileComponent implements OnInit {
  private readonly route   = inject(ActivatedRoute);
  private readonly certSvc = inject(CertificateService);

  readonly profile   = signal<PublicProfile | null>(null);
  readonly loading   = signal(true);
  readonly notFound  = signal(false);
  readonly errorMsg  = signal<string | null>(null);

  slug = '';

  async ngOnInit(): Promise<void> {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.slug) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    try {
      const p = await this.certSvc.getPublicProfile(this.slug);
      if (!p) {
        this.notFound.set(true);
      } else {
        this.profile.set(p);
      }
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  levelColor(level: string): string {
    if (level === 'senior')    return '#16a34a';
    if (level === 'mid')       return '#6366f1';
    if (level === 'junior')    return '#f59e0b';
    return '#94a3b8';
  }

  certLevelLabel(level: string): string {
    return level === 'senior' ? 'Senior' : 'Mid-Level';
  }

  certLevelColor(level: string): string {
    return level === 'senior' ? '#16a34a' : '#6366f1';
  }

  reliabilityBar(index: number): number {
    return Math.min(100, Math.max(0, index));
  }
}
