import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, toRows, toSettings } from './service.js';

describe('toSettings', () => {
  it('reads the stored value', () => {
    expect(toSettings([{ key: 'registration_enabled', value: 'false' }])).toEqual({
      registrationEnabled: false
    });
    expect(toSettings([{ key: 'registration_enabled', value: 'true' }])).toEqual({
      registrationEnabled: true
    });
  });

  it('falls back to the default when the key is absent', () => {
    // A key the code knows about and the database has not been seeded with - a fresh deploy, or a
    // row removed by hand. Neither should close the site.
    expect(toSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.registrationEnabled).toBe(true);
  });

  it('ignores keys it does not know', () => {
    // A setting left behind by a rolled-back deploy must not stop the rest from being read.
    expect(toSettings([{ key: 'something_removed', value: 'true' }])).toEqual(DEFAULT_SETTINGS);
  });

  describe('an unreadable value', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('falls back to the default and says so', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      // The column is TEXT and reachable with psql. Refusing to start over a typo would be worse
      // than ignoring it, so long as the log names the value to fix.
      expect(toSettings([{ key: 'registration_enabled', value: 'yes' }])).toEqual(DEFAULT_SETTINGS);
      expect(warn).toHaveBeenCalledOnce();
    });
  });
});

describe('toRows', () => {
  it('round-trips through toSettings', () => {
    for (const registrationEnabled of [true, false]) {
      expect(toSettings(toRows({ registrationEnabled }))).toEqual({ registrationEnabled });
    }
  });
});
