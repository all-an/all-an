import { Component } from '@angular/core';

import { CONTACT_EMAIL } from '../../shared/contact.js';

/**
 * The "we are not taking new accounts" notice, in one place.
 *
 * Both auth pages show it: the register page in place of the form it will not accept, the sign-in
 * page under the button, where somebody who cannot get in needs a way to ask. Two copies of a
 * sentence like this drift apart the first time one of them is reworded.
 *
 * It offers an address rather than only stating the policy - a closed door with nobody behind it
 * gives a would-be user nothing to do next.
 */
@Component({
  selector: 'app-registration-closed',
  template: `
    <p class="closed-notice" role="status">
      New accounts are closed for now. If you need one, email me at
      <a [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>.
    </p>
  `,
  styles: `
    /* Matches the panel's other messages, but with the margin on top: this one sits under what it
       follows rather than above a form. */
    .closed-notice {
      margin: 1rem 0 0;
      padding: 0.7rem 0.85rem;
      font-size: 0.875rem;
      color: #ffb59a;
      background: rgba(255, 102, 0, 0.08);
      border-radius: 8px;
    }

    /* The address takes the notice's own colour rather than the accent, so it reads as part of the
       sentence and the underline carries the affordance. */
    .closed-notice a {
      color: inherit;
      font-weight: 600;
      text-decoration: underline;
    }
  `
})
export class RegistrationClosed {
  protected readonly contactEmail = CONTACT_EMAIL;
}
