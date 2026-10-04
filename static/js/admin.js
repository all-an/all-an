import { api, show } from './api.js';

const checkbox = document.querySelector('[data-registration]');
const label = document.querySelector('[data-registration-label]');
const saveButton = document.querySelector('[data-save]');
const unsaved = document.querySelector('[data-unsaved]');
const notice = document.querySelector('[data-notice]');
const errorText = document.querySelector('[data-error]');

// What the server has, so "dirty" means differs-from-saved rather than has-been-touched.
let saved = checkbox.checked;
let sending = false;

function refresh() {
  const dirty = checkbox.checked !== saved;

  label.textContent = checkbox.checked ? 'Open' : 'Closed';
  saveButton.disabled = !dirty || sending;
  unsaved.hidden = !dirty;
}

checkbox.addEventListener('change', () => {
  show(notice, '');
  show(errorText, '');
  refresh();
});

saveButton.addEventListener('click', async () => {
  if (sending || checkbox.checked === saved) {
    return;
  }

  sending = true;
  saveButton.textContent = 'Saving…';
  show(notice, '');
  show(errorText, '');
  refresh();

  try {
    const settings = await api('PUT', '/api/settings', { registrationEnabled: checkbox.checked });

    saved = settings.registrationEnabled;
    checkbox.checked = saved;
    show(notice, saved ? 'Saved. Anyone can create an account.' : 'Saved. New accounts are closed.');
  } catch (error) {
    show(errorText, error.message || 'Could not save that. Please try again.');
  } finally {
    sending = false;
    saveButton.textContent = 'Save';
    refresh();
  }
});

refresh();
