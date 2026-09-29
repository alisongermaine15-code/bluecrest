import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupRoot = path.join(root, 'emergency-backups');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(backupRoot).filter(f => /\.db$|\.json\.gz$/.test(f));
for (const name of ['railway-backup.db', 'railway-import.db', 'railway-migrated.db']) {
  const f = path.join(root, 'bluecrestback', name);
  if (fs.existsSync(f)) files.push(f);
}
const sources = [];
for (const file of files.sort()) {
  const bytes = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const source = { file: path.relative(root, file), bytes: bytes.length, sha256 };
  let users = [];
  try {
    if (file.endsWith('.gz')) {
      const checksumFile = `${file}.sha256.txt`;
      source.checksum = fs.existsSync(checksumFile)
        ? (fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0].toLowerCase() === sha256 ? 'passed' : 'FAILED')
        : 'missing';
      if (source.checksum === 'FAILED') throw new Error('Checksum mismatch');
      const archive = JSON.parse(zlib.gunzipSync(bytes));
      if (archive.format !== 'bluecrest-postgres-rescue-v1') throw new Error('Unknown archive format');
      source.exported_at = archive.exported_at;
      source.row_counts = Object.fromEntries(Object.entries(archive.tables).map(([name, t]) => [name, t.rows.length]));
      users = archive.tables.users?.rows || [];
    } else {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        source.integrity = db.prepare('PRAGMA integrity_check').all().map(r => r.integrity_check);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
        const qi = s => '"' + s.replaceAll('"', '""') + '"';
        source.row_counts = Object.fromEntries(tables.map(t => [t.name, db.prepare(`SELECT COUNT(*) AS n FROM ${qi(t.name)}`).get().n]));
        if (tables.some(t => t.name === 'users')) users = db.prepare('SELECT id, email, username, account_number FROM users').all();
      } finally { db.close(); }
    }
    source.table_count = Object.keys(source.row_counts).length;
    source.total_rows = Object.values(source.row_counts).reduce((a,b) => a+b, 0);
  } catch (e) { source.error = e.message; }
  sources.push({ source, users });
}
const norm = s => String(s || '').trim().toLowerCase();
const comparisons = [];
for (let i=0; i<sources.length; i++) for (let j=i+1; j<sources.length; j++) {
  const a=sources[i], b=sources[j];
  const emails = new Set(a.users.map(u => norm(u.email)).filter(Boolean));
  const ids = new Map(a.users.map(u => [String(u.id), norm(u.email)]));
  comparisons.push({ a:a.source.file, b:b.source.file,
    identical_file:a.source.sha256 === b.source.sha256,
    shared_user_emails:b.users.filter(u => norm(u.email) && emails.has(norm(u.email))).length,
    conflicting_user_ids:b.users.filter(u => ids.has(String(u.id)) && ids.get(String(u.id)) !== norm(u.email)).length,
    conflicting_account_numbers:b.users.filter(u => u.account_number && a.users.some(v => v.account_number === u.account_number && norm(v.email) !== norm(u.email))).length
  });
}
const report = { generated_at:new Date().toISOString(), note:'Read-only audit. No merges performed. Email overlap is a candidate identity match, not proof. Older backups may contain deleted users. Live local.db and test databases excluded.',
  candidate_unique_emails:new Set(sources.flatMap(s => s.users.map(u => norm(u.email)).filter(Boolean))).size,
  sources:sources.map(s => s.source), comparisons };
const output = path.join(backupRoot, 'neon-export', 'backup-audit.json');
fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:output,candidate_unique_emails:report.candidate_unique_emails,sources:report.sources.map(s => ({file:s.file,users:s.row_counts?.users,rows:s.total_rows,integrity:s.integrity,checksum:s.checksum,error:s.error})),comparisons:comparisons.filter(c => c.identical_file || c.conflicting_user_ids || c.conflicting_account_numbers)},null,2));
