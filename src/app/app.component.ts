import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.start.html',
  // Use a minimal template so the app starts on the routed landing page
  // (replaced with `app.start.html` which contains only the router outlet)
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Hired';
}
