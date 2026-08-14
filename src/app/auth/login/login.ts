import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { SettingsService } from '../../settings/settings.service.js';
import { AuthUser } from '../auth.service.js';
import { CredentialsPage } from '../credentials-page.js';
import { RegistrationClosed } from '../registration-closed.js';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, RegistrationClosed],
  templateUrl: './login.html',
  styleUrl: '../credentials-form.css'
})
export class Login extends CredentialsPage {
  /**
   * Whether to offer the "create one" link or the notice that replaces it - signing in itself is
   * never closed.
   *
   * Already resolved: an app initializer loads the settings before the first render, so this reads
   * the real value rather than the default and then correcting itself in view of the visitor.
   */
  protected readonly registrationOpen = inject(SettingsService).registrationEnabled;

  protected submitRequest(): Observable<AuthUser> {
    return this.auth.login({
      username: this.username().trim(),
      password: this.password()
    });
  }
}
