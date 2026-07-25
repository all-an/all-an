import type { ZodType } from 'zod';

import { BadRequest } from './errors.js';

/**
 * Validates and narrows a request body, or throws a 400 listing what was wrong.
 *
 * This is what Bean Validation's @Valid did on the Spring controllers: the route below it can
 * assume its input is the shape it declared, and every rejection reads the same way to the client.
 *
 * Field errors are returned as a flat map so a form can put each message next to its input rather
 * than dumping one string above the whole thing.
 */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_';
    // First message per field wins: several complaints about one input is noise, and the first is
    // usually the specific one ("must be at most 80 characters") rather than a fallback.
    fields[path] ??= issue.message;
  }

  throw new BadRequest('That request was not valid.', { fields });
}
