/**
 * @file competence-map.routes.ts
 * @description Lazy routes for the Mapa de Competencias feature.
 */
import { Routes } from '@angular/router';

export const COMPETENCE_MAP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./competence-map.component').then((m) => m.CompetenceMapComponent),
    title: 'Mapa de Competencias — HIRED',
  },
];
