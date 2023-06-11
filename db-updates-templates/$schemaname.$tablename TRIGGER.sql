/*
Copyright (c) 2023, Jörg 'MK2k' Sonntag, Steffen Stolze

Internet Consortium License (ISC)
*/
DROP TRIGGER IF EXISTS tr_$schemaname_$tablename_insert ON $schemaname.$tablename_insert;
DROP TRIGGER IF EXISTS tr_$schemaname_$tablename_update ON $schemaname.$tablename_update;
DROP TRIGGER IF EXISTS tr_$schemaname_$tablename_delete ON $schemaname.$tablename_delete;

CREATE OR REPLACE FUNCTION public.func_tr_$schemaname_$tablename_$scope()
  RETURNS TRIGGER
  LANGUAGE { SQL | PLPGSQL }
  SECURITY DEFINER
  SET search_path TO 'public'
AS
$func$
BEGIN
  -- do something

  RETURN new; -- for INSERT
END;
$func$;

CREATE TRIGGER tr_$schemaname_$tablename_$scope
  { BEFORE | AFTER | INSTEAD OF }                 -- choose one or combine with OR
  { INSERT | UPDATE | DELETE | TRUNCATE }         -- choose one or combine with OR
  ON $schemaname.$tablename
  FOR [ EACH ] { ROW | STATEMENT }
EXECUTE { FUNCTION | PROCEDURE } public.func_tr_$schemaname_$tablename_$scope();
