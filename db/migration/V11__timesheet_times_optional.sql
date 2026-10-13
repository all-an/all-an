-- A working day can be added before (or without) its times: the start, lunch and end are all
-- optional. Whatever is present must still be in order, and lunch is still both times or neither.
-- A non-WORK day still carries no times at all.
ALTER TABLE timesheet DROP CONSTRAINT chk_timesheet_work_has_times;

ALTER TABLE timesheet ADD CONSTRAINT chk_timesheet_work_has_times CHECK (
    day_type = 'WORK'
    OR (start_hour IS NULL AND start_lunch IS NULL AND end_lunch IS NULL
        AND end_work_hour IS NULL AND NOT onsite)
);

ALTER TABLE timesheet DROP CONSTRAINT chk_timesheet_order;

ALTER TABLE timesheet ADD CONSTRAINT chk_timesheet_order CHECK (
    (start_hour IS NULL OR end_work_hour IS NULL OR start_hour < end_work_hour)
    AND (start_lunch IS NULL OR end_lunch IS NULL OR start_lunch < end_lunch)
    AND (start_hour IS NULL OR start_lunch IS NULL OR start_hour < start_lunch)
    AND (end_lunch IS NULL OR end_work_hour IS NULL OR end_lunch < end_work_hour)
);
