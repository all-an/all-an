import { Routes } from '@angular/router';

import { authGuard } from './auth/auth.guard.js';

/**
 * Every route is lazily loaded, so the front page ships without the quiz code.
 *
 * The guard is convenience, not security: everything behind it is enforced again on the server,
 * because hiding a page in the router does nothing about somebody calling the API directly.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./front-page/front-page').then((m) => m.FrontPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then((m) => m.Login)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then((m) => m.Register)
  },

  // --- quizzes ---
  {
    path: 'quizzes',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/my-quizzes/my-quizzes').then((m) => m.MyQuizzes)
  },
  {
    // Before 'quizzes/:id/...' so the literal segment is not read as an id.
    path: 'quizzes/browse',
    loadComponent: () => import('./quizzes/browse/browse').then((m) => m.Browse)
  },
  {
    path: 'quizzes/browse/:studyField',
    loadComponent: () => import('./quizzes/browse/browse').then((m) => m.Browse)
  },
  {
    path: 'quizzes/new',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/quiz-editor/quiz-editor').then((m) => m.QuizEditor)
  },
  {
    path: 'quizzes/attempt/:attemptId',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/runner/runner').then((m) => m.Runner)
  },
  {
    path: 'quizzes/:id/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/quiz-editor/quiz-editor').then((m) => m.QuizEditor)
  },
  {
    path: 'quizzes/:id/take',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/runner/start-attempt').then((m) => m.StartAttempt)
  },

  // --- results ---
  {
    path: 'results',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/results/history').then((m) => m.History)
  },
  {
    path: 'results/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./quizzes/results/results').then((m) => m.Results)
  },

  // --- friends and sharing ---
  {
    path: 'friends',
    canActivate: [authGuard],
    loadComponent: () => import('./friends/friends-page/friends-page').then((m) => m.FriendsPage)
  },
  {
    path: 'shared',
    canActivate: [authGuard],
    loadComponent: () => import('./friends/shared-page/shared-page').then((m) => m.SharedPage)
  },

  // --- static pages ---
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
