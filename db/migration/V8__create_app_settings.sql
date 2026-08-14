-- Site-wide settings an administrator can change without a deploy.
--
-- Key/value rather than one column per setting. A column per setting is better typed, but it makes
-- every new switch a migration plus a repo change plus a deploy, which is the opposite of the point
-- - these exist so the site can be adjusted while it is running. The cost is that values are TEXT
-- and somebody has to know what each key means; exactly one place does, settings/service.ts.
CREATE TABLE app_settings (
    key        TEXT NOT NULL PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Who last changed it. SET NULL rather than CASCADE: removing an administrator must not take
    -- the site's configuration down with them.
    updated_by BIGINT REFERENCES users (id) ON DELETE SET NULL
);

-- Whether POST /api/auth/register is open.
--
-- Seeded true here rather than left absent, so the table describes what can be configured instead
-- of only what somebody has already touched. The reader still defaults a missing key to the safe
-- value - a row deleted by hand should not close the site.
INSERT INTO app_settings (key, value) VALUES ('registration_enabled', 'true');
