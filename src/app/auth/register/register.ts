import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthUser } from '../auth.service.js';
import { CredentialsPage } from '../credentials-page.js';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../credentials-form.css'
})
export class Register extends CredentialsPage {
  /** Only registering asks for this, so it lives here rather than on the shared base. */
  protected readonly email = signal('');

  protected submitRequest(): Observable<AuthUser> {
    return this.auth.register({
      username: this.username().trim(),
      email: this.email().trim(),
      password: this.password()
    });
  }
}
