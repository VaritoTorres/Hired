/**
 * @file admin-certificates.component.ts
 * @description Admin panel for listing and revoking certificates.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }       from '@angular/common';
import { FormsModule }        from '@angular/forms';
import { CertificateService, CertificateAdmin } from '../../../core/services/certificate.service';

@Component({
  selector: 'app-admin-certificates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-certificates.component.html',
  styleUrls: ['./admin-certificates.component.css'],
})
export class AdminCertificatesComponent implements OnInit {
  private readonly certSvc = inject(CertificateService);

  readonly certificates = signal<CertificateAdmin[]>([]);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly errorMsg     = signal<string | null>(null);
  readonly successMsg   = signal<string | null>(null);

  /** Revocation flow state */
  revokeTargetId:     string | null = null;
  revokeTargetCode:   string        = '';
  revokeReason:       string        = '';

  /** Filter state */
  showRevoked = false;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      this.certificates.set(await this.certSvc.getAllCertificates(500));
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  get visibleCerts(): CertificateAdmin[] {
    const all = this.certificates();
    return this.showRevoked ? all : all.filter((c) => !c.is_revoked);
  }

  startRevoke(cert: CertificateAdmin): void {
    this.revokeTargetId   = cert.id;
    this.revokeTargetCode = cert.verification_code;
    this.revokeReason     = '';
  }

  cancelRevoke(): void {
    this.revokeTargetId = null;
    this.revokeReason   = '';
  }

  async confirmRevoke(): Promise<void> {
    if (!this.revokeTargetId) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.certSvc.revokeCertificate(this.revokeTargetId, this.revokeReason || undefined);
      this.successMsg.set(`Certificado ${this.revokeTargetCode} revocado.`);
      this.revokeTargetId = null;
      this.revokeReason   = '';
      await this.load();
      setTimeout(() => this.successMsg.set(null), 4000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  levelLabel(level: string): string {
    return level === 'senior' ? 'Senior' : 'Mid-Level';
  }
}
