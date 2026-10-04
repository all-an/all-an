import { api, show } from './api.js';

// A module script has no `currentScript`, so the quiz id rides on the tag that loaded it.
const tag = document.querySelector('script[data-quiz-id]');

try {
  const { attemptId } = await api('POST', '/api/attempts', { quizId: Number(tag.dataset.quizId) });
  location.replace(`/quizzes/attempt/${attemptId}`);
} catch (error) {
  show(document.querySelector('[data-error]'), error.message || 'Could not start that quiz.');
  document.querySelector('[data-starting]').hidden = true;
  document.querySelector('[data-back]').hidden = false;
}
