// Buttons on the "my quizzes" and browse lists. The lists themselves are server-rendered, so every
// action ends by taking the card off the page or by reloading.

import { api, show } from './api.js';

const errorText = document.querySelector('[data-error]');

function removeCard(button) {
  const card = button.closest('article');
  const parent = card.parentElement;

  card.remove();

  // The server decides what an empty list says, so reload to get its wording.
  if (!parent.querySelector('article')) {
    location.reload();
  }
}

for (const button of document.querySelectorAll('[data-archive]')) {
  button.addEventListener('click', async () => {
    const archive = button.dataset.archived !== 'true';

    show(errorText, '');

    try {
      await api(archive ? 'PUT' : 'DELETE', `/api/quizzes/${button.dataset.archive}/archive`);
      // Archiving moves the quiz to the other view, so it leaves this one either way.
      removeCard(button);
    } catch (error) {
      show(errorText, error.message || 'Could not change that.');
    }
  });
}

for (const button of document.querySelectorAll('[data-publish]')) {
  button.addEventListener('click', async () => {
    const next = button.dataset.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';

    show(errorText, '');

    try {
      const quiz = await api('PATCH', `/api/quizzes/${button.dataset.publish}/visibility`, { visibility: next });
      const published = quiz.visibility === 'PUBLIC';
      const badge = button.closest('article').querySelector('.badge');

      button.dataset.visibility = quiz.visibility;
      button.textContent = published ? 'Unpublish' : 'Publish';
      badge.textContent = published ? 'Published' : 'Private';
      badge.classList.toggle('public', published);
      badge.classList.toggle('private', !published);
    } catch (error) {
      show(errorText, error.message || 'Could not change that.');
    }
  });
}

for (const button of document.querySelectorAll('[data-delete]')) {
  button.addEventListener('click', async () => {
    if (!confirm(`Delete "${button.dataset.title}" and all its questions? This cannot be undone.`)) {
      return;
    }

    show(errorText, '');

    try {
      await api('DELETE', `/api/quizzes/${button.dataset.delete}`);
      removeCard(button);
    } catch (error) {
      show(errorText, error.message || 'Could not delete that.');
    }
  });
}
