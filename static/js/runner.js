// The quiz runner: one question at a time against a clock.
//
// The countdown here is a courtesy. The server stamped the moment it served the question and
// measures the answer against that, so pausing or editing this timer gains nothing - it only
// decides when the browser submits on the reader's behalf.

import { api, esc } from './api.js';

const root = document.querySelector('[data-runner]');
const attemptId = Number(root.dataset.attemptId);

const state = {
  phase: 'loading', // loading | asking | feedback | error
  question: null,
  feedback: null,
  errorText: '',
  archivedThis: false,
  typed: '',
  chosen: null
};

let ticker = null;
let deadline = 0;
let remainingMs = 0;

const seconds = () => Math.ceil(remainingMs / 1000);

function percent() {
  const total = (state.question?.timeLimitSeconds ?? 1) * 1000;
  return Math.max(0, Math.min(100, (remainingMs / total) * 100));
}

function stopTimer() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

/** Only the clock and the bar change on a tick; redrawing the page would eat what is being typed. */
function paintClock() {
  const clock = root.querySelector('[data-clock]');
  const bar = root.querySelector('[data-bar]');

  if (clock) {
    clock.textContent = `${seconds()}s`;
    clock.classList.toggle('urgent', seconds() <= 10);
  }

  if (bar) {
    bar.style.width = `${state.phase === 'asking' ? percent() : 0}%`;
  }
}

function startTimer(ms) {
  stopTimer();
  deadline = Date.now() + ms;
  remainingMs = ms;

  ticker = setInterval(() => {
    const left = deadline - Date.now();
    remainingMs = Math.max(0, left);
    paintClock();

    if (left <= 0) {
      stopTimer();
      submit();
    }
  }, 100);
}

function render() {
  const q = state.question;

  if (state.phase === 'error') {
    root.innerHTML = `
      <p class="notice" role="alert">${esc(state.errorText)}</p>
      <button type="button" class="btn" data-action="quit">See results</button>`;
    return;
  }

  if (!q) {
    root.innerHTML = '<p class="empty-state">Loading…</p>';
    return;
  }

  const asking = state.phase === 'asking';

  let body;

  if (state.phase === 'feedback' && state.feedback) {
    const result = state.feedback;
    const heading = result.correct ? 'Correct' : result.timedOut ? 'Out of time' : 'Not quite';

    body = `
      <section class="verdict ${result.correct ? 'right' : 'wrong'}">
        <h2>${heading}</h2>
        ${result.correct ? '' : `<p>The answer was <strong>${esc(result.correctAnswer)}</strong>.</p>`}
        ${result.explanation ? `<p>${esc(result.explanation)}</p>` : ''}
      </section>

      <div class="actions">
        <button type="button" class="btn primary" data-action="next">
          ${result.finished ? 'See results' : 'Next question'}
        </button>
        ${
          state.archivedThis
            ? `<span class="archived-note">Learned — you won't be asked this again.</span>`
            : `<button type="button" class="btn" data-action="archive">I've learned this</button>`
        }
      </div>`;
  } else {
    const input =
      q.kind === 'MULTIPLE_CHOICE'
        ? (q.options ?? [])
            .map(
              (option) => `
              <button type="button" class="choice${state.chosen === option.id ? ' selected' : ''}"
                      data-choice="${option.id}" ${asking ? '' : 'disabled'}>${esc(option.body)}</button>`
            )
            .join('')
        : `<form data-typed-form>
             <input class="typed-answer" name="answer" autocomplete="off" autocapitalize="none"
                    spellcheck="false" placeholder="Type your answer"
                    value="${esc(state.typed)}" ${asking ? '' : 'disabled'}>
           </form>`;

    body = `
      ${input}
      <div class="actions">
        <button type="button" class="btn primary" data-action="submit" ${asking ? '' : 'disabled'}>Answer</button>
        <button type="button" class="btn" data-action="quit">Give up</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="progress">
      <span>Question ${q.position} of ${q.total}</span>
      ${asking ? `<span class="clock${seconds() <= 10 ? ' urgent' : ''}" data-clock>${seconds()}s</span>` : ''}
    </div>
    <div class="timer-track" role="presentation">
      <div class="timer-bar" data-bar style="width:${asking ? percent() : 0}%"></div>
    </div>
    <h1 class="prompt">${esc(q.prompt)}</h1>
    ${body}`;

  const typed = root.querySelector('.typed-answer');

  if (typed && asking) {
    typed.focus();
    typed.setSelectionRange(typed.value.length, typed.value.length);
  }
}

async function loadNext() {
  state.phase = 'loading';
  state.typed = '';
  state.chosen = null;
  state.feedback = null;
  state.archivedThis = false;
  render();

  try {
    const result = await api('GET', `/api/attempts/${attemptId}/current`);

    if (result.finished) {
      location.assign(`/results/${attemptId}`);
      return;
    }

    state.question = result;
    state.phase = 'asking';
    startTimer(result.remainingMs);
    render();
  } catch (error) {
    fail(error, 'Could not load that question.');
  }
}

function fail(error, fallback) {
  stopTimer();
  state.errorText = error.body?.message ?? fallback;
  state.phase = 'error';
  render();
}

async function submit() {
  if (state.phase !== 'asking') {
    return;
  }

  stopTimer();

  const given =
    state.question.kind === 'MULTIPLE_CHOICE'
      ? state.chosen === null
        ? {}
        : { optionId: state.chosen }
      : { text: state.typed };

  // Keep the question on screen but inert while the answer is in flight.
  state.phase = 'loading';
  render();

  try {
    state.feedback = await api('POST', `/api/attempts/${attemptId}/answer`, given);
    state.phase = 'feedback';
    render();
    root.querySelector('[data-action="next"]')?.focus();
  } catch (error) {
    fail(error, 'Could not send that answer.');
  }
}

async function archiveCurrent() {
  if (!state.question || state.archivedThis) {
    return;
  }

  try {
    await api('PUT', `/api/questions/${state.question.questionId}/archive`);
    state.archivedThis = true;
    render();
  } catch {
    // Not being able to archive must not get in the way of carrying on.
  }
}

async function quit() {
  try {
    await api('POST', `/api/attempts/${attemptId}/finish`, {});
  } catch {
    // Results shows whatever was recorded, finished or not.
  }

  location.assign(`/results/${attemptId}`);
}

function next() {
  if (state.feedback?.finished) {
    location.assign(`/results/${attemptId}`);
    return;
  }

  loadNext();
}

root.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-choice]');

  if (choice && state.phase === 'asking') {
    state.chosen = Number(choice.dataset.choice);

    for (const button of root.querySelectorAll('[data-choice]')) {
      button.classList.toggle('selected', button === choice);
    }

    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;

  if (action === 'submit') submit();
  else if (action === 'quit') quit();
  else if (action === 'next') next();
  else if (action === 'archive') archiveCurrent();
});

root.addEventListener('input', (event) => {
  if (event.target.matches('.typed-answer')) {
    state.typed = event.target.value;
  }
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  submit();
});

loadNext();
