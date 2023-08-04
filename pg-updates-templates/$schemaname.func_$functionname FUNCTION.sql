/*
Copyright (c) 2023, Jörg 'MK2k' Sonntag, Steffen Stolze

Internet Consortium License (ISC)
*/
CREATE OR REPLACE FUNCTION $schemaname.func_$functionname(
  somevar TEXT
)
  RETURNS $DATATYPE
  LANGUAGE { SQL | PLPGSQL }
  SECURITY DEFINER                  -- (optional) careful! this lets the function run with the rights of the creator (postgres user)
  SET search_path TO 'public'       -- (optional) definitely use this if you have SECURITY DEFINER
  { VOLATILE | STABLE | IMMUTABLE } -- (optional) choose one; tells query optimizer how to work with the function
                                      -- VOLATILE: (default) no restrictions, function may modify the database, no optimization though
                                      -- STABLE: function cannot modify the DB and always returns the same result given the same parameters FOR ALL ROWS within a single statement
                                      -- IMMUTABLE: function cannot modify the DB and always returns the same result given the same parameters FOREVER
  AS
$func$                            -- this is just a named dollar-quote, i.e. the same as doing 'SELECT ... FROM ...' but nestable
BEGIN
  SELECT  user_profiles.is_admin
  FROM    user_profiles
  WHERE   user_profiles.id_user_profiles = auth.uid()
          AND user_profiles.somevar = func_$functionname.somevar; -- use func_$functionname.* to explicitly address the variable of the function (prevent ambiguity)
END
$func$;
