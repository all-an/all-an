import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { SettingsService } from '../../settings/settings.service.js';
import { AuthUser } from '../auth.service.js';
import { CredentialsPage } from '../credentials-page.js';
import { RegistrationClosed } from '../registration-closed.js';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, RegistrationClosed],
  templateUrl: './register.html',
  styleUrl: '../credentials-form.css'
})
export class Register extends CredentialsPage {
  /** Only registering asks for this, so it lives here rather than on the shared base. */
  protected readonly email = signal('');

  /**
   * Whether the site is taking new accounts. Resolved before the first render by an app
   * initializer, so the form is never shown to somebody it would only reject.
   *
   * Open if the request failed, matching the server's own default: a blip should show a form that
   * comes back with a clear message, not a closed sign nobody can get past. The server decides
   * either way - this saves someone filling in three fields to be told no.
   */
  protected readonly registrationOpen = inject(SettingsService).registrationEnabled;

  protected submitRequest(): Observable<AuthUser> {
    return this.auth.register({
      username: this.username().trim(),
      email: this.email().trim(),
      password: this.password()
    });
  }
}
