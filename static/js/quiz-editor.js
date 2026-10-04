// The quiz editor: quiz details, questions, ordering, publishing and sharing.
//
// Starts from the JSON the server embedded in the page, then talks to /api for every change and
// re-renders from what the server answers - the server's version of the quiz is the truth, not
// what this page last believed.

import { api, esc } from './api.js';

const root = document.querySelector('[data-editor]');
const initial = JSON.parse(document.getElementById('editor-data').textContent);

const state = {
  quizId: null,
  title: '',
  description: '',
  studyFieldId: initial.fields[0]?.id ?? null,
  subject: '',
  defaultTimeLimit: 30,
  shuffle: false,
  visibility: 'PRIVATE',
  questions: [],

  saving: false,
  notice: '',
  fieldErrors: {},

  // The question form. `editingQuestionId` null means "adding".
  questionFormOpen: false,
  editingQuestionId: null,
  qKind: 'MULTIPLE_CHOICE',
  qPrompt: '',
  qExplanation: '',
  qTimeLimit: '',
  qOptions: [],

  sharingQuiz: false,
  sharingQuestionId: null,
  selectedFriends: []
};

const blankOptions = () => [
  { body: '', isCorrect: true },
  { body: '', isCorrect: false }
];

function load(quiz) {
  state.quizId = quiz.id;
  state.title = quiz.title;
  state.description = quiz.description ?? '';
  state.studyFieldId = quiz.studyFieldId;
  state.subject = quiz.subject;
  state.defaultTimeLimit = quiz.defaultTimeLimitSeconds;
  state.shuffle = quiz.shuffleQuestions;
  state.visibility = quiz.visibility;
  state.questions = quiz.questions ?? [];
}

if (initial.quiz) {
  load(initial.quiz);
}

const isNew = () => state.quizId === null;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fieldError = (name) =>
  state.fieldErrors[name] ? `<span class="field-error">${esc(state.fieldErrors[name])}</span>` : '';

const correctAnswerOf = (question) => {
  const correct = question.options.filter((o) => o.isCorrect).map((o) => o.body);
  return correct.length ? correct.join(' / ') : '—';
};

// --- rendering ------------------------------------------------------------------------------------

function detailsCard() {
  return `
    <section class="card">
      <label class="field">
        <span class="field-label">Title</span>
        <input type="text" name="title" data-bind="title" value="${esc(state.title)}">
        ${fieldError('title')}
      </label>

      <label class="field">
        <span class="field-label">Study field</span>
        <select name="field" data-bind="studyFieldId">
          ${initial.fields
            .map((f) => `<option value="${f.id}"${f.id === state.studyFieldId ? ' selected' : ''}>${esc(f.name)}</option>`)
            .join('')}
        </select>
        ${fieldError('studyFieldId')}
      </label>

      <label class="field">
        <span class="field-label">Subject</span>
        <input type="text" name="subject" list="known-subjects" data-bind="subject"
               placeholder="English grammar, World capitals, …" value="${esc(state.subject)}">
        <datalist id="known-subjects">
          ${initial.subjects.map((name) => `<option value="${esc(name)}"></option>`).join('')}
        </datalist>
        <span class="field-hint">Anything you like, inside the study field above.</span>
        ${fieldError('subject')}
      </label>

      <label class="field">
        <span class="field-label">Description</span>
        <textarea name="description" data-bind="description">${esc(state.description)}</textarea>
        ${fieldError('description')}
      </label>

      <label class="field">
        <span class="field-label">Default time limit (seconds)</span>
        <input type="number" name="limit" min="5" max="600" data-bind="defaultTimeLimit" value="${esc(state.defaultTimeLimit)}">
        <span class="field-hint">What a new question starts with. Each can override it.</span>
        ${fieldError('defaultTimeLimitSeconds')}
      </label>

      <label class="checkbox">
        <input type="checkbox" name="shuffle" data-bind="shuffle"${state.shuffle ? ' checked' : ''}>
        Shuffle the question order each time
      </label>

      <div class="actions">
        <button type="button" class="btn primary" data-action="save-quiz"${state.saving ? ' disabled' : ''}>
          ${state.saving ? 'Saving…' : 'Save'}
        </button>
        ${
          isNew()
            ? ''
            : `<button type="button" class="btn" data-action="toggle-publish">
                 ${state.visibility === 'PUBLIC' ? 'Unpublish' : 'Publish to the pool'}
               </button>
               ${
                 initial.friends.length
                   ? '<button type="button" class="btn" data-action="share-quiz">Share with friends</button>'
                   : ''
               }`
        }
      </div>
    </section>`;
}

function questionForm() {
  const typed = state.qKind === 'TYPED';

  const rows = state.qOptions
    .map(
      (option, index) => `
      <div class="option-row">
        ${
          typed
            ? ''
            : `<input type="radio" name="correct"${option.isCorrect ? ' checked' : ''}
                      data-correct="${index}" aria-label="Mark choice ${index + 1} as correct">`
        }
        <input type="text" class="option-body" name="option${index}" data-option="${index}" value="${esc(option.body)}">
        <button type="button" class="btn danger" data-remove-option="${index}" aria-label="Remove this answer">×</button>
      </div>`
    )
    .join('');

  return `
    <section class="card question-form">
      <div class="chips">
        <button type="button" class="chip${typed ? '' : ' selected'}" data-kind="MULTIPLE_CHOICE">Multiple choice</button>
        <button type="button" class="chip${typed ? ' selected' : ''}" data-kind="TYPED">Type the answer</button>
      </div>

      <label class="field">
        <span class="field-label">Question</span>
        <textarea name="prompt" data-bind="qPrompt">${esc(state.qPrompt)}</textarea>
        ${fieldError('prompt')}
      </label>

      <span class="field-label">${typed ? 'Accepted answers' : 'Choices'}</span>
      ${
        typed
          ? `<span class="field-hint answers-hint">
               Case, surrounding spaces and a trailing full stop are ignored when marking. Add a row
               for each spelling you will accept.
             </span>`
          : ''
      }

      ${rows}
      ${fieldError('options')}

      <button type="button" class="btn add-option" data-action="add-option">Add another</button>

      <label class="field">
        <span class="field-label">Time limit (seconds)</span>
        <input type="number" name="qlimit" min="5" max="600" data-bind="qTimeLimit" value="${esc(state.qTimeLimit)}">
        ${fieldError('timeLimitSeconds')}
      </label>

      <label class="field">
        <span class="field-label">Explanation (optional)</span>
        <textarea name="explanation" data-bind="qExplanation">${esc(state.qExplanation)}</textarea>
        <span class="field-hint">Shown after the answer is given, never before.</span>
        ${fieldError('explanation')}
      </label>

      <div class="actions">
        <button type="button" class="btn primary" data-action="save-question"${state.saving ? ' disabled' : ''}>Save question</button>
        <button type="button" class="btn" data-action="cancel-question">Cancel</button>
      </div>
    </section>`;
}

function questionCard(question, index, count) {
  return `
    <article class="card${question.archived ? ' archived' : ''}">
      <p class="card-title">
        ${question.position}. ${esc(question.prompt)}
        ${question.archived ? '<span class="badge">Archived</span>' : ''}
      </p>
      <p class="card-meta">
        ${question.kind === 'TYPED' ? 'Typed' : 'Multiple choice'} ·
        ${question.timeLimitSeconds}s ·
        answer: ${esc(correctAnswerOf(question))}
      </p>

      <div class="actions">
        <button type="button" class="btn" data-edit-question="${question.id}">Edit</button>
        <button type="button" class="btn" data-move="${question.id}" data-delta="-1"${index === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" class="btn" data-move="${question.id}" data-delta="1"${index === count - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="btn" data-archive-question="${question.id}">${question.archived ? 'Unarchive' : 'Archive'}</button>
        ${initial.friends.length ? `<button type="button" class="btn" data-share-question="${question.id}">Share</button>` : ''}
        <button type="button" class="btn danger" data-delete-question="${question.id}">Delete</button>
      </div>
    </article>`;
}

function questionsSection() {
  if (isNew()) {
    return '<p class="empty-state">Save the quiz, then add its questions.</p>';
  }

  return `
    <header class="page-head questions-head">
      <h2>Questions (${state.questions.length})</h2>
      <button type="button" class="btn primary" data-action="new-question">Add question</button>
    </header>

    ${state.questionFormOpen ? questionForm() : ''}
    ${state.questions.length === 0 && !state.questionFormOpen ? '<p class="empty-state">No questions yet.</p>' : ''}
    ${state.questions.map((q, i) => questionCard(q, i, state.questions.length)).join('')}`;
}

function sharePanel() {
  if (!state.sharingQuiz && state.sharingQuestionId === null) {
    return '';
  }

  return `
    <section class="card share-panel">
      <h2 class="card-title">${state.sharingQuiz ? 'Share this quiz' : 'Share this question'}</h2>
      <p class="card-meta">
        They will get it in their Shared list, and an email if the site is configured to send one.
      </p>

      <div class="chips">
        ${initial.friends
          .map(
            (friend) => `
            <button type="button" class="chip${state.selectedFriends.includes(friend.id) ? ' selected' : ''}"
                    data-toggle-friend="${friend.id}">${esc(friend.username)}</button>`
          )
          .join('')}
      </div>

      <div class="actions">
        <button type="button" class="btn primary" data-action="confirm-share"${
          state.selectedFriends.length === 0 || state.saving ? ' disabled' : ''
        }>Share</button>
        <button type="button" class="btn" data-action="close-share">Cancel</button>
      </div>
    </section>`;
}

function render() {
  // Typing happens in inputs that this redraw replaces, so remember where the caret was.
  const active = document.activeElement;
  const focusKey = active && root.contains(active) ? active.name || active.dataset.option : null;
  const caret = active?.selectionStart ?? null;

  root.innerHTML = `
    <header class="page-head">
      <div>
        <h1>${isNew() ? 'New quiz' : 'Edit quiz'}</h1>
        <p class="lede">Questions can be multiple choice or typed, each with its own time limit.</p>
      </div>
      <a class="btn" href="/quizzes">Back</a>
    </header>

    ${state.notice ? `<p class="notice" role="status">${esc(state.notice)}</p>` : ''}

    ${detailsCard()}
    ${questionsSection()}
    ${sharePanel()}`;

  if (focusKey) {
    const target =
      root.querySelector(`[name="${CSS.escape(focusKey)}"]`) ?? root.querySelector(`[data-option="${CSS.escape(focusKey)}"]`);

    if (target) {
      target.focus();

      if (caret !== null && target.setSelectionRange) {
        try {
          target.setSelectionRange(caret, caret);
        } catch {
          // Number inputs have no caret to restore.
        }
      }
    }
  }
}

// --- actions --------------------------------------------------------------------------------------

function onError(error) {
  state.saving = false;

  if (error.status === 400 && Object.keys(error.fields).length) {
    state.fieldErrors = error.fields;

    const messages = [...new Set(Object.values(error.fields))];
    state.notice = messages.length ? messages.join(' ') : error.message || 'Please check the form.';
  } else {
    state.notice = error.message || 'Something went wrong. Please try again.';
  }

  render();
}

async function saveQuiz() {
  if (state.saving) {
    return;
  }

  const studyFieldId = Number(state.studyFieldId);

  if (!Number.isInteger(studyFieldId)) {
    state.fieldErrors = { studyFieldId: 'Pick a study field from the list.' };
    render();
    return;
  }

  state.saving = true;
  state.fieldErrors = {};
  state.notice = '';
  render();

  const input = {
    title: state.title,
    description: state.description,
    studyFieldId,
    subject: state.subject,
    defaultTimeLimitSeconds: Number(state.defaultTimeLimit),
    shuffleQuestions: state.shuffle
  };

  const wasNew = isNew();

  try {
    const quiz = await api(wasNew ? 'POST' : 'PUT', wasNew ? '/api/quizzes' : `/api/quizzes/${state.quizId}`, input);

    state.saving = false;
    load(quiz);
    state.notice = 'Saved.';

    if (wasNew) {
      history.replaceState(null, '', `/quizzes/${quiz.id}/edit`);
    }

    render();
  } catch (error) {
    onError(error);
  }
}

async function togglePublish() {
  const next = state.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';

  try {
    const quiz = await api('PATCH', `/api/quizzes/${state.quizId}/visibility`, { visibility: next });

    state.visibility = quiz.visibility;
    state.notice = quiz.visibility === 'PUBLIC' ? 'Published to the pool.' : 'Unpublished.';
    render();
  } catch (error) {
    onError(error);
  }
}

function newQuestion() {
  state.editingQuestionId = null;
  state.qKind = 'MULTIPLE_CHOICE';
  state.qPrompt = '';
  state.qExplanation = '';
  state.qTimeLimit = state.defaultTimeLimit;
  state.qOptions = blankOptions();
  state.fieldErrors = {};
  state.questionFormOpen = true;
  render();
}

function editQuestion(id) {
  const question = state.questions.find((q) => q.id === id);

  if (!question) {
    return;
  }

  state.editingQuestionId = id;
  state.qKind = question.kind;
  state.qPrompt = question.prompt;
  state.qExplanation = question.explanation ?? '';
  state.qTimeLimit = question.timeLimitSeconds;
  state.qOptions = question.options.map((o) => ({ body: o.body, isCorrect: o.isCorrect }));
  state.fieldErrors = {};
  state.questionFormOpen = true;
  render();
}

function setKind(kind) {
  state.qKind = kind;

  if (kind === 'TYPED') {
    // Every typed row is an accepted answer, so drop the blanks and mark the rest correct.
    const filled = state.qOptions.filter((o) => o.body.trim());
    state.qOptions = filled.length ? filled.map((o) => ({ ...o, isCorrect: true })) : [{ body: '', isCorrect: true }];
  } else if (state.qOptions.length < 2) {
    state.qOptions = [...state.qOptions, { body: '', isCorrect: false }];
  }

  render();
}

async function saveQuestion() {
  if (state.saving) {
    return;
  }

  const input = {
    kind: state.qKind,
    prompt: state.qPrompt,
    explanation: state.qExplanation,
    options: state.qOptions.filter((o) => o.body.trim().length > 0)
  };

  if (`${state.qTimeLimit}`.trim() !== '') {
    input.timeLimitSeconds = Number(state.qTimeLimit);
  }

  state.saving = true;
  state.fieldErrors = {};
  state.notice = '';
  render();

  try {
    const quiz = state.editingQuestionId
      ? await api('PUT', `/api/questions/${state.editingQuestionId}`, input)
      : await api('POST', `/api/quizzes/${state.quizId}/questions`, input);

    state.saving = false;
    state.questions = quiz.questions ?? [];
    state.questionFormOpen = false;
    render();
  } catch (error) {
    onError(error);
  }
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) {
    return;
  }

  try {
    const quiz = await api('DELETE', `/api/questions/${id}`);
    state.questions = quiz.questions ?? [];
    render();
  } catch (error) {
    onError(error);
  }
}

async function toggleQuestionArchive(id) {
  const question = state.questions.find((q) => q.id === id);
  const archived = !question.archived;

  try {
    await api(archived ? 'PUT' : 'DELETE', `/api/questions/${id}/archive`);
    question.archived = archived;
    render();
  } catch (error) {
    onError(error);
  }
}

async function move(id, delta) {
  const order = state.questions.map((q) => q.id);
  const from = order.indexOf(id);
  const to = from + delta;

  if (to < 0 || to >= order.length) {
    return;
  }

  [order[from], order[to]] = [order[to], order[from]];

  try {
    const quiz = await api('PATCH', `/api/quizzes/${state.quizId}/order`, { questionIds: order });
    state.questions = quiz.questions ?? [];
    render();
  } catch (error) {
    onError(error);
  }
}

async function confirmShare() {
  if (state.selectedFriends.length === 0 || state.saving) {
    return;
  }

  state.saving = true;
  render();

  const path =
    state.sharingQuestionId !== null
      ? `/api/questions/${state.sharingQuestionId}/shares`
      : `/api/quizzes/${state.quizId}/shares`;

  try {
    const { shared } = await api('POST', path, { friendIds: state.selectedFriends });

    state.saving = false;
    closeShare();
    state.notice = shared === 0 ? 'Already shared with everyone you picked.' : `Shared with ${plural(shared, 'friend')}.`;
    render();
  } catch (error) {
    closeShare();
    onError(error);
  }
}

function closeShare() {
  state.sharingQuiz = false;
  state.sharingQuestionId = null;
}

function openShare({ quiz = false, question = null }) {
  state.selectedFriends = [];
  state.sharingQuiz = quiz;
  state.sharingQuestionId = question;
  render();
}

// --- events ---------------------------------------------------------------------------------------

// Fields write straight into state without redrawing: a redraw on every keystroke would fight the
// caret. The next action's redraw picks the values up.
root.addEventListener('input', (event) => {
  const el = event.target;

  if (el.dataset.bind) {
    state[el.dataset.bind] = el.type === 'checkbox' ? el.checked : el.value;
  } else if (el.dataset.option !== undefined) {
    state.qOptions[Number(el.dataset.option)].body = el.value;
  }
});

root.addEventListener('change', (event) => {
  const el = event.target;

  if (el.dataset.bind === 'studyFieldId') {
    state.studyFieldId = Number(el.value);
  } else if (el.dataset.correct !== undefined) {
    const picked = Number(el.dataset.correct);
    state.qOptions = state.qOptions.map((o, i) => ({ ...o, isCorrect: i === picked }));
  }
});

root.addEventListener('click', (event) => {
  const el = event.target.closest('button');

  if (!el) {
    return;
  }

  const { dataset } = el;

  switch (dataset.action) {
    case 'save-quiz': return saveQuiz();
    case 'toggle-publish': return togglePublish();
    case 'share-quiz': return openShare({ quiz: true });
    case 'new-question': return newQuestion();
    case 'save-question': return saveQuestion();
    case 'cancel-question':
      state.questionFormOpen = false;
      return render();
    case 'add-option':
      state.qOptions = [...state.qOptions, { body: '', isCorrect: false }];
      return render();
    case 'confirm-share': return confirmShare();
    case 'close-share':
      closeShare();
      return render();
    default:
  }

  if (dataset.kind) return setKind(dataset.kind);

  if (dataset.removeOption !== undefined) {
    state.qOptions = state.qOptions.filter((_, i) => i !== Number(dataset.removeOption));
    return render();
  }

  if (dataset.editQuestion) return editQuestion(Number(dataset.editQuestion));
  if (dataset.deleteQuestion) return deleteQuestion(Number(dataset.deleteQuestion));
  if (dataset.archiveQuestion) return toggleQuestionArchive(Number(dataset.archiveQuestion));
  if (dataset.move) return move(Number(dataset.move), Number(dataset.delta));
  if (dataset.shareQuestion) return openShare({ question: Number(dataset.shareQuestion) });

  if (dataset.toggleFriend) {
    const id = Number(dataset.toggleFriend);
    state.selectedFriends = state.selectedFriends.includes(id)
      ? state.selectedFriends.filter((value) => value !== id)
      : [...state.selectedFriends, id];
    render();
  }
});

render();
