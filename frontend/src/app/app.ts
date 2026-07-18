import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Shell only. Every page is a lazily loaded route - see app.routes.ts.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {}
