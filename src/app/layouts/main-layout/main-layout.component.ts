import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavbarComponent }         from '../../shared/components/navbar/navbar.component';
import { SidebarComponent }        from '../../shared/components/sidebar/sidebar.component';
import { FooterComponent }         from '../../shared/components/footer/footer.component';
import { ToastContainerComponent } from '../../shared/components/ui/toast-container/toast-container.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent, SidebarComponent, FooterComponent, ToastContainerComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css'],
})
export class MainLayoutComponent {}
