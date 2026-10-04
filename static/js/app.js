// Loaded on every page: sign-out, flash messages, and local dates.

import { api, takeFlash, show } from './api.js';

for (const button of document.querySelectorAll('[data-sign-out]')) {
  button.addEventListener('click', async () => {
    try {
      await api('POST', '/api/auth/logout', {});
    } catch {
      // Signing out of a session that is already gone is still signing out.
    }

    location.assign('/');
  });
}

const message = takeFlash();

if (message) {
  show(document.querySelector('[data-flash]') ?? document.querySelector('[data-notice]'), message);
}

// The server renders UTC; the reader wants their own clock.
const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

for (const time of document.querySelectorAll('time[data-date]')) {
  const date = new Date(time.getAttribute('datetime'));

  if (!Number.isNaN(date.getTime())) {
    time.textContent = format.format(date);
  }
}
