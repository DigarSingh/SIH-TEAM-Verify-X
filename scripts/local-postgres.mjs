#!/usr/bin/env node
/**
 * Starts a real PostgreSQL server for local development - no Docker and no
 * system-wide install required (uses the `embedded-postgres` binaries).
 *
 * The data directory is persistent (./.pgdata by default) and both the
 * development database and the test database are created on first start.
 * This is a DEVELOPMENT convenience only; production uses managed PostgreSQL.
 *
 * Environment overrides: LOCAL_PG_PORT, LOCAL_PG_DIR, LOCAL_PG_USER,
 * LOCAL_PG_PASSWORD, LOCAL_PG_DATABASES (comma separated), LOCAL_PG_VERBOSE=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.LOCAL_PG_DIR ?? path.join(root, '.pgdata'));
const port = Number(process.env.LOCAL_PG_PORT ?? 5432);
const user = process.env.LOCAL_PG_USER ?? 'postgres';
const password = process.env.LOCAL_PG_PASSWORD ?? 'postgres';
const databases = (process.env.LOCAL_PG_DATABASES ?? 'capacity_connect,capacity_connect_test')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const verbose = process.env.LOCAL_PG_VERBOSE === '1';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  authMethod: 'scram-sha-256',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--locale-provider=icu', '--icu-locale=en-US'],
  // Development/test database only: trade crash-durability for speed (a crash may lose
  // recent writes, never corrupt-and-hide them). Never use these flags in production.
  postgresFlags: ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
  onLog: verbose ? (message) => console.log(String(message).trimEnd()) : () => {},
  onError: (error) => console.error(error instanceof Error ? error.message : String(error).trimEnd()),
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received - stopping PostgreSQL...`);
  try {
    await pg.stop();
  } catch (error) {
    console.error('Error while stopping PostgreSQL:', error instanceof Error ? error.message : error);
  }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function main() {
  const initialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (!initialised) {
    console.log(`Initialising new PostgreSQL cluster in ${dataDir} ...`);
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  try {
    const { rows } = await client.query('SELECT datname FROM pg_database');
    const existing = new Set(rows.map((row) => row.datname));
    for (const name of databases) {
      if (!existing.has(name)) {
        await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
        console.log(`Created database "${name}".`);
      }
    }
    const { rows: version } = await client.query('SHOW server_version');
    console.log(`PostgreSQL ${version[0].server_version} is ready on port ${port}.`);
  } finally {
    await client.end();
  }

  for (const name of databases) {
    console.log(`  postgresql://${user}:${password}@localhost:${port}/${name}`);
  }
  console.log('Press Ctrl+C to stop the server (data is kept in the data directory).');
}

main().catch(async (error) => {
  console.error('Failed to start local PostgreSQL:', error instanceof Error ? error.message : error);
  try {
    await pg.stop();
  } catch {
    // nothing running - ignore
  }
  process.exit(1);
});
