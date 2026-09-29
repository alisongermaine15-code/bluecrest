import fs from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const mergePath = process.argv[2];
if (!mergePath) throw new Error('Usage: node apply-user-merge.mjs PATH_TO_MERGE_JSON');

const reviveValue = value => {
    if (value && typeof value === 'object' && value.__type === 'base64') return Buffer.from(value.value, 'base64');
    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    if (value && typeof value === 'object' && value.__type === 'bigint') return value.value;
    return value;
};
const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;
const merge = JSON.parse(fs.readFileSync(mergePath, 'utf8'), (_key, value) => reviveValue(value));
if (merge.format !== 'bluecrest-user-merge-v1' || !Array.isArray(merge.users)) throw new Error('Unsupported user merge file.');

const databaseUrl = new URL(process.env.DATABASE_URL);
for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) databaseUrl.searchParams.delete(parameter);
const client = new Client({
    connectionString: databaseUrl.toString(),
    ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' },
    connectionTimeoutMillis: 20_000,
    query_timeout: 120_000
});

try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bluecrest_user_merge'))");
    const columns = (await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position
    `)).rows.map(row => row.column_name).filter(column => column !== 'id');
    const existing = new Set((await client.query('SELECT LOWER(TRIM(email)) AS email FROM users WHERE email IS NOT NULL')).rows.map(row => row.email));
    const usedUsernames = new Set((await client.query('SELECT username FROM users WHERE username IS NOT NULL')).rows.map(row => row.username));
    const usedAccountNumbers = new Set((await client.query('SELECT account_number FROM users WHERE account_number IS NOT NULL')).rows.map(row => row.account_number));
    let inserted = 0;
    let skipped = 0;
    let nulledUniqueValues = 0;

    for (const sourceUser of merge.users) {
        const email = String(sourceUser.email || '').trim().toLowerCase();
        if (!email || existing.has(email)) {
            skipped += 1;
            continue;
        }
        const row = Object.fromEntries(Object.entries(sourceUser).filter(([column]) => columns.includes(column)));
        if (row.username && usedUsernames.has(row.username)) {
            row.username = null;
            nulledUniqueValues += 1;
        }
        if (row.account_number && usedAccountNumbers.has(row.account_number)) {
            row.account_number = null;
            nulledUniqueValues += 1;
        }
        row.email = email;
        const insertColumns = columns.filter(column => Object.hasOwn(row, column));
        const values = insertColumns.map(column => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
            `INSERT INTO users (${insertColumns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`,
            values
        );
        existing.add(email);
        if (row.username) usedUsernames.add(row.username);
        if (row.account_number) usedAccountNumbers.add(row.account_number);
        inserted += 1;
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ inserted, skipped, nulledUniqueValues, finalUsers: existing.size }, null, 2));
} catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
} finally {
    await client.end();
}