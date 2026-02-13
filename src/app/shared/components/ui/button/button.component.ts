import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `<button class="ui-btn"><ng-content></ng-content></button>`,
  styles: [`.ui-btn{padding:.5rem 1rem;border-radius:.25rem;background:#2563eb;color:#fff;border:none}`],
})
export class ButtonComponent {
  @Input() type: 'button' | 'submit' = 'button';
}
