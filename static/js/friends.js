import { api, flash, show } from './api.js';

const errorText = document.querySelector('[data-error]');

/** Runs an action, then reloads to show the new state - the lists are server-rendered. */
async function act(run, message) {
  show(errorText, '');

  try {
    await run();

    if (message) {
      flash(message);
    }

    location.reload();
  } catch (error) {
    show(errorText, error.message);
  }
}

document.querySelector('[data-add-friend]').addEventListener('submit', (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const name = form.elements.username.value.trim();

  if (!name) {
    return;
  }

  const button = form.querySelector('button');
  button.disabled = true;

  act(async () => {
    try {
      const result = await api('POST', '/api/friends/requests', { username: name });
      flash(
        result.status === 'ACCEPTED'
          ? `You and ${name} are now friends - they had already asked you.`
          : `Request sent to ${name}.`
      );
    } catch (error) {
      button.disabled = false;
      throw error;
    }
  });
});

for (const button of document.querySelectorAll('[data-accept]')) {
  button.addEventListener('click', () => act(() => api('POST', `/api/friends/requests/${button.dataset.accept}/accept`)));
}

for (const button of document.querySelectorAll('[data-remove-request]')) {
  button.addEventListener('click', () => act(() => api('DELETE', `/api/friends/requests/${button.dataset.removeRequest}`)));
}

for (const button of document.querySelectorAll('[data-unfriend]')) {
  button.addEventListener('click', () => {
    if (confirm(`Remove ${button.dataset.name} from your friends?`)) {
      act(() => api('DELETE', `/api/friends/${button.dataset.unfriend}`));
    }
  });
}
