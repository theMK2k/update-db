# Update DB

Update DB is a script for database migrations.

Currently supported is:

- Postgres

## How it works

Define your database update and migration scripts as `.sql` files in `db/db-updates`, e.g.:

```text
db/db-updates
├── public.permissions RLS.sql
├── public.permissions TABLE.sql
├── public.roles RLS.sql
├── public.roles TABLE.sql
├── public.users RLS.sql
├── public.users TABLE.sql
└── public.users TRIGGER.sql
```

Create a `.json` file to define the sequence in which the `.sql` files should be run:

```json
{
  "updates": [
    "public.users TABLE.sql",
    "public.roles TABLE.sql",
    "public.permissions TABLE.sql",

    "public.users TRIGGER.sql",

    "public.permissions RLS.sql",
    "public.roles RLS.sql",
    "public.users RLS.sql",
  ],
  "ignore": []
}
```

## Running update-db

Provide the following environment variables for the Postgres connection:

```text
PGHOST
PGUSER
PGDATABASE
PGPASSWORD
PGPORT
```

Run `node update-db.mjs` and update-db will perform the updates in **dry-run mode** (the actual updates will not be committed).

Run `node update-db.mjs --commit` and update-db will perform the updates and **commit** them.
