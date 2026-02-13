import { Routes } from '@angular/router';

import { LandingComponent } from './features/landing/landing.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { CreateExamComponent } from './features/exam/create-exam/create-exam.component';
import { TakeExamComponent } from './features/exam/take-exam/take-exam.component';
import { ResultsComponent } from './features/exam/results/results.component';
import { HistoryComponent } from './features/history/history.component';
import { ProfileComponent } from './features/profile/profile.component';

import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { AuthGuard } from './core/guards/auth.guard';

export const PUBLIC_ROUTES: Routes = [
  { path: '', component: LandingComponent },
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
];

export const PRIVATE_ROUTES: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'exam/create', component: CreateExamComponent },
      { path: 'exam/take/:id', component: TakeExamComponent },
      { path: 'exam/results/:id', component: ResultsComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'profile', component: ProfileComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];

export const APP_ROUTES: Routes = [
  ...PUBLIC_ROUTES,
  ...PRIVATE_ROUTES,
  { path: '**', redirectTo: '' },
];

export default APP_ROUTES;

