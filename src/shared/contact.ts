/**
 * The address to reach a human at.
 *
 * Outside both src/api and src/app because both need it: the contact form returns it in the 429
 * body when someone has hit the daily limit, and the register page offers it when registration is
 * closed. This module deliberately imports nothing - anything server-side in here would follow the
 * import into the browser bundle.
 */
export const CONTACT_EMAIL = 'allan8tech@gmail.com';
