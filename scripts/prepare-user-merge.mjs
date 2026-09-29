import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupDirectory = path.join(workspace, 'emergency-backups', 'neon-export');
const defaultArchives = [
    'bluecrest-neon-data-2026-09-06T113746-669Z.json.gz',
    'bluecrest-neon-data-2026-09-06T101548-830Z.json.gz',
    'bluecrest-neon-data-2026-08-12T195301-920Z.json.gz'
];
const outputPath = path.resolve(process.argv[2] || path.join(backupDirectory, 'user-merge.json'));

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const reviveValue = value => {
    if (value && typeof value === 'object' && value.__type === 'base64') return Buffer.from(value.value, 'base64');
    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    if (value && typeof value === 'object' && value.__type === 'bigint') return value.value;
    return value;
};

function loadArchive(name) {
    const archivePath = path.join(backupDirectory, name);
    const archive = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivePath)), (_key, value) => reviveValue(value));
    if (archive.format !== 'bluecrest-postgres-rescue-v1' || !archive.tables?.users) {
        throw new Error(`Unsupported archive or missing users table: ${name}`);
    }
    return archive.tables.users.rows;
}

const byEmail = new Map();
const conflicts = [];
for (const archiveName of defaultArchives) {
    for (const sourceUser of loadArchive(archiveName)) {
        const email = normalizeEmail(sourceUser.email);
        if (!email) continue;
        const user = Object.fromEntries(Object.entries(sourceUser).map(([key, value]) => [key, reviveValue(value)]));
        const existing = byEmail.get(email);
        if (existing) {
            conflicts.push({ email, kept: existing.source, skipped: archiveName });
            continue;
        }
        byEmail.set(email, { source: archiveName, user });
    }
}

const users = [...byEmail.values()].map(({ user }) => user);
fs.writeFileSync(outputPath, JSON.stringify({
    format: 'bluecrest-user-merge-v1',
    generated_at: new Date().toISOString(),
    policy: 'Deduplicate normalized email addresses; archive order is authoritative.',
    archives: defaultArchives,
    users,
    conflicts
}, null, 2) + '\n');

console.log(JSON.stringify({ output: outputPath, users: users.length, duplicateCandidates: conflicts.length }, null, 2));