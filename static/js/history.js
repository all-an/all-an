import { api } from './api.js';

const modal = document.querySelector('[data-modal]');
const title = document.querySelector('[data-modal-title]');
const score = document.querySelector('[data-modal-score]');
const confirmButton = document.querySelector('[data-modal-confirm]');
const cancelButton = document.querySelector('[data-modal-cancel]');

let pending = null;
let deleting = false;

function close() {
  if (deleting) {
    return;
  }

  pending = null;
  modal.hidden = true;
}

for (const button of document.querySelectorAll('[data-delete-attempt]')) {
  button.addEventListener('click', () => {
    pending = button;
    title.textContent = button.dataset.title;
    score.textContent = `${button.dataset.score}`;
    modal.hidden = false;
    cancelButton.focus();
  });
}

cancelButton.addEventListener('click', close);

// A click on the backdrop dismisses; a click inside the card does not.
modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    close();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) {
    close();
  }
});

confirmButton.addEventListener('click', async () => {
  if (!pending || deleting) {
    return;
  }

  deleting = true;
  confirmButton.disabled = cancelButton.disabled = true;
  confirmButton.textContent = 'Deleting…';

  const row = pending.closest('.attempt-row');

  try {
    await api('DELETE', `/api/attempts/${pending.dataset.deleteAttempt}`);
    row.remove();
  } catch {
    // The row stays; reloading below shows what the server actually has.
  }

  deleting = false;
  confirmButton.disabled = cancelButton.disabled = false;
  confirmButton.textContent = 'Delete result';
  pending = null;
  modal.hidden = true;

  if (!document.querySelector('.attempt-row')) {
    location.reload();
  }
});
