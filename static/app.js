/* all-an: quizzes, results, timesheet and data. Everything is stored in this browser's
 * localStorage; the Data page exports it as CSV or JSON. The server renders the page around it. */
'use strict';

/* ======================================================================================
 * all-an — one file, no server. Everything lives in localStorage under KEY; the Data page
 * exports it as CSV or JSON and imports it back.
 * ==================================================================================== */

const KEY = 'all-an:v1';
const GRACE_MS = 2000;                 // same slack the server version gave an answer at the buzzer
const DAY_TYPES = ['WORK', 'LEAVE', 'HOLIDAY', 'SICK'];
const DAY_LABEL = { WORK: 'Work', LEAVE: 'Leave', HOLIDAY: 'Holiday', SICK: 'Sick' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FIELDS = [
  ['languages', 'Languages'], ['mathematics', 'Mathematics'], ['natural-sciences', 'Natural sciences'],
  ['technology', 'Technology'], ['history-geography', 'History & geography'], ['arts-literature', 'Arts & literature'],
  ['business-economics', 'Business & economics'], ['health-medicine', 'Health & medicine'],
  ['general-knowledge', 'General knowledge'], ['other', 'Other'],
];
const FIELD_NAME = Object.fromEntries(FIELDS);

/* ---------- small helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'quiz';

function fmtMin(m) { const sign = m < 0 ? '-' : ''; const a = Math.abs(m); return `${sign}${Math.floor(a / 60)}:${pad(a % 60)}`; }
function signed(m) { return (m > 0 ? '+' : '') + fmtMin(m); }
function signClass(m) { return m > 0 ? 'pos' : m < 0 ? 'neg' : ''; }
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function seconds(ms) { return ms == null ? '—' : (ms / 1000).toFixed(1) + 's'; }

function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s; }
function today() { return isoDate(new Date()); }
function weekOf(s) { const d = parseDate(s); const off = (d.getDay() + 6) % 7; const a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - off); const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6); return [isoDate(a), isoDate(b)]; }
function monthOf(s) { const d = parseDate(s); return [isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
function addDays(s, n) { const d = parseDate(s); return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
function longDate(s) { const d = parseDate(s); return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function shortDate(s) { return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
function stamp(iso) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }

function toast(message, bad = false) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.append(t);
  }
  t.textContent = message;
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, 3500);
}

/* ---------- storage ---------- */

let storageOk = true;

function seedQuizzes() {
  const mc = (prompt, explanation, time, options, correct) => ({
    id: uid(), kind: 'MULTIPLE_CHOICE', prompt, explanation, time,
    options: options.map((body, i) => ({ body, correct: i === correct })),
  });
  const typed = (prompt, explanation, time, ...accepted) => ({
    id: uid(), kind: 'TYPED', prompt, explanation, time, options: accepted.map((body) => ({ body, correct: true })),
  });
  const quiz = (title, description, field, subject, defaultTime, shuffleQuestions, questions) => ({
    id: uid(), title, description, field, subject, defaultTime, shuffle: shuffleQuestions, createdAt: new Date().toISOString(), questions,
  });

  return [
    quiz('English verb forms', 'Present tense, past tense, and the irregular ones that refuse to follow the rule.', 'languages', 'English grammar', 30, false, [
      mc('She ___ to work every day.', 'The third person singular in the present simple takes -es on "go".', 30, ['go', 'goes', 'going', 'gone'], 1),
      typed('What is the past tense of "buy"?', '"Buy" is irregular: bought, not buyed.', 25, 'bought'),
      mc('They ___ here since 2019.', 'A period that continues up to now takes the present perfect.', 30, ['live', 'lived', 'have lived', 'are living'], 2),
      typed('What is the past participle of "write"?', 'Write, wrote, written.', 25, 'written'),
    ]),
    quiz('Capital cities', 'One country, one capital. Several of these are not the largest city.', 'history-geography', 'World capitals', 20, true, [
      typed('What is the capital of Australia?', 'Canberra, chosen as a compromise between Sydney and Melbourne.', 20, 'Canberra'),
      mc('What is the capital of Brazil?', 'Brasilia was built inland in the 1950s and replaced Rio de Janeiro.', 20, ['Rio de Janeiro', 'Sao Paulo', 'Brasilia', 'Salvador'], 2),
      typed('What is the capital of Canada?', 'Ottawa - not Toronto, which is the larger city.', 20, 'Ottawa'),
      mc('What is the capital of Turkey?', 'Ankara has been the capital since 1923; Istanbul is the larger city.', 20, ['Istanbul', 'Ankara', 'Izmir', 'Bursa'], 1),
    ]),
    quiz('Mental arithmetic', 'Times tables and a little beyond, against a short clock.', 'mathematics', 'Mental arithmetic', 15, true, [
      typed('7 x 8', '', 15, '56'),
      typed('144 / 12', '', 15, '12'),
      mc('What is 15% of 240?', '10% is 24, half of that is 12, so 15% is 36.', 25, ['24', '36', '48', '30'], 1),
      typed('What is 13 squared?', '13 x 13 = 169.', 20, '169'),
    ]),
  ];
}

function emptyDb() {
  return { version: 1, seeded: false, quizzes: [], attempts: [], archived: [], timesheet: [], settings: { minimumHours: 8, onsitePercent: 50 } };
}

function normaliseDb(d) {
  const base = emptyDb();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base, ...d,
    quizzes: Array.isArray(d.quizzes) ? d.quizzes : [],
    attempts: Array.isArray(d.attempts) ? d.attempts : [],
    archived: Array.isArray(d.archived) ? d.archived : [],
    timesheet: Array.isArray(d.timesheet) ? d.timesheet : [],
    settings: { ...base.settings, ...(d.settings || {}) },
  };
}

function load() {
  let data = null;
  try { const raw = localStorage.getItem(KEY); if (raw) data = JSON.parse(raw); } catch (e) { storageOk = false; }
  const d = normaliseDb(data);
  if (!d.seeded) { d.quizzes = d.quizzes.concat(seedQuizzes()); d.seeded = true; }
  return d;
}

let db = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); storageOk = true; }
  catch (e) { storageOk = false; toast('Could not save to this browser (storage full or blocked). Export your data now.', true); }
}

try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* best effort */ }
save();

/* ---------- grading (port of grading.py) ---------- */

function normaliseTyped(value) {
  let t = String(value ?? '').normalize('NFC');
  t = t.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').trim();
  t = t.replace(/^["']+|["']+$/g, '').replace(/[.!?]+$/, '');
  return t.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
}
function gradeTyped(given, accepted) {
  const n = normaliseTyped(given);
  return n !== '' && accepted.some((a) => normaliseTyped(a) === n);
}

/* ---------- quiz model ---------- */

const findQuiz = (id) => db.quizzes.find((q) => q.id === id);
const findAttempt = (id) => db.attempts.find((a) => a.id === id);
const archivedSet = () => new Set(db.archived);

function validateQuiz(q) {
  const errors = [];
  if (!String(q.title || '').trim()) errors.push('Give the quiz a title.');
  if (String(q.title || '').length > 120) errors.push('The title is at most 120 characters.');
  if (!String(q.subject || '').trim()) errors.push('Give the quiz a subject.');
  if (!(q.defaultTime >= 5 && q.defaultTime <= 600)) errors.push('The default time must be 5 to 600 seconds.');
  (q.questions || []).forEach((question, i) => {
    const n = `Question ${i + 1}`;
    if (!String(question.prompt || '').trim()) errors.push(`${n}: write the question.`);
    if (!(question.time >= 5 && question.time <= 600)) errors.push(`${n}: time must be 5 to 600 seconds.`);
    const filled = (question.options || []).filter((o) => String(o.body || '').trim());
    if (question.kind === 'TYPED') {
      if (filled.length < 1) errors.push(`${n}: add at least one accepted answer.`);
    } else {
      if (filled.length < 2) errors.push(`${n}: add at least two choices.`);
      if (filled.filter((o) => o.correct).length !== 1) errors.push(`${n}: mark exactly one choice as correct.`);
    }
  });
  return errors;
}

function blankQuestion(time) {
  return { id: uid(), kind: 'MULTIPLE_CHOICE', prompt: '', explanation: '', time, options: [{ body: '', correct: true }, { body: '', correct: false }] };
}

/* ---------- attempts ---------- */

function attemptStats(a) {
  const total = a.questions.length;
  const answered = a.questions.filter((q) => q.answeredAt).length;
  const correct = a.questions.filter((q) => q.correct === true).length;
  return { total, answered, correct, percent: total ? Math.round((correct * 100) / total) : 0 };
}

function startAttempt(quizId) {
  const quiz = findQuiz(quizId);
  if (!quiz) return { error: 'No such quiz.' };
  if (!quiz.questions.length) return { error: 'That quiz has no questions yet.' };
  const arch = archivedSet();
  const remaining = quiz.questions.filter((q) => !arch.has(q.id));
  if (!remaining.length) return { error: 'You have marked every question in this quiz as learned. Restore one to take it again.' };
  if (quiz.shuffle) shuffle(remaining);

  const attempt = {
    id: uid(), quizId: quiz.id, quizTitle: quiz.title, startedAt: new Date().toISOString(), finishedAt: null,
    questions: remaining.map((q) => ({
      qid: q.id, kind: q.kind, prompt: q.prompt, explanation: q.explanation || '', time: q.time,
      options: q.kind === 'MULTIPLE_CHOICE' ? shuffle(q.options.map((o) => ({ body: o.body, correct: !!o.correct }))) : [],
      accepted: q.options.filter((o) => o.correct).map((o) => o.body),
      servedAt: null, answeredAt: null, given: null, correct: null, timedOut: false, skipped: false, elapsedMs: null,
    })),
  };
  db.attempts.push(attempt);
  save();
  return { attempt };
}

function nextIndex(a) { return a.questions.findIndex((q) => !q.answeredAt); }

function submitAnswer(a, given, auto) {
  const i = nextIndex(a);
  if (i < 0) return;
  const q = a.questions[i];
  const now = Date.now();
  const elapsed = q.servedAt ? now - q.servedAt : 0;
  const text = String(given ?? '');
  let correct = false;
  let timedOut = elapsed > q.time * 1000 + GRACE_MS;

  if (!timedOut) {
    correct = q.kind === 'MULTIPLE_CHOICE'
      ? q.options.some((o) => o.body === text && o.correct)
      : gradeTyped(text, q.accepted);
  }
  if (auto && !text.trim()) timedOut = true;

  Object.assign(q, { answeredAt: now, given: text.trim() ? text : null, correct, timedOut, elapsedMs: Math.min(elapsed, q.time * 1000 + GRACE_MS) });
  if (nextIndex(a) < 0) a.finishedAt = new Date().toISOString();
  save();
  ui.feedback = { attemptId: a.id, index: i };
}

function stopAttempt(a) {
  const now = Date.now();
  a.questions.forEach((q) => {
    if (!q.answeredAt) Object.assign(q, { answeredAt: now, correct: false, skipped: true, elapsedMs: 0 });
  });
  a.finishedAt = new Date().toISOString();
  save();
}

function correctText(q) { return q.accepted.length ? q.accepted.join(' / ') : '—'; }

/* ---------- timesheet model (port of timesheet.py) ---------- */

const minimumMinutes = () => Math.round(Number(db.settings.minimumHours) * 60) || 480;
const onsiteTarget = () => Number(db.settings.onsitePercent);

function compute(dayType, start, lunchOut, lunchBack, end, minimum) {
  if (dayType !== 'WORK' || !start || !end) return { total: 0, below: 0, above: 0 };
  let total = toMin(end) - toMin(start);
  if (lunchOut && lunchBack) total -= toMin(lunchBack) - toMin(lunchOut);
  return { total, below: Math.max(minimum - total, 0), above: Math.max(total - minimum, 0) };
}

/** Returns {row} or {errors: {field: message}}. A non-WORK day silently drops times and on-site. */
function normaliseDay(raw, minimum = minimumMinutes()) {
  const errors = {};
  const dayType = String(raw.dayType || 'WORK').trim().toUpperCase();
  if (!DAY_TYPES.includes(dayType)) errors.dayType = 'Day type must be one of ' + DAY_TYPES.join(', ') + '.';

  const date = String(raw.date || '').trim();
  if (!validDate(date)) errors.date = 'Date must be a real date.';

  const notes = String(raw.notes || '').trim();
  if (notes.length > 500) errors.notes = 'Notes must be at most 500 characters.';

  const names = ['start', 'lunchOut', 'lunchBack', 'end'];
  const times = {};
  names.forEach((n) => {
    const text = String(raw[n] ?? '').trim();
    if (!text) { times[n] = null; return; }
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
    if (!m || +m[1] > 23 || +m[2] > 59) { errors[n] = 'Must be a time like 08:30.'; times[n] = null; return; }
    times[n] = `${pad(+m[1])}:${m[2]}`;
  });

  if (dayType === 'WORK') {
    if (!!times.lunchOut !== !!times.lunchBack && !errors.lunchOut && !errors.lunchBack) errors.lunchOut = 'Give both lunch times, or neither.';
    const ordered = (name, earlier, later, message) => {
      if (earlier && later && !errors[name] && toMin(earlier) >= toMin(later)) errors[name] = message;
    };
    ordered('end', times.start, times.end, 'End of work must be after the start.');
    ordered('lunchOut', times.start, times.lunchOut, 'Lunch must start after work starts.');
    ordered('lunchBack', times.lunchOut, times.lunchBack, 'Lunch must end after it starts.');
    ordered('lunchBack', times.lunchBack, times.end, 'Lunch must end before work ends.');
  } else {
    names.forEach((n) => { times[n] = null; });
  }

  if (Object.keys(errors).length) return { errors };
  const onsite = dayType === 'WORK' && (raw.onsite === true || ['true', 'on', '1', 'yes'].includes(String(raw.onsite).toLowerCase()));
  return { row: { date, dayType, ...times, onsite, notes: notes || null, ...compute(dayType, times.start, times.lunchOut, times.lunchBack, times.end, minimum) } };
}

const tsRows = () => db.timesheet.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
const tsBetween = (from, to) => tsRows().filter((r) => r.date >= from && r.date <= to);
const tsYear = (y) => tsBetween(`${y}-01-01`, `${y}-12-31`);
const tsMonth = (y, m) => tsBetween(`${y}-${pad(m)}-01`, `${y}-${pad(m)}-31`);

function aggregate(rows) {
  const work = rows.filter((r) => r.dayType === 'WORK');
  const above = rows.reduce((s, r) => s + (r.above || 0), 0);
  const below = rows.reduce((s, r) => s + (r.below || 0), 0);
  return {
    days: rows.length, workDays: work.length, daysOff: rows.length - work.length,
    onsiteDays: work.filter((r) => r.onsite).length,
    total: rows.reduce((s, r) => s + (r.total || 0), 0), above, below, net: above - below,
  };
}

function review(onsiteDays, workDays, target) {
  if (workDays === 0) return { percent: null, target, met: null, needed: 0 };
  const needed = Math.max(Math.ceil((target * workDays) / 100) - onsiteDays, 0);
  return { percent: Math.round((onsiteDays * 100) / workDays), target, met: onsiteDays * 100 >= target * workDays, needed };
}

function grouped(year, unit) {
  const groups = new Map();
  tsYear(year).forEach((r) => {
    const k = unit === 'month' ? r.date.slice(0, 7) + '-01' : weekOf(r.date)[0];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  let balance = 0;
  return [...groups.keys()].sort().map((k) => {
    const a = aggregate(groups.get(k));
    balance += a.net;
    return { start: k, ...a, balance };
  });
}

/* ---------- CSV / JSON export ---------- */

const FORMULA_STARTS = ['=', '+', '-', '@', '\t', '\r'];
const safeCell = (v) => { const s = String(v ?? ''); return FORMULA_STARTS.includes(s[0]) ? "'" + s : s; };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(header, rows) {
  // The BOM lets Excel read the file as UTF-8 instead of guessing a code page.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const inDate = (y, m, f) => (!f.year || +f.year === y) && (!f.month || +f.month === m);
function attemptsIn(f) {
  return db.attempts
    .filter((a) => (!f.quizId || a.quizId === f.quizId) && (() => { const d = new Date(a.startedAt); return inDate(d.getFullYear(), d.getMonth() + 1, f); })())
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}
function timesheetIn(f) { return tsRows().filter((r) => inDate(+r.date.slice(0, 4), +r.date.slice(5, 7), f)); }
function quizzesIn(f) { return db.quizzes.filter((q) => !f.quizId || q.id === f.quizId); }

const resultLabel = (q) => (q.skipped ? 'skipped' : q.timedOut ? 'timed out' : q.correct === true ? 'correct' : q.correct === false ? 'wrong' : 'unanswered');
const envelope = (kind, body) => ({ app: 'all-an', kind, version: 1, exportedAt: new Date().toISOString(), ...body });

const DATASETS = {
  attempts: {
    label: 'Quiz results — one row per attempt', needs: ['quiz', 'date'], formats: ['csv', 'json'],
    rows: attemptsIn,
    csv: (f) => toCsv(['Attempt', 'Quiz', 'Started', 'Finished', 'Questions', 'Answered', 'Correct', 'Percent'],
      attemptsIn(f).map((a) => { const s = attemptStats(a); return [a.id, safeCell(a.quizTitle), a.startedAt, a.finishedAt || '', s.total, s.answered, s.correct, s.percent]; })),
    json: (f) => envelope('attempts', { attempts: attemptsIn(f) }),
  },
  answers: {
    label: 'Quiz results — one row per question answered', needs: ['quiz', 'date'], formats: ['csv', 'json'],
    rows: (f) => attemptsIn(f).flatMap((a) => a.questions.filter((q) => q.answeredAt)),
    csv: (f) => toCsv(['Attempt', 'Quiz', 'Started', '#', 'Type', 'Question', 'Your answer', 'Correct answer', 'Result', 'Seconds'],
      attemptsIn(f).flatMap((a) => a.questions.map((q, i) => q.answeredAt && [
        a.id, safeCell(a.quizTitle), a.startedAt, i + 1, q.kind === 'TYPED' ? 'Typed' : 'Multiple choice',
        safeCell(q.prompt), safeCell(q.given ?? ''), safeCell(correctText(q)), resultLabel(q), q.elapsedMs == null ? '' : (q.elapsedMs / 1000).toFixed(1),
      ]).filter(Boolean))),
    json: (f) => envelope('answers', {
      answers: attemptsIn(f).flatMap((a) => a.questions.map((q, i) => q.answeredAt && {
        attemptId: a.id, quiz: a.quizTitle, startedAt: a.startedAt, position: i + 1, kind: q.kind, prompt: q.prompt,
        given: q.given, correctAnswer: q.accepted, result: resultLabel(q), elapsedMs: q.elapsedMs,
      }).filter(Boolean)),
    }),
  },
  timesheet: {
    label: 'Timesheet — one row per day', needs: ['date'], formats: ['csv', 'json'],
    rows: timesheetIn,
    csv: (f) => toCsv(['Date', 'Day type', 'Start', 'Lunch out', 'Lunch back', 'End', 'Total worked', 'Below minimum', 'Above minimum', 'On site', 'Notes'],
      timesheetIn(f).map((r) => [r.date, DAY_LABEL[r.dayType], r.start || '', r.lunchOut || '', r.lunchBack || '', r.end || '',
        fmtMin(r.total), fmtMin(r.below), fmtMin(r.above), r.onsite ? 'yes' : 'no', safeCell(r.notes || '')])),
    json: (f) => envelope('timesheet', { settings: db.settings, rows: timesheetIn(f) }),
  },
  quizzes: {
    label: 'Quiz definitions — one row per question', needs: ['quiz'], formats: ['csv', 'json'],
    rows: (f) => quizzesIn(f).flatMap((q) => q.questions),
    csv: (f) => toCsv(['Quiz', 'Field', 'Subject', '#', 'Type', 'Question', 'Explanation', 'Seconds', 'Choices / accepted', 'Correct'],
      quizzesIn(f).flatMap((qz) => qz.questions.map((q, i) => [
        safeCell(qz.title), FIELD_NAME[qz.field] || qz.field, safeCell(qz.subject), i + 1, q.kind === 'TYPED' ? 'Typed' : 'Multiple choice',
        safeCell(q.prompt), safeCell(q.explanation || ''), q.time,
        safeCell(q.options.map((o) => o.body).join(' | ')), safeCell(q.options.filter((o) => o.correct).map((o) => o.body).join(' | ')),
      ]))),
    json: (f) => envelope('quizzes', { quizzes: quizzesIn(f) }),
  },
  backup: {
    label: 'Everything — full backup', needs: [], formats: ['json'],
    rows: () => [db],
    csv: () => '',
    json: () => envelope('backup', { data: { quizzes: db.quizzes, attempts: db.attempts, archived: db.archived, timesheet: db.timesheet, settings: db.settings } }),
  },
};

function exportName(set, f, format) {
  const parts = ['all-an', set];
  if (f.quizId && DATASETS[set].needs.includes('quiz')) { const q = findQuiz(f.quizId); parts.push(slug(q ? q.title : 'quiz')); }
  if (f.year && DATASETS[set].needs.includes('date')) parts.push(f.year);
  if (f.month && DATASETS[set].needs.includes('date')) parts.push(pad(+f.month));
  if (set === 'backup') parts.push(today());
  return parts.join('-') + '.' + format;
}

function doExport(set, f, format) {
  const ds = DATASETS[set];
  if (!ds) return;
  const fmt = ds.formats.includes(format) ? format : ds.formats[0];
  const text = fmt === 'csv' ? ds.csv(f) : JSON.stringify(ds.json(f), null, 2);
  download(exportName(set, f, fmt), text, fmt === 'csv' ? 'text/csv;charset=utf-8' : 'application/json');
  toast(`Exported ${plural(ds.rows(f).length, 'row')} as ${fmt.toUpperCase()}.`);
}

/* ---------- import ---------- */

function importPayload(payload, mode) {
  if (!payload || payload.app !== 'all-an') throw new Error('This is not an all-an export file.');
  const wins = mode === 'imported' || mode === 'replace';
  const report = [];

  const mergeById = (list, incoming, label, accept = () => true) => {
    let added = 0, replaced = 0, skipped = 0;
    (incoming || []).forEach((item) => {
      if (!item || typeof item !== 'object' || !item.id || !accept(item)) { skipped++; return; }
      const at = list.findIndex((x) => x.id === item.id);
      if (at < 0) { list.push(item); added++; }
      else if (wins) { list[at] = item; replaced++; }
    });
    report.push(`${label}: ${added} added${replaced ? `, ${replaced} replaced` : ''}${skipped ? `, ${skipped} skipped` : ''}`);
  };
  const mergeRows = (incoming) => {
    let added = 0, replaced = 0, skipped = 0;
    (incoming || []).forEach((raw) => {
      const r = normaliseDay(raw || {});
      if (!r.row) { skipped++; return; }
      const at = db.timesheet.findIndex((x) => x.date === r.row.date);
      if (at < 0) { db.timesheet.push(r.row); added++; }
      else if (wins) { db.timesheet[at] = r.row; replaced++; }
    });
    report.push(`Timesheet days: ${added} added${replaced ? `, ${replaced} replaced` : ''}${skipped ? `, ${skipped} skipped` : ''}`);
  };
  const okQuiz = (q) => Array.isArray(q.questions) && validateQuiz(q).length === 0;
  const okAttempt = (a) => Array.isArray(a.questions) && a.startedAt;

  if (payload.kind === 'backup') {
    const d = normaliseDb(payload.data);
    if (mode === 'replace') { db = { ...db, quizzes: [], attempts: [], archived: [], timesheet: [] }; }
    mergeById(db.quizzes, d.quizzes, 'Quizzes', okQuiz);
    mergeById(db.attempts, d.attempts, 'Results', okAttempt);
    mergeRows(d.timesheet);
    db.archived = [...new Set([...db.archived, ...d.archived])];
    if (wins && payload.data && payload.data.settings) db.settings = { ...db.settings, ...payload.data.settings };
  } else if (payload.kind === 'quizzes') mergeById(db.quizzes, payload.quizzes, 'Quizzes', okQuiz);
  else if (payload.kind === 'attempts') mergeById(db.attempts, payload.attempts, 'Results', okAttempt);
  else if (payload.kind === 'timesheet') mergeRows(payload.rows);
  else throw new Error(`Cannot import a "${payload.kind}" file. Re-export it as JSON from the matching dataset.`);

  save();
  return report;
}

/* ======================================================================================
 * UI state, router and pages
 * ==================================================================================== */

const ui = {
  quizField: '', quizSearch: '',
  results: { quizId: '', year: '', month: '' },
  exp: { set: 'timesheet', quizId: '', year: '', month: '', format: 'csv' },
  feedback: null,         // {attemptId, index}: the verdict being shown after an answer
  draft: null,            // the quiz being edited
  draftKey: null,
  newDay: false,
};
let timer = null;
let afterRender = null;

const app = $('#app');
if (!app) throw new Error('all-an: #app is missing');

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

/* The server renders the nav. Mark the entry for the current hash so it shows where you are. */
function renderNav(active) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('on', link.dataset.nav === active);
  });
}

const TITLES = { quizzes: 'Quizzes', results: 'Results', timesheet: 'Timesheet', data: 'Data' };

function render() {
  clearInterval(timer); timer = null; afterRender = null;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '') || 'quizzes';
  let m;
  let active = 'quizzes', html;

  if (!/^quiz\/.+\/edit$|^quiz\/new$/.test(path)) { ui.draft = null; ui.draftKey = null; }
  if (!/^attempt\//.test(path)) ui.feedback = null;
  if (!/^timesheet\/\d{4}\/\d{1,2}$/.test(path)) ui.newDay = false;

  if (path === 'quizzes') html = pageQuizzes();
  else if (path === 'quiz/new') html = pageEditor(null);
  else if ((m = /^quiz\/([^/]+)\/edit$/.exec(path))) html = pageEditor(m[1]);
  else if ((m = /^take\/([^/]+)$/.exec(path))) {
    const r = startAttempt(m[1]);
    if (r.error) { html = pageMessage('Cannot start this quiz', r.error, '#/quizzes'); }
    else { location.replace('#/attempt/' + r.attempt.id); return; }
  }
  else if ((m = /^attempt\/([^/]+)$/.exec(path))) html = pageRunner(m[1]);
  else if (path === 'results') { active = 'results'; html = pageResults(); }
  else if ((m = /^result\/([^/]+)$/.exec(path))) { active = 'results'; html = pageResult(m[1]); }
  else if (path === 'timesheet') { active = 'timesheet'; html = pageTimesheet(); }
  else if ((m = /^timesheet\/(\d{4})$/.exec(path))) { active = 'timesheet'; html = pageYear(+m[1]); }
  else if ((m = /^timesheet\/(\d{4})\/(\d{1,2})$/.exec(path))) { active = 'timesheet'; html = pageMonth(+m[1], +m[2]); }
  else if ((m = /^dashboard(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(path))) { active = 'timesheet'; html = pageDashboard(m[1] && validDate(m[1]) ? m[1] : today()); }
  else if (path === 'data') { active = 'data'; html = pageData(); }
  else html = pageMessage('Not found', 'There is no such page.', '#/quizzes');

  renderNav(active);
  document.title = (TITLES[active] || 'App') + ' · all-an';
  app.innerHTML = html;
  if (afterRender) afterRender();
  window.scrollTo(0, 0);
}

function pageMessage(title, text, backHref) {
  return `<div class="card"><h1>${esc(title)}</h1><p class="lede">${esc(text)}</p><div class="row" style="margin-top:1rem"><a class="btn primary" href="${backHref}">Back</a></div></div>`;
}

const exportButtons = (set, f = {}, label = 'Export') => {
  const attr = Object.entries(f).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<span class="row">
    <button type="button" class="btn small" data-action="export" data-set="${set}" data-format="csv" ${attr}>${label} CSV</button>
    <button type="button" class="btn small" data-action="export" data-set="${set}" data-format="json" ${attr}>${label} JSON</button>
  </span>`;
};

/* ---------- quizzes ---------- */

function pageQuizzes() {
  const arch = archivedSet();
  const needle = ui.quizSearch.trim().toLowerCase();
  const list = db.quizzes.filter((q) =>
    (!ui.quizField || q.field === ui.quizField) &&
    (!needle || `${q.title} ${q.subject} ${q.description || ''}`.toLowerCase().includes(needle)));
  const usedFields = FIELDS.filter(([slug]) => db.quizzes.some((q) => q.field === slug));

  const cards = list.map((q) => {
    const learned = q.questions.filter((x) => arch.has(x.id)).length;
    const taken = db.attempts.filter((a) => a.quizId === q.id).length;
    return `<article class="card">
      <h3 class="card-title">${esc(q.title)}</h3>
      <p class="meta">${esc(FIELD_NAME[q.field] || q.field)} · ${esc(q.subject)}</p>
      ${q.description ? `<p style="margin-top:.5rem;color:var(--soft)">${esc(q.description)}</p>` : ''}
      <div class="chips">
        <span class="chip">${plural(q.questions.length, 'question')}</span>
        ${learned ? `<span class="chip good">${learned} learned</span>` : ''}
        ${taken ? `<span class="chip">${plural(taken, 'attempt')}</span>` : ''}
      </div>
      <div class="row" style="margin-top:.9rem">
        <a class="btn primary small" href="#/take/${q.id}">Take</a>
        <a class="btn small" href="#/quiz/${q.id}/edit">Edit</a>
        <button type="button" class="btn small" data-action="quiz-results" data-id="${q.id}">Results</button>
        <button type="button" class="btn small" data-action="export" data-set="quizzes" data-format="json" data-quizid="${q.id}" title="Download this quiz as JSON">Export</button>
        <button type="button" class="btn small danger" data-action="delete-quiz" data-id="${q.id}">Delete</button>
      </div>
    </article>`;
  }).join('');

  return `
  <header class="head">
    <div><h1>Quizzes</h1><p class="lede">Timed questions on any subject. Everything is stored in this browser.</p></div>
    <div class="row">
      <a class="btn primary" href="#/quiz/new">+ New quiz</a>
      <label class="btn">Import<input type="file" accept="application/json,.json" data-action-change="import-quiz" hidden></label>
    </div>
  </header>
  <div class="filters">
    <input type="search" id="quiz-search" placeholder="Search quizzes" value="${esc(ui.quizSearch)}" style="max-width:16rem">
    <button type="button" class="pill${ui.quizField === '' ? ' on' : ''}" data-action="field" data-value="">All</button>
    ${usedFields.map(([slug, name]) => `<button type="button" class="pill${ui.quizField === slug ? ' on' : ''}" data-action="field" data-value="${slug}">${esc(name)}</button>`).join('')}
  </div>
  ${cards ? `<div class="tiles">${cards}</div>` : `<div class="empty">No quizzes here yet. <a href="#/quiz/new">Write one</a> or import a JSON file.</div>`}`;
}

function pageEditor(id) {
  const key = id || 'new';
  if (ui.draftKey !== key) {
    if (id) {
      const q = findQuiz(id);
      if (!q) return pageMessage('Not found', 'There is no such quiz.', '#/quizzes');
      ui.draft = clone(q);
    } else {
      ui.draft = { id: uid(), title: '', description: '', field: 'general-knowledge', subject: '', defaultTime: 30, shuffle: false, createdAt: new Date().toISOString(), questions: [blankQuestion(30)] };
    }
    ui.draftKey = key;
    ui.draftErrors = [];
  }
  const d = ui.draft;
  const arch = archivedSet();

  const questions = d.questions.map((q, i) => {
    const typed = q.kind === 'TYPED';
    const opts = q.options.map((o, j) => `
      <div class="opt">
        ${typed ? '' : `<input type="radio" name="correct-${i}" ${o.correct ? 'checked' : ''} data-correct="${i}.${j}" aria-label="Correct choice">`}
        <input type="text" value="${esc(o.body)}" data-bind="questions.${i}.options.${j}.body" placeholder="${typed ? 'An accepted answer' : 'Choice ' + (j + 1)}" maxlength="300">
        <button type="button" class="btn small danger" data-action="del-option" data-q="${i}" data-o="${j}" aria-label="Remove">×</button>
      </div>`).join('');
    return `
    <div class="card q">
      <div class="row" style="justify-content:space-between">
        <h3>Question ${i + 1}</h3>
        <span class="row">
          <button type="button" class="btn small" data-action="move-q" data-q="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="btn small" data-action="move-q" data-q="${i}" data-dir="1" ${i === d.questions.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="btn small danger" data-action="del-q" data-q="${i}">Remove</button>
        </span>
      </div>
      <div class="grid g2" style="margin-top:.75rem">
        <label class="f"><span class="lab">Type</span>
          <select data-kind="${i}">
            <option value="MULTIPLE_CHOICE" ${typed ? '' : 'selected'}>Multiple choice</option>
            <option value="TYPED" ${typed ? 'selected' : ''}>Typed answer</option>
          </select></label>
        <label class="f"><span class="lab">Seconds</span>
          <input type="number" min="5" max="600" value="${esc(q.time)}" data-bind="questions.${i}.time"></label>
      </div>
      <label class="f" style="margin-top:.75rem"><span class="lab">Question</span>
        <textarea rows="2" data-bind="questions.${i}.prompt">${esc(q.prompt)}</textarea></label>
      <div style="margin-top:.75rem">
        <span class="lab">${typed ? 'Accepted answers (case, spacing and a final full stop are ignored)' : 'Choices — select the correct one'}</span>
        ${opts}
        <button type="button" class="btn small" style="margin-top:.5rem" data-action="add-option" data-q="${i}">+ ${typed ? 'Accepted answer' : 'Choice'}</button>
      </div>
      <label class="f" style="margin-top:.75rem"><span class="lab">Explanation (shown after answering)</span>
        <input type="text" value="${esc(q.explanation || '')}" data-bind="questions.${i}.explanation"></label>
      ${arch.has(q.id) ? `<p class="hint" style="margin-top:.6rem">Marked as learned — left out of attempts. <button type="button" class="btn small" data-action="unlearn" data-id="${q.id}">Restore</button></p>` : ''}
    </div>`;
  }).join('');

  return `
  <a class="back" href="#/quizzes">← Quizzes</a>
  <header class="head"><div><h1>${id ? 'Edit quiz' : 'New quiz'}</h1></div></header>
  ${ui.draftErrors.length ? `<div class="notice warn" role="alert" style="margin-bottom:1rem"><b>Fix these first:</b><ul style="margin:.4rem 0 0 1.1rem;padding:0">${ui.draftErrors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
  <div class="card">
    <div class="grid g2">
      <label class="f"><span class="lab">Title</span><input type="text" maxlength="120" value="${esc(d.title)}" data-bind="title"></label>
      <label class="f"><span class="lab">Subject</span><input type="text" maxlength="64" value="${esc(d.subject)}" placeholder="e.g. English grammar" data-bind="subject"></label>
      <label class="f"><span class="lab">Study field</span>
        <select data-bind="field">${FIELDS.map(([s, n]) => `<option value="${s}" ${d.field === s ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="f"><span class="lab">Default seconds per question</span><input type="number" min="5" max="600" value="${esc(d.defaultTime)}" data-bind="defaultTime"></label>
    </div>
    <label class="f" style="margin-top:.75rem"><span class="lab">Description</span><textarea rows="2" data-bind="description">${esc(d.description || '')}</textarea></label>
    <label class="row" style="margin-top:.75rem"><input type="checkbox" ${d.shuffle ? 'checked' : ''} data-bind="shuffle"> Shuffle the question order on each attempt</label>
  </div>
  <div class="stack" style="margin-top:1rem">${questions}</div>
  <div class="row" style="margin-top:1rem">
    <button type="button" class="btn" data-action="add-q">+ Add question</button>
  </div>
  <div class="row" style="margin-top:1.5rem">
    <button type="button" class="btn primary" data-action="save-quiz">Save quiz</button>
    <a class="btn" href="#/quizzes">Cancel</a>
  </div>`;
}

function pageRunner(id) {
  const a = findAttempt(id);
  if (!a) return pageMessage('Not found', 'There is no such attempt.', '#/results');

  // The verdict for the question just answered.
  if (ui.feedback && ui.feedback.attemptId === id) {
    const q = a.questions[ui.feedback.index];
    const last = nextIndex(a) < 0;
    const cls = q.correct ? 'right' : 'wrong';
    return `<div class="runner card">
      <p class="meta">Question ${ui.feedback.index + 1} of ${a.questions.length}</p>
      <p class="verdict ${cls}" style="margin:.5rem 0">${q.correct ? 'Correct' : q.timedOut ? 'Out of time' : 'Not quite'}</p>
      <p class="prompt" style="font-size:1.1rem">${esc(q.prompt)}</p>
      <dl class="d">
        <dt>You said</dt><dd>${q.given ? esc(q.given) : '<em>nothing</em>'}</dd>
        <dt>Answer</dt><dd>${esc(correctText(q))}</dd>
        <dt>Time</dt><dd>${seconds(q.elapsedMs)}</dd>
      </dl>
      ${q.explanation ? `<p style="margin-top:.9rem;color:var(--soft)">${esc(q.explanation)}</p>` : ''}
      <div class="row" style="margin-top:1.25rem">
        <button type="button" class="btn primary" data-action="next" data-id="${id}" id="next">${last ? 'See results' : 'Next question'}</button>
        <button type="button" class="btn" data-action="learn" data-id="${q.qid}">Mark as learned</button>
      </div>
    </div>`;
  }

  const i = nextIndex(a);
  if (i < 0) { location.replace('#/result/' + id); return ''; }
  const q = a.questions[i];
  if (!q.servedAt) { q.servedAt = Date.now(); save(); }   // first time shown starts the clock; a reload resumes it
  const limit = q.time * 1000;
  const deadline = q.servedAt + limit;

  afterRender = () => {
    const clock = $('#clock'), bar = $('#bar-fill'), box = $('#typed');
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const s = Math.ceil(left / 1000);
      clock.textContent = s + 's';
      clock.classList.toggle('urgent', s <= 10);
      bar.style.width = Math.min(100, (left / limit) * 100) + '%';
      if (left <= 0) {
        clearInterval(timer); timer = null;
        submitAnswer(a, box ? box.value : '', true);
        render();
      }
    };
    tick();
    if (Date.now() < deadline) timer = setInterval(tick, 100);
    const first = box || $('.choice');
    if (first) first.focus();
  };

  return `<div class="runner">
    <div class="row" style="justify-content:space-between">
      <span class="meta">${esc(a.quizTitle)} · question ${i + 1} of ${a.questions.length}</span>
      <span class="clock" id="clock">${q.time}s</span>
    </div>
    <div class="bar"><i id="bar-fill"></i></div>
    <p class="prompt">${esc(q.prompt)}</p>
    ${q.kind === 'MULTIPLE_CHOICE'
      ? q.options.map((o, n) => `<button type="button" class="choice" data-action="pick" data-id="${id}" data-i="${n}">${esc(o.body)}</button>`).join('')
      : `<form data-form="typed" data-id="${id}">
           <input id="typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your answer" aria-label="Your answer">
           <div class="row" style="margin-top:.75rem"><button class="btn primary" type="submit">Submit</button></div>
         </form>`}
    <div class="row" style="margin-top:2rem"><button type="button" class="btn small danger" data-action="stop" data-id="${id}">Stop and score what I have</button></div>
  </div>`;
}

/* ---------- results ---------- */

function yearsOf(isoStrings) { return [...new Set(isoStrings.map((s) => +s.slice(0, 4)))].sort((a, b) => b - a); }
function localYears(dates) { return [...new Set(dates.map((s) => new Date(s).getFullYear()))].sort((a, b) => b - a); }

function filterSelects(f, key, { quiz = true, years }) {
  return `<div class="filters">
    ${quiz ? `<select data-filter="${key}.quizId" style="max-width:15rem" aria-label="Quiz">
      <option value="">All quizzes</option>
      ${db.quizzes.map((q) => `<option value="${q.id}" ${f.quizId === q.id ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}
      ${[...new Map(db.attempts.filter((a) => !findQuiz(a.quizId)).map((a) => [a.quizId, a.quizTitle]))].map(([qid, title]) => `<option value="${qid}" ${f.quizId === qid ? 'selected' : ''}>${esc(title)} (deleted)</option>`).join('')}
    </select>` : ''}
    <select data-filter="${key}.year" style="max-width:8rem" aria-label="Year">
      <option value="">All years</option>${years.map((y) => `<option value="${y}" ${String(f.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
    <select data-filter="${key}.month" style="max-width:10rem" aria-label="Month">
      <option value="">All months</option>${MONTHS.map((n, i) => `<option value="${i + 1}" ${String(f.month) === String(i + 1) ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
  </div>`;
}

function pageResults() {
  const f = ui.results;
  const list = attemptsIn(f).reverse();
  const done = list.filter((a) => a.finishedAt);
  const avg = done.length ? Math.round(done.reduce((s, a) => s + attemptStats(a).percent, 0) / done.length) : null;

  const rows = list.map((a) => {
    const s = attemptStats(a);
    return `<a class="card line" href="${a.finishedAt ? '#/result/' : '#/attempt/'}${a.id}">
      <span class="card-title">${esc(a.quizTitle)}</span>
      <span class="figs"><span>${stamp(a.startedAt)}</span><span>${s.correct} / ${s.total} (${s.percent}%)</span>
      ${a.finishedAt ? '' : '<span class="chip">in progress — resume</span>'}</span>
    </a>`;
  }).join('');

  return `
  <header class="head">
    <div><h1>Results</h1><p class="lede">Every attempt you have taken in this browser.</p></div>
    <div class="row">${exportButtons('attempts', { quizid: f.quizId, year: f.year, month: f.month }, 'Attempts')}
      <button type="button" class="btn small" data-action="export" data-set="answers" data-format="csv" data-quizid="${esc(f.quizId)}" data-year="${esc(f.year)}" data-month="${esc(f.month)}">Answers CSV</button>
    </div>
  </header>
  ${filterSelects(f, 'results', { years: localYears(db.attempts.map((a) => a.startedAt)) })}
  <div class="grid g4" style="margin-bottom:1rem">
    <div class="stat"><b>${list.length}</b><span>attempts</span></div>
    <div class="stat"><b>${done.length}</b><span>finished</span></div>
    <div class="stat"><b>${avg == null ? '—' : avg + '%'}</b><span>average score</span></div>
  </div>
  ${rows || '<div class="empty">No results match. <a href="#/quizzes">Take a quiz</a>.</div>'}`;
}

function pageResult(id) {
  const a = findAttempt(id);
  if (!a) return pageMessage('Not found', 'There is no such result.', '#/results');
  const s = attemptStats(a);
  const items = a.questions.map((q, i) => {
    const cls = q.correct === true ? 'right' : q.correct === false ? 'wrong' : '';
    const said = q.skipped ? '<em>skipped</em>' : q.timedOut && !q.given ? '<em>ran out of time</em>' : q.given ? esc(q.given) : q.answeredAt ? '<em>nothing</em>' : '<em>not answered</em>';
    return `<article class="card ans ${cls}">
      <p class="card-title">${i + 1}. ${esc(q.prompt)}</p>
      <dl class="d"><dt>You said</dt><dd>${said}</dd><dt>Answer</dt><dd>${esc(correctText(q))}</dd><dt>Time</dt><dd>${seconds(q.elapsedMs)}</dd></dl>
      ${q.explanation ? `<p class="hint" style="margin-top:.5rem">${esc(q.explanation)}</p>` : ''}
    </article>`;
  }).join('');

  return `
  <a class="back" href="#/results">← All results</a>
  <header class="head">
    <div><h1>${esc(a.quizTitle)}</h1><p class="lede">${stamp(a.startedAt)} · ${s.answered} of ${s.total} answered${a.finishedAt ? '' : ' · still in progress'}</p></div>
    <button type="button" class="btn small danger" data-action="delete-attempt" data-id="${a.id}">Delete this result</button>
  </header>
  <section class="card score"><p class="big">${s.correct} / ${s.total}</p><p class="meta">${s.percent}%</p></section>
  <div class="stack" style="margin-top:1rem">${items}</div>
  <div class="row" style="margin-top:1.25rem">
    ${findQuiz(a.quizId) ? `<a class="btn primary" href="#/take/${a.quizId}">Take it again</a>` : ''}
    <a class="btn" href="#/quizzes">Browse more</a>
  </div>`;
}

/* ---------- timesheet ---------- */

function reviewChip(r) {
  if (r.met === null) return '<span class="chip">No worked days</span>';
  if (r.met) return `<span class="chip good">On site ${r.percent}% · target ${r.target}% met</span>`;
  return `<span class="chip bad">On site ${r.percent}% · target ${r.target}% — ${plural(r.needed, 'more on-site day')} needed</span>`;
}
const statBlock = (a) => `<div class="grid g4">
  <div class="stat"><b>${fmtMin(a.total)}</b><span>worked</span></div>
  <div class="stat"><b>${a.workDays}</b><span>days</span></div>
  <div class="stat"><b>${a.onsiteDays}</b><span>on site</span></div>
  <div class="stat"><b class="${signClass(a.net)}">${signed(a.net)}</b><span>vs minimum</span></div>
</div>`;

function pageTimesheet() {
  const years = yearsOf(db.timesheet.map((r) => r.date));
  const now = new Date();
  const thisYear = now.getFullYear();
  const all = new Set([...years, thisYear]);
  const tiles = [...all].sort((a, b) => b - a).map((y) => {
    const a = aggregate(tsYear(y));
    return `<a class="card" href="#/timesheet/${y}"><h3 class="card-title">${y}</h3>
      <p class="meta">${a.days ? `${plural(a.days, 'day')} · ${fmtMin(a.total)} worked` : 'Nothing logged yet'}</p></a>`;
  }).join('');

  return `
  <header class="head">
    <div><h1>Timesheet</h1><p class="lede">One row per day. Daily minimum ${fmtMin(minimumMinutes())} · on-site target ${onsiteTarget()}% of worked days.</p></div>
    <div class="row">
      <a class="btn primary" href="#/timesheet/${thisYear}/${now.getMonth() + 1}">This month</a>
      <a class="btn" href="#/dashboard">Dashboard</a>
      ${exportButtons('timesheet', {}, 'All')}
    </div>
  </header>
  <div class="tiles">${tiles}</div>
  <form class="card" data-form="settings" style="margin-top:1.5rem">
    <h2>Rules</h2>
    <div class="grid g2" style="margin-top:.75rem">
      <label class="f"><span class="lab">Daily minimum (hours)</span><input type="number" step="0.25" min="0.25" max="24" name="minimumHours" value="${esc(db.settings.minimumHours)}"></label>
      <label class="f"><span class="lab">On-site target (% of worked days)</span><input type="number" min="0" max="100" name="onsitePercent" value="${esc(db.settings.onsitePercent)}"></label>
    </div>
    <p class="hint" style="margin-top:.6rem">A day keeps the balance it was saved with when the minimum changes. Use Recalculate to bring every saved day up to date.</p>
    <div class="row" style="margin-top:.75rem">
      <button type="submit" class="btn primary">Save rules</button>
      <button type="button" class="btn" data-action="recalc">Recalculate all days</button>
    </div>
  </form>`;
}

function pageYear(y) {
  if (y < 2000 || y > 2100) return pageMessage('Not found', 'Pick a year between 2000 and 2100.', '#/timesheet');
  const tiles = MONTHS.map((name, i) => {
    const a = aggregate(tsMonth(y, i + 1));
    return `<a class="card" href="#/timesheet/${y}/${i + 1}"><h3 class="card-title">${name}</h3>
      <p class="meta">${a.days ? `${plural(a.days, 'day')} · ${fmtMin(a.total)} worked · <span class="${signClass(a.net)}">${signed(a.net)}</span>` : 'No days'}</p></a>`;
  }).join('');
  return `
  <a class="back" href="#/timesheet">← Timesheet</a>
  <header class="head">
    <div><h1>${y}</h1></div>
    <div class="row">
      <a class="btn" href="#/timesheet/${y - 1}">← ${y - 1}</a><a class="btn" href="#/timesheet/${y + 1}">${y + 1} →</a>
      <a class="btn" href="#/dashboard/${y === new Date().getFullYear() ? today() : y + '-12-31'}">Dashboard</a>
      ${exportButtons('timesheet', { year: y }, 'Year')}
    </div>
  </header>
  <div class="tiles">${tiles}</div>`;
}

function dayForm(row, y, m) {
  const isNew = row.isNew === true || (row.orig === undefined && !row.date);
  const orig = row.orig !== undefined ? row.orig : row.date;
  const first = `${y}-${pad(m)}-01`, last = monthOf(first)[1];
  const e = row.errors || {};
  const fe = (k) => (e[k] ? `<span class="err">${esc(e[k])}</span>` : '');
  const off = row.dayType && row.dayType !== 'WORK';
  const times = [['start', 'Start'], ['lunchOut', 'Lunch out'], ['lunchBack', 'Lunch back'], ['end', 'End']];

  return `<form class="card" data-form="day" data-orig="${isNew ? '' : esc(orig)}" data-y="${y}" data-m="${m}">
    <div class="row" style="justify-content:space-between"><h3>${isNew ? 'New day' : esc(validDate(orig) ? longDate(orig) : orig)}</h3>
      ${!isNew && row.dayType === 'WORK' && row.total ? `<span class="chips" style="margin:0"><span class="chip">Worked ${fmtMin(row.total)}</span>${row.above ? `<span class="chip above">+${fmtMin(row.above)}</span>` : ''}${row.below ? `<span class="chip below">-${fmtMin(row.below)}</span>` : ''}</span>` : ''}
    </div>
    <div class="grid g2" style="margin-top:.75rem">
      <label class="f"><span class="lab">Date</span><input type="date" name="date" value="${esc(row.date || '')}" min="${first}" max="${last}" required>${fe('date')}</label>
      <label class="f"><span class="lab">Type</span><select name="dayType">${DAY_TYPES.map((t) => `<option value="${t}" ${row.dayType === t || (!row.dayType && t === 'WORK') ? 'selected' : ''}>${DAY_LABEL[t]}</option>`).join('')}</select>${fe('dayType')}</label>
    </div>
    <div class="times${off ? ' off' : ''}" style="margin-top:.75rem">
      ${times.map(([k, label]) => `<label class="f"><span class="lab">${label}</span><input type="time" name="${k}" value="${esc(row[k] || '')}">${fe(k)}</label>`).join('')}
      <label class="row" style="align-self:end;min-height:2.5rem"><input type="checkbox" name="onsite" ${row.onsite ? 'checked' : ''}> On site</label>
    </div>
    <label class="f" style="margin-top:.75rem"><span class="lab">Notes</span><textarea name="notes" rows="2" maxlength="500">${esc(row.notes || '')}</textarea>${fe('notes')}</label>
    <div class="row" style="margin-top:.9rem">
      <button type="submit" class="btn primary">${isNew ? 'Add' : 'Save'}</button>
      ${isNew ? '<button type="button" class="btn" data-action="cancel-day">Cancel</button>'
              : `<button type="button" class="btn danger" data-action="delete-day" data-date="${esc(orig)}">Delete</button>`}
    </div>
  </form>`;
}

function pageMonth(y, m) {
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return pageMessage('Not found', 'No such month.', '#/timesheet');
  const rows = tsMonth(y, m);
  const a = aggregate(rows);
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const draft = ui.newDay
    ? dayForm(typeof ui.newDay === 'object' ? ui.newDay : { date: (y === new Date().getFullYear() && m === new Date().getMonth() + 1) ? today() : `${y}-${pad(m)}-01`, dayType: 'WORK', isNew: true }, y, m)
    : '';
  const r = review(a.onsiteDays, a.workDays, onsiteTarget());

  return `
  <a class="back" href="#/timesheet/${y}">← ${y}</a>
  <header class="head">
    <div><h1>${MONTHS[m - 1]} ${y}</h1></div>
    <div class="row">
      <a class="btn" href="#/timesheet/${prev[0]}/${prev[1]}" aria-label="Previous month">←</a>
      <a class="btn" href="#/timesheet/${next[0]}/${next[1]}" aria-label="Next month">→</a>
      <a class="btn" href="#/dashboard/${y}-${pad(m)}-01">Dashboard</a>
    </div>
  </header>
  <div class="row" style="margin-bottom:1rem">
    <button type="button" class="btn primary" data-action="add-day">+ Add day</button>
    ${rows.length ? exportButtons('timesheet', { year: y, month: m }, 'Month') : ''}
  </div>
  ${rows.length ? `<div class="card" style="margin-bottom:1rem">${statBlock(a)}<div class="chips">${reviewChip(r)}${a.daysOff ? `<span class="chip">${plural(a.daysOff, 'day')} off</span>` : ''}</div></div>` : ''}
  ${draft}
  <div class="stack" style="margin-top:${draft ? '1rem' : '0'}">
    ${rows.length ? rows.map((row) => dayForm(row, y, m)).join('') : (draft ? '' : '<div class="empty">Nothing logged this month. Add a day to start.</div>')}
  </div>`;
}

function pageDashboard(chosen) {
  const [ws, we] = weekOf(chosen);
  const [ms, me] = monthOf(chosen);
  const d = parseDate(chosen);
  const sixStart = isoDate(new Date(d.getFullYear(), d.getMonth() - 5, 1));
  const week = aggregate(tsBetween(ws, we));
  const month = aggregate(tsBetween(ms, me));
  const six = aggregate(tsBetween(sixStart, me));
  const y = d.getFullYear();
  const target = onsiteTarget();

  const block = (title, a, nav = '') => `<section class="card"><div class="row" style="justify-content:space-between"><h2>${title}</h2>${nav}</div>
    <div style="margin-top:.75rem">${statBlock(a)}</div><div class="chips">${reviewChip(review(a.onsiteDays, a.workDays, target))}</div></section>`;
  const line = (href, title, a) => `<a class="card line" href="${href}"><span class="card-title">${title}</span>
    <span class="figs"><span>${fmtMin(a.total)} worked</span><span>${a.workDays} days</span><span>${a.onsiteDays} on site</span>
    <span class="${signClass(a.net)}">${signed(a.net)}</span><span class="balance">balance ${signed(a.balance)}</span></span>
    ${a.workDays ? `<span class="chips" style="margin:0">${reviewChip(review(a.onsiteDays, a.workDays, target))}</span>` : ''}</a>`;

  const months = grouped(y, 'month');
  const weeks = grouped(y, 'week');

  return `
  <a class="back" href="#/timesheet">← Timesheet</a>
  <header class="head"><div><h1>Dashboard</h1><p class="lede">Daily minimum ${fmtMin(minimumMinutes())} · on-site target ${target}% of worked days.</p></div></header>
  <form class="card row" data-form="pick-date" style="margin-bottom:1rem;align-items:flex-end">
    <label class="f" style="flex:1;min-width:12rem"><span class="lab">Show the week and month of</span><input type="date" name="date" value="${chosen}" required></label>
    <button class="btn primary" type="submit">Show</button>
  </form>
  <div class="stack">
    ${block(`Week · ${shortDate(ws)} – ${shortDate(we)}`, week, `<span class="row"><a class="btn small" href="#/dashboard/${addDays(ws, -7)}" aria-label="Previous week">←</a><a class="btn small" href="#/dashboard/${addDays(ws, 7)}" aria-label="Next week">→</a></span>`)}
    ${block(`Month · ${MONTHS[d.getMonth()]} ${y}`, month)}
    ${block(`Last 6 months · ${shortDate(sixStart)} – ${shortDate(me)}`, six)}
  </div>
  <h2 style="margin:1.75rem 0 .75rem">${y} by month</h2>
  <div class="stack">${months.length ? months.map((a) => line(`#/timesheet/${y}/${+a.start.slice(5, 7)}`, MONTHS[+a.start.slice(5, 7) - 1], a)).join('') : `<div class="empty">Nothing logged in ${y}.</div>`}</div>
  <h2 style="margin:1.75rem 0 .75rem">${y} by week</h2>
  <div class="stack">${weeks.length ? weeks.map((a) => line(`#/dashboard/${a.start}`, `Week of ${shortDate(a.start)}`, a)).join('') : `<div class="empty">Nothing logged in ${y}.</div>`}</div>`;
}

/* ---------- data (export / import) ---------- */

function pageData() {
  const e = ui.exp;
  const ds = DATASETS[e.set];
  if (!ds.formats.includes(e.format)) e.format = ds.formats[0];
  const needs = (k) => ds.needs.includes(k);
  const years = needs('date')
    ? (e.set === 'timesheet' ? yearsOf(db.timesheet.map((r) => r.date)) : localYears(db.attempts.map((a) => a.startedAt)))
    : [];
  const count = ds.rows(e).length;
  const bytes = (() => { try { return (localStorage.getItem(KEY) || '').length; } catch (x) { return 0; } })();

  return `
  <header class="head"><div><h1>Data</h1><p class="lede">Your data lives only in this browser. Export it to back it up, move it, or open it in a spreadsheet.</p></div></header>
  ${storageOk ? '' : '<div class="notice warn" style="margin-bottom:1rem"><b>This browser is not saving.</b> Storage is blocked or full, so anything you add is lost when the tab closes. Export now.</div>'}

  <section class="card">
    <h2>Export</h2>
    <div class="grid g2" style="margin-top:.75rem">
      <label class="f"><span class="lab">What</span>
        <select data-exp="set">${Object.entries(DATASETS).map(([k, v]) => `<option value="${k}" ${e.set === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="f"><span class="lab">Format</span>
        <select data-exp="format">${ds.formats.map((f) => `<option value="${f}" ${e.format === f ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}</select></label>
      ${needs('quiz') ? `<label class="f"><span class="lab">Quiz</span>
        <select data-exp="quizId"><option value="">All quizzes</option>${db.quizzes.map((q) => `<option value="${q.id}" ${e.quizId === q.id ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}</select></label>` : ''}
      ${needs('date') ? `<label class="f"><span class="lab">Year</span>
        <select data-exp="year"><option value="">All years</option>${years.map((y) => `<option value="${y}" ${String(e.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label class="f"><span class="lab">Month</span>
        <select data-exp="month"><option value="">All months</option>${MONTHS.map((n, i) => `<option value="${i + 1}" ${String(e.month) === String(i + 1) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
    </div>
    <p class="hint" style="margin-top:.75rem">${plural(count, 'row')} will be exported as <b>${esc(exportName(e.set, e, e.format))}</b>.</p>
    <div class="row" style="margin-top:.75rem"><button type="button" class="btn primary" data-action="export-form" ${count || e.set === 'backup' ? '' : 'disabled'}>Download</button></div>
  </section>

  <section class="card" style="margin-top:1rem">
    <h2>Import</h2>
    <p class="hint" style="margin-top:.4rem">Accepts the JSON files exported here: a full backup, quizzes, quiz results or timesheet days.</p>
    <div class="grid g2" style="margin-top:.75rem">
      <label class="f"><span class="lab">If something already exists</span>
        <select id="import-mode">
          <option value="keep">Keep mine, add what is missing</option>
          <option value="imported">Use the imported version</option>
          <option value="replace">Replace everything (backup files only)</option>
        </select></label>
      <label class="f"><span class="lab">JSON file</span><input type="file" accept="application/json,.json" data-action-change="import-file"></label>
    </div>
  </section>

  <section class="card" style="margin-top:1rem">
    <h2>Storage</h2>
    <p class="hint" style="margin-top:.4rem">${plural(db.quizzes.length, 'quiz', 'quizzes')}, ${plural(db.attempts.length, 'attempt')}, ${plural(db.timesheet.length, 'timesheet day')} · about ${(bytes / 1024).toFixed(1)} KB of the browser's roughly 5 MB.</p>
    <div class="row" style="margin-top:.75rem"><button type="button" class="btn danger" data-action="wipe">Erase everything in this browser</button></div>
  </section>`;
}

/* ======================================================================================
 * Events (delegated, so re-rendering never needs rebinding)
 * ==================================================================================== */

function setPath(obj, path, value) {
  const p = path.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = value;
}

function filterFor(el) {
  return { quizId: el.dataset.quizid || '', year: el.dataset.year || '', month: el.dataset.month || '' };
}

function readImport(file, apply) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => toast('Could not read that file.', true);
  reader.onload = () => {
    try { apply(JSON.parse(String(reader.result))); }
    catch (err) { toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, true); }
  };
  reader.readAsText(file);
}

const actions = {
  field: (el) => { ui.quizField = el.dataset.value; render(); },
  export: (el) => doExport(el.dataset.set, filterFor(el), el.dataset.format),
  'export-form': () => doExport(ui.exp.set, ui.exp, ui.exp.format),
  'quiz-results': (el) => { ui.results = { quizId: el.dataset.id, year: '', month: '' }; go('#/results'); },
  'delete-quiz': (el) => {
    const q = findQuiz(el.dataset.id);
    if (q && confirm(`Delete "${q.title}"? Results you already have for it are kept.`)) {
      db.quizzes = db.quizzes.filter((x) => x.id !== q.id);
      db.archived = db.archived.filter((id) => !q.questions.some((x) => x.id === id));
      save(); render();
    }
  },
  'delete-attempt': (el) => {
    if (confirm('Delete this result?')) { db.attempts = db.attempts.filter((a) => a.id !== el.dataset.id); save(); go('#/results'); }
  },

  // editor
  'add-q': () => { ui.draft.questions.push(blankQuestion(ui.draft.defaultTime)); render(); },
  'del-q': (el) => { ui.draft.questions.splice(+el.dataset.q, 1); render(); },
  'move-q': (el) => {
    const i = +el.dataset.q, j = i + +el.dataset.dir, qs = ui.draft.questions;
    if (j >= 0 && j < qs.length) { [qs[i], qs[j]] = [qs[j], qs[i]]; render(); }
  },
  'add-option': (el) => {
    const q = ui.draft.questions[+el.dataset.q];
    q.options.push({ body: '', correct: q.kind === 'TYPED' });
    render();
  },
  'del-option': (el) => {
    const q = ui.draft.questions[+el.dataset.q];
    q.options.splice(+el.dataset.o, 1);
    if (q.kind === 'MULTIPLE_CHOICE' && q.options.length && !q.options.some((o) => o.correct)) q.options[0].correct = true;
    render();
  },
  unlearn: (el) => { db.archived = db.archived.filter((id) => id !== el.dataset.id); save(); render(); },
  'save-quiz': () => {
    const d = ui.draft;
    d.title = d.title.trim(); d.subject = d.subject.trim();
    d.questions.forEach((q) => {
      q.prompt = q.prompt.trim();
      q.options = q.options.filter((o) => o.body.trim()).map((o) => ({ body: o.body.trim(), correct: q.kind === 'TYPED' ? true : !!o.correct }));
    });
    // A blank choice was dropped above; re-check the correct one survived before validating.
    const errors = validateQuiz(d);
    if (errors.length) { ui.draftErrors = errors; render(); window.scrollTo(0, 0); return; }
    const at = db.quizzes.findIndex((q) => q.id === d.id);
    if (at < 0) db.quizzes.push(d); else db.quizzes[at] = d;
    save(); toast('Quiz saved.'); go('#/quizzes');
  },

  // runner
  pick: (el) => {
    const a = findAttempt(el.dataset.id);
    const q = a.questions[nextIndex(a)];
    submitAnswer(a, q.options[+el.dataset.i].body, false);
    render();
  },
  next: (el) => { ui.feedback = null; if (nextIndex(findAttempt(el.dataset.id)) < 0) go('#/result/' + el.dataset.id); else render(); },
  learn: (el) => {
    if (!db.archived.includes(el.dataset.id)) db.archived.push(el.dataset.id);
    save(); el.disabled = true; el.textContent = 'Marked as learned ✓';
  },
  stop: (el) => {
    if (confirm('Stop here? Unanswered questions score as wrong.')) { stopAttempt(findAttempt(el.dataset.id)); ui.feedback = null; go('#/result/' + el.dataset.id); }
  },

  // timesheet
  'add-day': () => { ui.newDay = true; render(); },
  'cancel-day': () => { ui.newDay = false; render(); },
  'delete-day': (el) => {
    if (confirm(`Delete ${longDate(el.dataset.date)}?`)) { db.timesheet = db.timesheet.filter((r) => r.date !== el.dataset.date); save(); render(); }
  },
  recalc: () => {
    const min = minimumMinutes();
    db.timesheet = db.timesheet.map((r) => ({ ...r, ...compute(r.dayType, r.start, r.lunchOut, r.lunchBack, r.end, min) }));
    save(); toast(`Recalculated ${plural(db.timesheet.length, 'day')} against ${fmtMin(min)}.`);
  },

  wipe: () => {
    if (confirm('Erase every quiz, result and timesheet day in this browser? Export first if you want to keep them.') && confirm('This cannot be undone. Erase everything?')) {
      db = emptyDb(); db.quizzes = seedQuizzes(); db.seeded = true; save(); toast('Everything erased.'); render();
    }
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { ev.preventDefault(); fn(el); }
});

// Typing in the quiz editor updates the draft without re-rendering, so focus is never lost.
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'quiz-search') {
    ui.quizSearch = el.value;
    const pos = el.selectionStart;
    render();
    const again = $('#quiz-search'); again.focus(); again.setSelectionRange(pos, pos);
    return;
  }
  if (el.dataset.bind && ui.draft) {
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    setPath(ui.draft, el.dataset.bind, v);
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;

  if (el.dataset.correct && ui.draft) {
    const [qi, oi] = el.dataset.correct.split('.').map(Number);
    ui.draft.questions[qi].options.forEach((o, j) => { o.correct = j === oi; });
    return;
  }
  if (el.dataset.kind !== undefined && ui.draft) {
    const q = ui.draft.questions[+el.dataset.kind];
    q.kind = el.value;
    if (q.kind === 'TYPED') {
      const answers = q.options.filter((o) => o.correct);
      q.options = (answers.length ? answers : [{ body: '' }]).map((o) => ({ body: o.body, correct: true }));
    } else {
      q.options = q.options.length >= 2 ? q.options : q.options.concat([{ body: '', correct: false }]);
      q.options.forEach((o, j) => { o.correct = j === 0; });
    }
    render();
    return;
  }
  if (el.dataset.filter) {
    const [key, field] = el.dataset.filter.split('.');
    ui[key][field] = el.value;
    render();
    return;
  }
  if (el.dataset.exp) {
    ui.exp[el.dataset.exp] = el.value;
    if (el.dataset.exp === 'set') { ui.exp.quizId = ''; ui.exp.year = ''; ui.exp.month = ''; }
    render();
    return;
  }
  if (el.name === 'dayType' && el.closest('[data-form="day"]')) {
    el.closest('form').querySelector('.times').classList.toggle('off', el.value !== 'WORK');
    return;
  }
  if (el.dataset.actionChange === 'import-file') {
    const mode = $('#import-mode').value;
    readImport(el.files[0], (payload) => {
      if (mode === 'replace' && payload.kind !== 'backup') throw new Error('"Replace everything" only works with a full backup file.');
      if (mode === 'replace' && !confirm('Replace everything in this browser with the contents of this file?')) return;
      const report = importPayload(payload, mode);
      toast('Imported. ' + report.join(' · '));
      render();
    });
    el.value = '';
    return;
  }
  if (el.dataset.actionChange === 'import-quiz') {
    readImport(el.files[0], (payload) => {
      if (payload.kind !== 'quizzes' && payload.kind !== 'backup') throw new Error('That file does not contain quizzes.');
      toast('Imported. ' + importPayload(payload, 'keep').join(' · '));
      render();
    });
    el.value = '';
  }
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const kind = form.dataset.form;
  const data = Object.fromEntries(new FormData(form));

  if (kind === 'typed') {
    const a = findAttempt(form.dataset.id);
    submitAnswer(a, data.answer ?? $('#typed').value, false);
    render();
  } else if (kind === 'pick-date') {
    if (validDate(data.date)) go('#/dashboard/' + data.date);
  } else if (kind === 'settings') {
    const hours = Number(data.minimumHours), pct = Number(data.onsitePercent);
    if (!(hours > 0 && hours <= 24) || !(pct >= 0 && pct <= 100)) { toast('Hours must be 0–24 and the target 0–100%.', true); return; }
    db.settings.minimumHours = hours; db.settings.onsitePercent = Math.round(pct);
    save(); toast('Rules saved.'); render();
  } else if (kind === 'day') {
    const y = +form.dataset.y, m = +form.dataset.m, orig = form.dataset.orig;
    const result = normaliseDay({ ...data, onsite: form.elements.onsite.checked });
    const fail = (errors) => {
      const typed = { ...data, onsite: form.elements.onsite.checked, errors };
      if (orig) {
        // re-render only this month, showing the errors on the row that failed
        render();
        const old = [...app.querySelectorAll('form[data-form="day"]')].find((x) => x.dataset.orig === orig);
        old.outerHTML = dayForm({ ...typed, orig }, y, m);
      } else { ui.newDay = { ...typed, isNew: true }; render(); }
    };
    if (result.errors) return fail(result.errors);

    const clash = db.timesheet.find((r) => r.date === result.row.date && r.date !== orig);
    if (clash) return fail({ date: 'There is already a row for that day.' });
    if (+result.row.date.slice(0, 4) !== y || +result.row.date.slice(5, 7) !== m) {
      // moved to another month: keep it, and say where it went
      toast(`Saved under ${MONTHS[+result.row.date.slice(5, 7) - 1]} ${result.row.date.slice(0, 4)}.`);
    } else toast(orig ? 'Day saved.' : 'Day added.');
    if (orig) db.timesheet = db.timesheet.filter((r) => r.date !== orig);
    db.timesheet.push(result.row);
    ui.newDay = false;
    save(); render();
  }
});

window.addEventListener('hashchange', render);
// Another tab changed the data: pick it up rather than overwrite it with a stale copy later.
window.addEventListener('storage', (ev) => {
  if (ev.key !== KEY || !ev.newValue) return;
  try { db = normaliseDb(JSON.parse(ev.newValue)); if (!$('input:focus, textarea:focus')) render(); } catch (e) { /* ignore */ }
});

if (!storageOk) toast('This browser is blocking storage; nothing will be saved. Export from the Data page.', true);
render();
