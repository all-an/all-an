import { api, show } from './api.js';

const form = document.querySelector('[data-auth-form]');
const formError = document.querySelector('[data-form-error]');
const kind = form.dataset.authForm;
const button = form.querySelector('button[type="submit"]');
const idleLabel = button.textContent.trim();

/** Only same-site paths: `next` comes from the address bar, and an open redirect is a phishing aid. */
function destination() {
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/quizzes';
}

function showFieldErrors(fields) {
  for (const element of form.querySelectorAll('[data-error-for]')) {
    const message = fields[element.dataset.errorFor];
    const hint = element.dataset.hint;

    // A field with a problem shows the problem; one without goes back to its hint, if it has one.
    element.textContent = message ?? hint ?? '';
    element.hidden = !message && !hint;
    element.classList.toggle('hint', !message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (button.disabled) {
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  data.username = (data.username ?? '').trim();

  if ('email' in data) {
    data.email = data.email.trim();
  }

  button.disabled = true;
  button.textContent = button.dataset.busy;
  show(formError, '');
  showFieldErrors({});

  try {
    await api('POST', `/api/auth/${kind}`, data);
    location.assign(destination());
  } catch (error) {
    button.disabled = false;
    button.textContent = idleLabel;

    if (error.status === 400 && Object.keys(error.fields).length) {
      showFieldErrors(error.fields);
    } else {
      show(formError, error.message);
    }
  }
});
