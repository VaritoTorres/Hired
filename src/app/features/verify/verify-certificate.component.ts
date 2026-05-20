/**
 * @file verify-certificate.component.ts
 * @description Public certificate verification page — /verify/:code
 *
 * Fully public: no auth guard.
 * Calls the get_certificate_by_code() SECURITY DEFINER RPC.
 * Displays full certificate details, status (valid/revoked), and a
 * visual trust badge companies can screenshot for validation.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }        from '@angular/common';
import { ActivatedRoute }      from '@angular/router';
import { CertificateService }  from '../../core/services/certificate.service';
import { PublicCertificate }   from '../../shared/models/certificate.model';

@Component({
  selector: 'app-verify-certificate',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verify-certificate.component.html',
  styleUrls: ['./verify-certificate.component.css'],
})
export class VerifyCertificateComponent implements OnInit {
  private readonly route  = inject(ActivatedRoute);
  private readonly certSvc = inject(CertificateService);

  readonly certificate = signal<PublicCertificate | null>(null);
  readonly loading     = signal(true);
  readonly notFound    = signal(false);
  readonly errorMsg    = signal<string | null>(null);

  code = '';

  async ngOnInit(): Promise<void> {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    try {
      const cert = await this.certSvc.getPublicCertificate(this.code);
      if (!cert) {
        this.notFound.set(true);
      } else {
        this.certificate.set(cert);
      }
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Short display for reliability index */
  reliabilityLabel(index: number): string {
    if (index >= 85) return 'Excelente';
    if (index >= 70) return 'Bueno';
    if (index >= 55) return 'Aceptable';
    return 'Básico';
  }

  levelLabel(level: string): string {
    return level === 'senior' ? 'Senior' : 'Mid-Level';
  }

  levelColor(level: string): string {
    return level === 'senior' ? '#16a34a' : '#6366f1';
  }
}
