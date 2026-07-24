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
  {
    path: 'about',
    loadComponent: () => import('./about-me/about-me').then((m) => m.AboutMe)
  },
  {
    path: 'message',
    loadComponent: () => import('./message-me/message-me').then((m) => m.MessageMe)
  },
  { path: '**', redirectTo: '' }
];
