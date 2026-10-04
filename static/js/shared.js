import { api, show } from './api.js';

const notice = document.querySelector('[data-notice]');
const errorText = document.querySelector('[data-error]');

/** Removes a card, and a section's worth of empty-state is not needed: the page reloads on the last. */
function removeCard(button) {
  const card = button.closest('article');
  const parent = card.parentElement;

  card.remove();

  // The server decides what an empty list says; reload to get that rather than duplicate the copy.
  if (!parent.querySelector('article')) {
    location.reload();
  }
}

for (const button of document.querySelectorAll('[data-dismiss-quiz]')) {
  button.addEventListener('click', async () => {
    try {
      await api('DELETE', `/api/shares/quizzes/${button.dataset.dismissQuiz}`);
      removeCard(button);
    } catch (error) {
      show(errorText, error.message);
    }
  });
}

for (const button of document.querySelectorAll('[data-dismiss-question]')) {
  button.addEventListener('click', async () => {
    try {
      await api('DELETE', `/api/shares/questions/${button.dataset.dismissQuestion}`);
      removeCard(button);
    } catch (error) {
      show(errorText, error.message);
    }
  });
}

for (const button of document.querySelectorAll('[data-open-copy]')) {
  button.addEventListener('click', () => {
    const card = button.closest('article');

    // One picker open at a time.
    for (const picker of document.querySelectorAll('[data-copy-picker]')) {
      picker.hidden = true;
    }

    card.querySelector('[data-copy-picker]').hidden = false;
  });
}

for (const button of document.querySelectorAll('[data-cancel-copy]')) {
  button.addEventListener('click', () => {
    button.closest('[data-copy-picker]').hidden = true;
  });
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const card = button.closest('article');
    const picker = card.querySelector('[data-copy-picker]');
    const quizId = Number(picker.querySelector('select').value);

    show(errorText, '');

    try {
      await api('POST', `/api/shares/questions/${button.dataset.copy}/copy`, { quizId });

      picker.hidden = true;
      show(notice, 'Copied into your quiz.');

      const meta = card.querySelector('.card-meta');

      if (meta && !meta.querySelector('.copied-note')) {
        meta.append(' · ');
        meta.insertAdjacentHTML('beforeend', '<span class="copied-note">already copied</span>');
      }
    } catch (error) {
      show(errorText, error.message || 'Could not copy that question.');
    }
  });
}
