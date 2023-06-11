/*
Copyright (c) 2023, Jörg 'MK2k' Sonntag, Steffen Stolze

Internet Consortium License (ISC)
*/
ALTER TABLE $schemaname.$tablename ENABLE ROW LEVEL SECURITY;

-- remove old policies
DROP POLICY IF EXISTS policy_$schemaname_$tablename_all ON $schemaname.$tablename;
DROP POLICY IF EXISTS policy_$schemaname_$tablename_select ON $schemaname.$tablename;
DROP POLICY IF EXISTS policy_$schemaname_$tablename_insert ON $schemaname.$tablename;
DROP POLICY IF EXISTS policy_$schemaname_$tablename_update ON $schemaname.$tablename;
DROP POLICY IF EXISTS policy_$schemaname_$tablename_delete ON $schemaname.$tablename;

/*
SELECT

-- ONLY authenticated users
-- not virtually deleted rows
-- ... put a high level description on what's allowed in here
*/
CREATE POLICY policy_$schemaname_$tablename_select
  ON $schemaname.$tablename
  FOR SELECT
  TO authenticated      -- another group can be "anon", but it is very unlikely that non logged-in users can see data, right?
  USING (
    -- checks against available data (suitable for SELECT, UPDATE, DELETE)
    (
      -- not virtually deleted rows
      (
        $tablename.deleted_at IS NULL
        OR
        ABS(EXTRACT(EPOCH FROM (now() - $tablename.deleted_at))) < 1 -- WORKAROUND: have a virtually deleted row still visible for 1 second (this is necessary, else setting deleted_at = now() would fail with this RLS)
      )

      -- ...put a high level description on what's allowed in here
      AND
      EXISTS (SELECT FROM some_table_or_function WHERE some_column = some_value)
    )
  )
;

/*
INSERT

-- ONLY authenticated users
-- ... put a high level description on what's allowed in here
*/
CREATE POLICY policy_$schemaname_$tablename_insert
  ON $schemaname.$tablename
  FOR INSERT
  TO authenticated      -- another group can be "anon", but it is very unlikely that non logged-in users can insert something, right?
  WITH CHECK (
    -- checks against new data (suitable for INSERT, UPDATE)
    (
      -- ...put a high level description on what's allowed in here
      EXISTS (SELECT FROM some_table_or_function WHERE some_column = some_value)
    )
  )
;

/*
UPDATE

-- ONLY authenticated users
-- ... put a high level description on what's allowed in here
*/
CREATE POLICY policy_$schemaname_$tablename_update
  ON $schemaname.$tablename
  FOR UPDATE
  TO authenticated      -- another group can be "anon", but it is very unlikely that non logged-in users can update something, right?
  USING (
    -- checks against available data (suitable for SELECT, UPDATE, DELETE)
    (
      -- ...put a high level description on what's allowed in here
      EXISTS (SELECT FROM some_table_or_function WHERE some_column = some_value)
    )
  )
  WITH CHECK (
    -- checks against new data (suitable for INSERT, UPDATE)
    (
      -- ...put a high level description on what's allowed in here
      EXISTS (SELECT FROM some_table_or_function WHERE some_column = some_value)
    )
  )
;

/*
DELETE

-- ONLY authenticated users
-- ... put a high level description on what's allowed in here
*/
CREATE POLICY policy_$schemaname_$tablename_delete
  ON $schemaname.$tablename
  FOR DELETE
  TO authenticated      -- another group can be "anon", but it is very unlikely that non logged-in users can update something, right?
  USING (
    -- checks against available data (suitable for SELECT, UPDATE, DELETE)
    (
      -- ...put a high level description on what's allowed in here
      EXISTS (SELECT FROM some_table_or_function WHERE some_column = some_value)
    )
  )
;
