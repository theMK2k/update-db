/*
update-db

Copyright (c) 2023, Jörg 'MK2k' Sonntag, Steffen Stolze

Internet Consortium License (ISC)

Update a DB from scripts provided in ./db/db-updates
- already applied scripts are tracked in Table public.db_updates
  - if public.db_updates does not exist, it will be created
- scripts are applied in the order given in ./db/db-updates.json
- script file name convention: $schemaname.$objectname $OBJECTTYPE, examples:
  public.user_profiles TABLE.sql
  public.user_profiles TRIGGER.sql
  public.user_profiles RLS.sql
  public.func_get_userinfo FUNCTION.sql

*/

import * as path from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { exit } from 'process';

import * as pg from 'pg';
import loglevel from 'loglevel';
import ora from 'ora';
import shajs from 'sha.js';
import * as chalk from 'chalk';

const { Client } = pg.default;
const { info, setLevel, error, log } = loglevel.default;
const { red, white, yellow } = chalk.default;
const doCommit = process.argv.find((arg) => arg.toLowerCase() === '--commit');
let currentQuery = null;

/*
   Helper Functions
   */
async function doesTableExist(pgClient, schema, tableName) {
	schema = schema || 'public';

	currentQuery = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema=$1
  AND table_type='BASE TABLE'
  AND table_name=$2;
  `;

	const result = await pgClient.query(currentQuery, [schema, tableName]);

	// logger.log(result)

	return !!result.rowCount;
}

function injectDefaults(query) {
	// inject default columns if the placeholder exists
	let newQuery = query.replace(
		'%DEFAULT_COLUMNS%',
		`-- default columns:
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  , ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL DEFAULT COALESCE(auth.uid(), uuid('00000000-0000-0000-0000-000000000000'))
  , ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  , ADD COLUMN IF NOT EXISTS updated_by UUID NOT NULL DEFAULT COALESCE(auth.uid(), uuid('00000000-0000-0000-0000-000000000000'))
  , ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE
  , ADD COLUMN IF NOT EXISTS deleted_by UUID
  , ADD COLUMN IF NOT EXISTS deleted_reason TEXT
`,
	);

	// inject default trigger (updated_at, updated_by)
	newQuery = newQuery.replace(
		/%DEFAULT_TRIGGER\((.*?)\.(.*?)\)%/,
		`-- default trigger
DROP TRIGGER IF EXISTS tr_$1_$2_update ON $1.$2;
DROP FUNCTION IF EXISTS $1.func_tr_$1_$2_update;
CREATE FUNCTION public.func_tr_$1_$2_update() RETURNS TRIGGER
    LANGUAGE PLPGSQL
    AS
$func$

BEGIN
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(auth.uid(), uuid('00000000-0000-0000-0000-000000000000'));
    RETURN NEW;
END;
$func$;

CREATE TRIGGER tr_$1_$2_update
    BEFORE UPDATE
    ON $1.$2
    FOR EACH ROW
    EXECUTE FUNCTION $1.func_tr_$1_$2_update();
`,
	);
	return newQuery;
}

async function manage_db_updates_table(pgClient) {
	currentQuery = `
    CREATE TABLE IF NOT EXISTS public.db_updates (
        id_db_updates BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
      );
      
      ALTER TABLE public.db_updates
          ADD COLUMN IF NOT EXISTS name TEXT NOT NULL
        , ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL
        , %DEFAULT_COLUMNS%
      ;
      
      %DEFAULT_TRIGGER(public.db_updates)%

      ALTER TABLE public.db_updates ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS policy_public_db_updates_all ON public.db_updates;
      
      /*
      ALL
      - NOBODY may do anything with public.db_updates
      */
      CREATE POLICY policy_public_db_updates_all
        ON public.db_updates
        FOR ALL
        TO authenticated
        USING ( false )
        WITH CHECK ( false )
      ;
`;

	currentQuery = injectDefaults(currentQuery);

	await pgClient.query(currentQuery);

	currentQuery = '';
}

async function query_db_updates(pgClient) {
	currentOra = ora('fetching already applied updates').start();

	currentQuery = `
SELECT id_db_updates
       , name
       , sha256
FROM public.db_updates
`;

	const result = await pgClient.query(currentQuery);

	currentOra.succeed();

	// logger.log('db_updates query result:', result);
	return result.rows;
}

setLevel(2); // TODO: set via --loglevel
const UPDATE_SCRIPTS_LOCATION = path.join('db', 'db-updates');
const UPDATE_SCRIPTS_JSON_LOCATION = path.join('db', 'db-updates.json');

const PGHOST = process.env.PGHOST;
const PGPORT = process.env.PGPORT;
const PGDATABASE = process.env.PGDATABASE;
const PGUSER = process.env.PGUSER;
const PGPASSWORD = process.env.PGPASSWORD;

function checkEnvVarAndQuitIfFalsy(key, value) {
	if (!value) {
		error(`ERROR: ${key} is not set, please provide it as env var!`);
		exit(1);
	}
}

checkEnvVarAndQuitIfFalsy('PGHOST', PGHOST);
checkEnvVarAndQuitIfFalsy('PGPORT', PGPORT);
checkEnvVarAndQuitIfFalsy('PGDATABASE', PGDATABASE);
checkEnvVarAndQuitIfFalsy('PGUSER', PGUSER);
checkEnvVarAndQuitIfFalsy('PGPASSWORD', PGPASSWORD);

if (!existsSync(UPDATE_SCRIPTS_LOCATION)) {
	console.error(`${UPDATE_SCRIPTS_LOCATION} does not exist, abort!`);
}

const updateScripts = JSON.parse(readFileSync(UPDATE_SCRIPTS_JSON_LOCATION));

const updateScriptFiles = readdirSync(UPDATE_SCRIPTS_LOCATION);

updateScriptFiles.sort();

let warnNotReferencedScripts = [];
for (const updateScriptFile of updateScriptFiles) {
	if (!updateScripts.updates.find((item) => item === updateScriptFile) && !updateScripts.ignore.find((item) => item === updateScriptFile)) {
		warnNotReferencedScripts.push(updateScriptFile);
	}
}

let warnTablesWithoutRLS = [];
for (const updateScriptFile of updateScriptFiles) {
	const rxTableName = /(^[a-zA-Z]*?\..*?) TABLE/;
	if (rxTableName.test(updateScriptFile)) {
		if (
			!updateScriptFiles.find((updateScriptFile2) => {
				const rxRLSName = /(.*?) RLS/;
				if (rxRLSName.test(updateScriptFile2)) {
					if (updateScriptFile.match(rxTableName)[1] === updateScriptFile2.match(rxRLSName)[1]) {
						return true;
					}
				}
			})
		) {
			warnTablesWithoutRLS.push(updateScriptFile);
		}
	}
}

function printWarnings() {
	if (warnNotReferencedScripts.length > 0) {
		warnNotReferencedScripts.forEach((updateScriptFile) => {
			console.warn(`${yellow('WARNING:')} the update script file ${yellow(updateScriptFile)} exists but is not referenced in ${yellow(UPDATE_SCRIPTS_JSON_LOCATION)}`);
		});
	}
	if (warnTablesWithoutRLS.length > 0) {
		warnTablesWithoutRLS.forEach((updateScriptFile) => {
			console.warn(`${yellow('WARNING:')} no RLS update script found for ${yellow(updateScriptFile)}`);
		});
	}
}

const pgClient = new Client();

let currentOra = null;

(async () => {
	try {
		currentOra = ora('connecting to DB').start();
		await pgClient.connect();
		currentOra.succeed();

		currentOra = ora('managing public.db_updates').start();
		await manage_db_updates_table(pgClient);
		currentOra.succeed();

		const alreadyApplied_db_updates = await query_db_updates(pgClient);

		log('alreadyApplied_db_updates:', alreadyApplied_db_updates);

		try {
			let updateCounter = 0;
			// logger.info('running updates...');
			await pgClient.query('BEGIN');

			for (const updateScript of updateScripts.updates) {
				currentOra = ora(`applying ${updateScript}`);

				const updateScriptFullPath = join(UPDATE_SCRIPTS_LOCATION, updateScript);

				if (!existsSync(updateScriptFullPath)) {
					throw new Error(`FILE NOT FOUND: "${updateScriptFullPath}", please check db-updates.json`);
				}

				let script = readFileSync(join(UPDATE_SCRIPTS_LOCATION, updateScript)).toString();

				const sha256 = new shajs('sha256').update(script).digest('hex');

				// inject default columns and triggers if the placeholder exists
				script = injectDefaults(script);

				log('SCRIPT:', script);

				const alreadyAppliedScript = alreadyApplied_db_updates.find((dbu) => dbu.name === updateScript);

				if (alreadyAppliedScript && alreadyAppliedScript.sha256 === sha256) {
					currentOra.text = `skipping ${updateScript} (already applied with same sha256)`;
					currentOra.stopAndPersist();
					continue;
				}

				updateCounter++;

				currentQuery = script;
				await pgClient.query(currentQuery);

				if (alreadyAppliedScript) {
					currentQuery = `UPDATE public.db_updates SET sha256 = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2`;
					await pgClient.query(currentQuery, [sha256, updateScript]);
					currentOra.succeed();
					continue;
				}

				currentQuery = `INSERT INTO public.db_updates (name, sha256, created_by, updated_by) VALUES ($1, $2, $3, $4)`;
				await pgClient.query(currentQuery, [updateScript, sha256, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000']);
				currentOra.succeed();
			}

			if (!doCommit) {
				currentOra = ora(`ROLLBACK (dry run) - use --commit to actually write to db`);
				await pgClient.query('ROLLBACK');
				currentOra.succeed();

				printWarnings();

				error(`${red('IMPORTANT:')} ${white('Your changes are fine but they')} ${white.bold('WERE NOT COMMITTED')} to the DB. Please use ${white.bold('yarn update-db --commit')} to do so.'`);
				exit(0);
			}

			currentOra = ora('committing changes');
			await pgClient.query('COMMIT');
			currentOra.succeed();

			printWarnings();

			info(`${updateCounter} updates applied, ${updateScripts.length - updateCounter} updates skipped`);
		} catch (err2) {
			if (currentOra) {
				currentOra.fail();

				error(err2);

				info('last query:');
				info(currentQuery);
			}

			currentOra = ora(`ROLLBACK due to errors`);
			await pgClient.query('ROLLBACK');
			currentOra.succeed();
			exit(1);
		}
	} catch (err) {
		currentOra.fail(err.message);
		exit(1);
	} finally {
		pgClient.end();
	}

	exit(0);
})();
