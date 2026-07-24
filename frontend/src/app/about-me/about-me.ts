import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface StackGroup {
  label: string;
  items: string[];
}

@Component({
  selector: 'app-about-me',
  imports: [RouterLink],
  templateUrl: './about-me.html',
  styleUrl: './about-me.css'
})
export class AboutMe {
  /**
   * Grouped rather than one flat badge wall: the grouping is the signal. A reader scanning for
   * "does he know messaging?" finds the answer without reading thirty logos.
   */
  readonly stack: StackGroup[] = [
    { label: 'Languages', items: ['Java', 'TypeScript', 'JavaScript', 'Python', 'Bash'] },
    { label: 'Backend', items: ['Spring Boot', 'Quarkus', 'REST APIs'] },
    { label: 'Frontend', items: ['Angular', 'React'] },
    { label: 'Data', items: ['PostgreSQL', 'MySQL', 'Flyway', 'Liquibase'] },
    { label: 'Messaging', items: ['RabbitMQ', 'Apache Kafka'] },
    { label: 'Infrastructure', items: ['AWS', 'Docker', 'Linux'] },
    { label: 'Practices', items: ['TDD', 'BDD', 'DDD'] }
  ];
}
