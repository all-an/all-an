import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthUser } from '../auth.service.js';
import { CredentialsPage } from '../credentials-page.js';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../credentials-form.css'
})
export class Login extends CredentialsPage {
  protected submitRequest(): Observable<AuthUser> {
    return this.auth.login({
      username: this.username().trim(),
      password: this.password()
    });
  }
}
