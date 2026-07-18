import { Routes } from '@angular/router';

/**
 * Every route is lazily loaded, so the front page ships without the dashboard's code.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./front-page/front-page').then((m) => m.FrontPage)
  },
  {
    path: 'crypto',
    loadComponent: () =>
      import('./crypto/crypto-dashboard/crypto-dashboard').then((m) => m.CryptoDashboard)
  },
  { path: '**', redirectTo: '' }
];
