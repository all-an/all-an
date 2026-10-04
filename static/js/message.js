import { api, show } from './api.js';

const panels = {
  form: document.querySelector('[data-state="form"]'),
  sent: document.querySelector('[data-state="sent"]'),
  limited: document.querySelector('[data-state="limited"]')
};

const form = document.querySelector('[data-message-form]');
const button = form.querySelector('button[type="submit"]');
const body = form.elements.body;
const counter = document.querySelector('[data-count]');
const errorText = document.querySelector('[data-error]');

function setState(name) {
  for (const [key, panel] of Object.entries(panels)) {
    panel.hidden = key !== name;
  }
}

function refresh() {
  counter.textContent = body.value.length;
  button.disabled = body.value.trim().length === 0;
}

body.addEventListener('input', refresh);
refresh();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (button.disabled) {
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending...';
  show(errorText, '');

  try {
    await api('POST', '/api/messages', {
      name: form.elements.name.value,
      email: form.elements.email.value,
      body: body.value
    });
    setState('sent');
  } catch (error) {
    button.textContent = 'Send message';
    refresh();

    if (error.status === 429) {
      // The server says which address to offer, so it lives in one place.
      const contact = error.body.contactEmail;

      if (contact) {
        const link = document.querySelector('[data-contact]');
        link.href = `mailto:${contact}`;
        link.textContent = contact;
      }

      setState('limited');
      return;
    }

    show(errorText, error.status === 0 ? error.message : error.body.message ?? 'Something went wrong sending that. Please try again.');
  }
});
