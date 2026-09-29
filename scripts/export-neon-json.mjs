import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import dns from 'node:dns';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDirectory, '..');
const credentialFile = path.join(workspace, 'neon-export-url.private');

const credentialText = fs.existsSync(credentialFile)
  ? fs.readFileSync(credentialFile, 'utf8')
  : '';
const databaseLine = credentialText.split(/\r?\n/).find(line => line.startsWith('NEON_DATABASE_URL='));
const connectionString = (
  databaseLine?.slice('NEON_DATABASE_URL='.length)
  || process.env.NEON_DATABASE_URL
  || process.env.DATABASE_URL
)?.trim().replace(/^['"]|['"]$/g, '');

if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
  throw new Error('A complete Neon PostgreSQL URL is required in .env or neon-export-url.private.');
}

const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;
const databaseUrl = new URL(connectionString);
databaseUrl.hostname = databaseUrl.hostname.replace('-pooler.', '.');
const resolver = new dns.promises.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);
const resolvedAddresses = process.env.NEON_RESOLVED_IP
  ? [process.env.NEON_RESOLVED_IP]
  : await resolver.resolve4(databaseUrl.hostname);
if (!resolvedAddresses.length) {
  throw new Error('The Neon hostname did not resolve to an IPv4 address.');
}
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
const backupDirectory = path.join(workspace, 'emergency-backups', 'neon-export');
const archivePath = path.join(backupDirectory, `bluecrest-neon-data-${timestamp}.json.gz`);
const manifestPath = `${archivePath}.manifest.json`;
const checksumPath = `${archivePath}.sha256.txt`;

fs.mkdirSync(backupDirectory, { recursive: true });

const client = new Client({
  host: resolvedAddresses[0],
  port: Number(databaseUrl.port || 5432),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.slice(1)),
  ssl: { rejectUnauthorized: true, servername: databaseUrl.hostname },
  application_name: 'bluecrest_emergency_export',
  connectionTimeoutMillis: 20_000,
  query_timeout: 120_000
});

const archive = {
  format: 'bluecrest-postgres-rescue-v1',
  exported_at: new Date().toISOString(),
  database: null,
  server_version: null,
  tables: {},
  constraints: [],
  indexes: [],
  sequences: []
};

try {
  process.stdout.write('Connecting to Neon using verified TLS...\n');
  await client.connect();
  process.stdout.write('Connected. Starting consistent read-only snapshot...\n');
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  const identity = await client.query('SELECT current_database() AS database, version() AS server_version');
  archive.database = identity.rows[0].database;
  archive.server_version = identity.rows[0].server_version;

  const tableResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const { table_name: tableName } of tableResult.rows) {
    const columns = await client.query(`
      SELECT column_name, ordinal_position, column_default, is_nullable,
             data_type, udt_name, character_maximum_length,
             numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    const rows = await client.query(`SELECT * FROM public.${quoteIdentifier(tableName)}`);
    archive.tables[tableName] = { columns: columns.rows, rows: rows.rows };
    process.stdout.write(`${tableName}: ${rows.rowCount} rows\n`);
  }

  archive.constraints = (await client.query(`
    SELECT c.conname AS name, rel.relname AS table_name,
           pg_get_constraintdef(c.oid, true) AS definition
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
    ORDER BY rel.relname, c.conname
  `)).rows;

  archive.indexes = (await client.query(`
    SELECT tablename AS table_name, indexname AS name, indexdef AS definition
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `)).rows;

  archive.sequences = (await client.query(`
    SELECT sequencename AS name, last_value, start_value, increment_by,
           max_value, min_value, cache_size, cycle
    FROM pg_sequences
    WHERE schemaname = 'public'
    ORDER BY sequencename
  `)).rows;

  await client.query('COMMIT');

  const json = JSON.stringify(archive, (_key, value) => {
    if (Buffer.isBuffer(value)) return { __type: 'base64', value: value.toString('base64') };
    if (typeof value === 'bigint') return { __type: 'bigint', value: value.toString() };
    return value;
  });
  fs.writeFileSync(archivePath, zlib.gzipSync(json, { level: 9 }));
  const checksum = crypto.createHash('sha256')
    .update(fs.readFileSync(archivePath))
    .digest('hex');

  const manifest = {
    format: archive.format,
    exported_at: archive.exported_at,
    database: archive.database,
    archive: archivePath,
    archive_bytes: fs.statSync(archivePath).size,
    sha256: checksum,
    table_count: Object.keys(archive.tables).length,
    row_counts: Object.fromEntries(Object.entries(archive.tables).map(([name, value]) => [name, value.rows.length])),
    constraint_count: archive.constraints.length,
    index_count: archive.indexes.length,
    sequence_count: archive.sequences.length
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(archivePath)}\n`, 'ascii');
  if (databaseLine) fs.rmSync(credentialFile, { force: true });

  process.stdout.write(`Archive: ${archivePath}\n`);
  process.stdout.write(`Manifest: ${manifestPath}\n`);
  process.stdout.write(`Checksum: ${checksumPath}\n`);
  if (databaseLine) process.stdout.write('Temporary credential file removed.\n');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
