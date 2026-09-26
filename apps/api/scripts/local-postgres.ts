import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initdb, pg_ctl } from '@embedded-postgres/windows-x64';
import pg from 'pg';

const { Client } = pg;
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(apiRoot, '../..');
const localRoot = resolve(projectRoot, '.local/postgres');
const dataDir = resolve(localRoot, 'data');
const logFile = resolve(localRoot, 'postgres.log');
const passwordFile = resolve(localRoot, '.admin-password');
const binaryDirectory = dirname(pg_ctl);
const childEnvironment = { ...process.env, PATH: `${binaryDirectory};${process.env.PATH ?? ''}` };

function requiredEnvironment(name: 'DATABASE_URL' | 'LOCAL_PG_ADMIN_PASSWORD') {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in apps/api/.env.`);
  return value;
}

const databaseUrl = requiredEnvironment('DATABASE_URL');
const adminPassword = requiredEnvironment('LOCAL_PG_ADMIN_PASSWORD');

const target = new URL(databaseUrl);
const appUser = decodeURIComponent(target.username);
const appPassword = decodeURIComponent(target.password);
const databaseName = target.pathname.slice(1);
const port = Number(target.port || 5432);

function identifier(value: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

function literal(value: string) { return `'${value.replaceAll("'", "''")}'`; }

function run(binary: string, args: string[], quiet = false) {
  const result = spawnSync(binary, args, { env: childEnvironment, stdio: quiet ? 'ignore' : 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function initialise() {
  if (existsSync(resolve(dataDir, 'PG_VERSION'))) return;
  await mkdir(localRoot, { recursive: true });
  await writeFile(passwordFile, adminPassword, { encoding: 'utf8', mode: 0o600 });
  try {
    const status = run(initdb, ['-D', dataDir, '-U', 'postgres', `--pwfile=${passwordFile}`, '--auth-host=scram-sha-256', '--auth-local=trust', '--encoding=UTF8']);
    if (status !== 0) throw new Error(`initdb exited with code ${status}`);
  } finally {
    await rm(passwordFile, { force: true });
  }
}

function isRunning() { return run(pg_ctl, ['-D', dataDir, 'status'], true) === 0; }

async function start() {
  await initialise();
  if (!isRunning()) {
    const status = run(pg_ctl, ['-D', dataDir, '-l', logFile, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start']);
    if (status !== 0) throw new Error(`pg_ctl start exited with code ${status}. See ${logFile}`);
  }

  const client = new Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', password: adminPassword });
  await client.connect();
  try {
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
    if (!role.rowCount) await client.query(`CREATE ROLE ${identifier(appUser)} LOGIN PASSWORD ${literal(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    else await client.query(`ALTER ROLE ${identifier(appUser)} PASSWORD ${literal(appPassword)}`);
    const database = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (!database.rowCount) await client.query(`CREATE DATABASE ${identifier(databaseName)} OWNER ${identifier(appUser)}`);
    const shadowDatabaseName = `${databaseName}_shadow`;
    const shadowDatabase = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [shadowDatabaseName]);
    if (!shadowDatabase.rowCount) await client.query(`CREATE DATABASE ${identifier(shadowDatabaseName)} OWNER ${identifier(appUser)}`);
  } finally {
    await client.end();
  }
  console.log(`Local PostgreSQL 17 is ready on 127.0.0.1:${port}/${databaseName}.`);
}

async function stop() {
  if (!existsSync(resolve(dataDir, 'PG_VERSION')) || !isRunning()) {
    console.log('Local PostgreSQL is already stopped.');
    return;
  }
  const status = run(pg_ctl, ['-D', dataDir, '-w', 'stop', '-m', 'fast']);
  if (status !== 0) throw new Error(`pg_ctl stop exited with code ${status}`);
}

const command = process.argv[2] ?? 'start';
if (command === 'start') await start();
else if (command === 'stop') await stop();
else throw new Error(`Unknown command: ${command}`);
