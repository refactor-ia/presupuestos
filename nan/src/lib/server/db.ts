/**
 * SQLite persistence layer built on node:sqlite (Node 24 built-in).
 *
 * The database file is opened lazily on first access: the path comes from the
 * DB_PATH environment variable, defaulting to nan-data/budgets.db relative to
 * the process working directory (the project root for dev and production).
 * The parent directory is created if it does not exist, and the schema is
 * created idempotently on every open.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = 'nan-data/budgets.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS budgets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	number TEXT NOT NULL UNIQUE,
	client_name TEXT NOT NULL,
	email TEXT NOT NULL DEFAULT '',
	address TEXT NOT NULL DEFAULT '',
	rut TEXT NOT NULL DEFAULT '',
	items TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
`;

let database: DatabaseSync | null = null;

function databasePath(): string {
	return resolve(process.env.DB_PATH ?? DEFAULT_DB_PATH);
}

/** Open (once) and return the shared database connection, creating the schema. */
export function getDatabase(): DatabaseSync {
	if (database !== null) {
		return database;
	}
	const file = databasePath();
	mkdirSync(dirname(file), { recursive: true });
	database = new DatabaseSync(file);
	// WAL keeps concurrent adapter-node requests from blocking each other.
	database.exec('PRAGMA journal_mode = WAL;');
	database.exec(SCHEMA);
	return database;
}

/** Close the connection and drop the cached instance. Used between tests so each test can point DB_PATH at a fresh file. */
export function resetDatabaseForTests(): void {
	database?.close();
	database = null;
}
