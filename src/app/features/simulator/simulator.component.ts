/**
 * @file simulator.component.ts
 * @description Legacy stub — superseded by the SimulatorConfigComponent wizard.
 * Kept for reference only; not referenced in any routes.
 * See: features/simulator/simulator-config/simulator-config.component.ts
 */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-simulator',
  standalone: true,
  imports: [CommonModule],
  template: `<ng-container></ng-container>`,
})
export class SimulatorComponent {
  constructor(private router: Router) {
    this.router.navigate(['/simulator']);
  }
}
