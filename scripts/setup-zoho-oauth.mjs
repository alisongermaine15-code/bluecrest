import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(workspace, 'zoho-oauth.private');
const outputPath = path.join(workspace, 'zoho-railway.private');

function readPrivateEnvironment(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing private setup file: ${filePath}`);
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

function requireValue(environment, name) {
  const value = String(environment[name] || '').trim();
  if (!value || value.startsWith('PASTE_')) throw new Error(`${name} is missing from zoho-oauth.private.`);
  if (/[\r\n]/.test(value)) throw new Error(`${name} must be a single-line value.`);
  return value;
}

async function readJson(response, operation) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Zoho ${operation} failed: ${detail}`);
  }
  return payload;
}

function collectEmailAddresses(value, addresses = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
      addresses.add(match.toLowerCase());
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectEmailAddresses(item, addresses);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectEmailAddresses(item, addresses);
  }
  return addresses;
}

const environment = readPrivateEnvironment(inputPath);
const clientId = requireValue(environment, 'ZOHO_CLIENT_ID');
const clientSecret = requireValue(environment, 'ZOHO_CLIENT_SECRET');
const authorizationCode = requireValue(environment, 'ZOHO_AUTHORIZATION_CODE');
const senderEmail = requireValue(environment, 'MAIL_FROM');
const accountsUrl = String(environment.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com').replace(/\/$/, '');
const mailApiUrl = String(environment.ZOHO_MAIL_API_URL || 'https://mail.zoho.com').replace(/\/$/, '');

const tokenResponse = await fetch(`${accountsUrl}/oauth/v2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code'
  }),
  signal: AbortSignal.timeout(20_000)
});
const tokens = await readJson(tokenResponse, 'authorization-code exchange');
if (!tokens.refresh_token || !tokens.access_token) {
  throw new Error('Zoho did not return both refresh_token and access_token. Generate a new Self Client code and try once more.');
}

const accountsResponse = await fetch(`${mailApiUrl}/api/accounts`, {
  headers: {
    Accept: 'application/json',
    Authorization: `Zoho-oauthtoken ${tokens.access_token}`
  },
  signal: AbortSignal.timeout(20_000)
});
const accountsPayload = await readJson(accountsResponse, 'mail-account verification');
const accounts = (Array.isArray(accountsPayload.data) ? accountsPayload.data : [accountsPayload.data])
  .filter(account => account && (account.accountId || account.accountID || account.id));
const matched = accounts.find(account => collectEmailAddresses(account).has(senderEmail.toLowerCase()))
  || (accounts.length === 1 ? accounts[0] : null);
if (!matched) {
  throw new Error(`No Zoho Mail account or alias matches MAIL_FROM=${senderEmail}.`);
}
const accountId = String(matched.accountId || matched.accountID || matched.id);

const railwayVariables = [
  `ZOHO_CLIENT_ID=${clientId}`,
  `ZOHO_CLIENT_SECRET=${clientSecret}`,
  `ZOHO_REFRESH_TOKEN=${tokens.refresh_token}`,
  `ZOHO_ACCOUNT_ID=${accountId}`,
  `MAIL_FROM=${senderEmail}`,
  'MAIL_FROM_NAME=Blue Crest Support',
  `ZOHO_ACCOUNTS_URL=${accountsUrl}`,
  `ZOHO_MAIL_API_URL=${mailApiUrl}`,
  ''
].join('\n');
fs.writeFileSync(outputPath, railwayVariables, { encoding: 'utf8', mode: 0o600 });

process.stdout.write(`Zoho OAuth and MAIL_FROM verified successfully.\n`);
process.stdout.write(`Matched Zoho account ID: ${accountId}\n`);
process.stdout.write(`Private Railway variables written to: ${outputPath}\n`);
process.stdout.write('The refresh token was intentionally not printed.\n');
