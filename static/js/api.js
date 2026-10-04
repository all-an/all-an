// A thin client for the JSON API, and the few helpers every page script shares.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? 'Something went wrong. Please try again.');
    this.status = status;
    this.body = body ?? {};
    // Per-field messages, when the server could say which input was wrong.
    this.fields = body?.fields ?? {};
  }
}

/**
 * Calls the API and resolves to the parsed JSON body (null for 204). Rejects with an ApiError
 * carrying the status and the server's message; status 0 means the request never got an answer.
 */
export async function api(method, url, body) {
  let response;

  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, { message: 'Could not reach the server. Check your connection and try again.' });
  }

  const text = response.status === 204 ? '' : await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data;
}

/** Escapes text for use inside an HTML string. Anything user-written goes through this. */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FLASH_KEY = 'all-an:flash';

/** A message to show on the next page load - for actions that reload the page to show their result. */
export function flash(message) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // Private mode: the action still happened, the page just will not say so.
  }
}

export function takeFlash() {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return message;
  } catch {
    return null;
  }
}

/** Shows `message` in the first matching element, or hides it when there is none. */
export function show(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message ?? '';
  element.hidden = !message;
}
