import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupDirectory = path.join(workspace, 'emergency-backups', 'neon-export');
const args = new Map(process.argv.slice(2).map(argument => {
  const [key, ...value] = argument.split('=');
  return [key, value.join('=') || true];
}));
const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;
const quoteLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
const publicTable = value => `public.${quoteIdentifier(value)}`;

function usage() {
  process.stdout.write(`Usage:
  npm run db:restore:neon -- --inspect
  npm run db:restore:neon -- --archive=PATH
  npm run db:restore:neon -- --archive=PATH --apply --replace-existing --confirm-target=DATABASE@HOST

The target URL is read from TARGET_DATABASE_URL or from neon-restore-url.private.
Without --apply this performs a read-only target/schema check.
`);
}

function findLatestArchive() {
  const archives = fs.readdirSync(backupDirectory)
    .filter(name => name.endsWith('.json.gz'))
    .sort()
    .reverse();
  if (!archives.length) throw new Error(`No .json.gz backup was found in ${backupDirectory}`);
  return path.join(backupDirectory, archives[0]);
}

function readTargetUrl() {
  if (process.env.TARGET_DATABASE_URL) return process.env.TARGET_DATABASE_URL;
  const credentialPath = path.join(workspace, 'neon-restore-url.private');
  if (!fs.existsSync(credentialPath)) return null;
  const line = fs.readFileSync(credentialPath, 'utf8').split(/\r?\n/)
    .find(value => /^(TARGET_DATABASE_URL|DATABASE_URL)=/.test(value));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || null;
}

function reviveValue(value) {
  if (value && typeof value === 'object' && value.__type === 'base64') return Buffer.from(value.value, 'base64');
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  if (value && typeof value === 'object' && value.__type === 'bigint') return value.value;
  return value;
}

function loadArchive(archivePath) {
  const compressed = fs.readFileSync(archivePath);
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const checksumPath = `${archivePath}.sha256.txt`;
  if (fs.existsSync(checksumPath)) {
    const expected = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0].toLowerCase();
    if (checksum !== expected) throw new Error(`Backup checksum mismatch: expected ${expected}, received ${checksum}`);
  }
  const archive = JSON.parse(zlib.gunzipSync(compressed), (_key, value) => reviveValue(value));
  if (archive.format !== 'bluecrest-postgres-rescue-v1' || !archive.tables) {
    throw new Error('Unsupported or damaged BlueCrest backup archive.');
  }
  return { archive, checksum };
}

async function inspectTarget(client, archive) {
  const identity = (await client.query(`
    SELECT current_database() AS database, current_user AS database_user
  `)).rows[0];
  const schemaRows = (await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)).rows;
  const targetColumns = new Map();
  for (const row of schemaRows) {
    if (!targetColumns.has(row.table_name)) targetColumns.set(row.table_name, new Set());
    targetColumns.get(row.table_name).add(row.column_name);
  }
  const targetTables = [...targetColumns.keys()];
  const missingTables = Object.keys(archive.tables).filter(name => !targetTables.includes(name));
  if (missingTables.length) throw new Error(`Target schema is not initialized. Missing tables: ${missingTables.join(', ')}`);

  const missingColumns = [];
  for (const [tableName, table] of Object.entries(archive.tables)) {
    const columns = targetColumns.get(tableName);
    for (const column of table.columns) {
      if (!columns.has(column.column_name)) missingColumns.push(`${tableName}.${column.column_name}`);
    }
  }
  if (missingColumns.length) throw new Error(`Target schema is missing backup columns: ${missingColumns.join(', ')}`);

  const countSql = Object.keys(archive.tables).map(tableName =>
    `SELECT ${quoteLiteral(tableName)} AS table_name, COUNT(*)::int AS count FROM ${publicTable(tableName)}`
  ).join(' UNION ALL ');
  const counts = Object.fromEntries(
    (await client.query(countSql)).rows.map(row => [row.table_name, Number(row.count)])
  );
  return { identity, counts };
}

async function insertTable(client, tableName, table) {
  if (!table.rows.length) return;
  const columns = table.columns.map(column => column.column_name);
  const batchSize = Math.max(1, Math.min(100, Math.floor(60000 / columns.length)));
  for (let offset = 0; offset < table.rows.length; offset += batchSize) {
    const rows = table.rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = rows.map(row => `(${columns.map(column => {
      values.push(reviveValue(row[column]));
      return `$${values.length}`;
    }).join(', ')})`);
    await client.query(
      `INSERT INTO ${publicTable(tableName)} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${tuples.join(', ')}`,
      values
    );
  }
}

async function synchronizeSequences(client, archive) {
  for (const [tableName, table] of Object.entries(archive.tables)) {
    for (const column of table.columns) {
      const sequence = (await client.query('SELECT pg_get_serial_sequence($1, $2) AS name', [`public.${tableName}`, column.column_name])).rows[0].name;
      if (!sequence) continue;
      const maximum = (await client.query(`SELECT MAX(${quoteIdentifier(column.column_name)}) AS value FROM ${publicTable(tableName)}`)).rows[0].value;
      await client.query('SELECT setval($1::regclass, $2, $3)', [sequence, maximum ?? 1, maximum !== null]);
    }
  }
}

if (args.has('--help')) {
  usage();
  process.exit(0);
}

const archivePath = path.resolve(workspace, String(args.get('--archive') || findLatestArchive()));
const { archive, checksum } = loadArchive(archivePath);
const rowTotal = Object.values(archive.tables).reduce((total, table) => total + table.rows.length, 0);
process.stdout.write(`Backup verified: ${path.basename(archivePath)}\n`);
process.stdout.write(`SHA-256: ${checksum}\nTables: ${Object.keys(archive.tables).length}\nRows: ${rowTotal}\nExported: ${archive.exported_at}\n`);
if (args.has('--inspect')) process.exit(0);

const targetUrl = readTargetUrl();
if (!targetUrl || !/^postgres(ql)?:\/\//.test(targetUrl)) {
  throw new Error('Set TARGET_DATABASE_URL or add it to the ignored neon-restore-url.private file.');
}
const parsedTargetUrl = new URL(targetUrl);
for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) parsedTargetUrl.searchParams.delete(parameter);
const client = new Client({
  connectionString: parsedTargetUrl.toString(),
  ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' },
  connectionTimeoutMillis: 20_000,
  query_timeout: 120_000,
  application_name: 'bluecrest_neon_restore'
});

try {
  await client.connect();
  const target = await inspectTarget(client, archive);
  const fingerprint = `${target.identity.database}@${parsedTargetUrl.hostname}`;
  const nonempty = Object.entries(target.counts).filter(([, count]) => count > 0);
  process.stdout.write(`Target: ${fingerprint}\nTarget user: ${target.identity.database_user}\n`);
  process.stdout.write(`Existing backup-table rows: ${nonempty.reduce((total, [, count]) => total + count, 0)}\n`);

  if (!args.has('--apply')) {
    process.stdout.write(`Read-only check passed. To restore, rerun with --apply --replace-existing --confirm-target=${fingerprint}\n`);
  } else {
    if (args.get('--confirm-target') !== fingerprint) throw new Error(`Target confirmation mismatch. Use --confirm-target=${fingerprint}`);
    if (nonempty.length && !args.has('--replace-existing')) {
      throw new Error('Target contains data. Add --replace-existing only if this backup must replace it.');
    }
    await client.query('BEGIN');
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('bluecrest_neon_restore'))");
      await client.query(`TRUNCATE TABLE ${Object.keys(archive.tables).map(publicTable).join(', ')} RESTART IDENTITY CASCADE`);
      for (const [tableName, table] of Object.entries(archive.tables)) {
        await insertTable(client, tableName, table);
        process.stdout.write(`${tableName}: restored ${table.rows.length}\n`);
      }
      await synchronizeSequences(client, archive);
      const verification = await inspectTarget(client, archive);
      for (const [tableName, table] of Object.entries(archive.tables)) {
        if (verification.counts[tableName] !== table.rows.length) throw new Error(`Row-count verification failed for ${tableName}.`);
      }
      await client.query('COMMIT');
      process.stdout.write(`Restore committed and verified: ${rowTotal} rows across ${Object.keys(archive.tables).length} tables.\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}
