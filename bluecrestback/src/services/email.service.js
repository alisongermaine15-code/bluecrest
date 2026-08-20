const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const db = require('../database/db');
const emailRepository = require('../repositories/email.repository');
const userRepository = require('../repositories/user.repository');

let zohoAccessToken = null;
let zohoAccessTokenExpiresAt = 0;
let zohoAccessTokenKey = '';
let zohoAccountCache = { key: '', accountId: '' };

function zohoConfig() {
    const config = {
        clientId: process.env.ZOHO_CLIENT_ID || '',
        clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
        refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
        accountId: process.env.ZOHO_ACCOUNT_ID || '',
        accountsUrl: (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com').replace(/\/$/, ''),
        mailApiUrl: (process.env.ZOHO_MAIL_API_URL || 'https://mail.zoho.com').replace(/\/$/, ''),
        senderEmail: process.env.MAIL_FROM || ''
    };
    config.enabled = Boolean(
        config.clientId && config.clientSecret && config.refreshToken &&
        config.senderEmail
    );
    return config;
}

async function readJsonResponse(response, operation) {
    const payload = await response.json().catch(() => ({}));
    const apiCode = Number(payload?.status?.code || 0);
    const oauthError = typeof payload?.error === 'string'
        ? payload.error
        : payload?.error?.message || payload?.error?.code;
    if (!response.ok || oauthError || (apiCode && apiCode >= 400)) {
        const invalidRefreshToken = operation === 'authentication' && oauthError === 'invalid_code';
        const description = invalidRefreshToken
            ? 'the configured ZOHO_REFRESH_TOKEN was rejected. Use the refresh_token returned after exchanging a fresh Self Client authorization code, and make sure ZOHO_ACCOUNTS_URL matches your Zoho data center'
            : payload?.error_description || payload?.status?.description || oauthError || payload?.message;
        throw new Error(`Zoho Mail ${operation} failed${description ? `: ${description}` : ` (HTTP ${response.status})`}`);
    }
    return payload;
}

async function getZohoAccessToken() {
    const config = zohoConfig();
    if (!config.enabled) throw new Error('Zoho Mail API settings are incomplete');
    const tokenKey = [config.accountsUrl, config.clientId, config.refreshToken].join('|');
    if (
        zohoAccessToken && zohoAccessTokenKey === tokenKey &&
        Date.now() < zohoAccessTokenExpiresAt
    ) return zohoAccessToken;

    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token'
    });
    const response = await fetch(`${config.accountsUrl}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000)
    });
    const payload = await readJsonResponse(response, 'authentication');
    if (!payload.access_token) throw new Error('Zoho Mail authentication failed: no access token was returned');

    zohoAccessToken = payload.access_token;
    zohoAccessTokenKey = tokenKey;
    zohoAccessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000;
    return zohoAccessToken;
}

function collectEmailAddresses(value, addresses = new Set()) {
    if (typeof value === 'string') {
        const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
        for (const match of matches) addresses.add(match.toLowerCase());
    } else if (Array.isArray(value)) {
        for (const item of value) collectEmailAddresses(item, addresses);
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectEmailAddresses(item, addresses);
    }
    return addresses;
}

async function resolveZohoAccountId(config, accessToken) {
    if (config.accountId) return config.accountId;

    const cacheKey = `${config.mailApiUrl}|${config.senderEmail.toLowerCase()}`;
    if (zohoAccountCache.key === cacheKey && zohoAccountCache.accountId) {
        return zohoAccountCache.accountId;
    }

    const response = await fetch(`${config.mailApiUrl}/api/accounts`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Zoho-oauthtoken ${accessToken}`
        },
        signal: AbortSignal.timeout(15000)
    });
    const payload = await readJsonResponse(response, 'account discovery');
    const accounts = (Array.isArray(payload.data) ? payload.data : [payload.data])
        .filter(account => account && (account.accountId || account.accountID || account.id));
    const senderEmail = config.senderEmail.toLowerCase();
    const matchedAccount = accounts.find(account => collectEmailAddresses(account).has(senderEmail));
    const selectedAccount = matchedAccount || (accounts.length === 1 ? accounts[0] : null);

    if (!selectedAccount) {
        throw new Error(
            `Zoho Mail account discovery could not match MAIL_FROM=${config.senderEmail}. ` +
            'Set ZOHO_ACCOUNT_ID explicitly or use an address/alias owned by this Zoho account.'
        );
    }

    const accountId = String(
        selectedAccount.accountId || selectedAccount.accountID || selectedAccount.id
    );
    zohoAccountCache = { key: cacheKey, accountId };
    return accountId;
}

async function uploadZohoAttachments(config, accessToken, attachments) {
    const uploaded = [];
    for (const attachment of attachments) {
        const filename = String(attachment.filename || 'attachment');
        const url = new URL(`${config.mailApiUrl}/api/accounts/${encodeURIComponent(config.accountId)}/messages/attachments`);
        url.searchParams.set('fileName', filename);
        url.searchParams.set('isInline', 'false');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': attachment.contentType || 'application/octet-stream'
            },
            body: attachment.content,
            signal: AbortSignal.timeout(20000)
        });
        const payload = await readJsonResponse(response, 'attachment upload');
        const item = Array.isArray(payload.data) ? payload.data[0] : payload.data;
        if (!item?.storeName || !item?.attachmentPath) {
            throw new Error('Zoho Mail attachment upload failed: incomplete response');
        }
        uploaded.push({
            storeName: item.storeName,
            attachmentPath: item.attachmentPath,
            attachmentName: item.attachmentName || filename
        });
    }
    return uploaded;
}

async function sendZohoEmail({ to, subject, html, text, attachments = [] }) {
    const config = zohoConfig();
    const accessToken = await getZohoAccessToken();
    config.accountId = await resolveZohoAccountId(config, accessToken);
    const uploadedAttachments = attachments.length
        ? await uploadZohoAttachments(config, accessToken, attachments)
        : [];
    const response = await fetch(
        `${config.mailApiUrl}/api/accounts/${encodeURIComponent(config.accountId)}/messages`,
        {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fromAddress: config.senderEmail,
                toAddress: Array.isArray(to) ? to.join(',') : String(to),
                subject,
                content: html || text || '',
                mailFormat: html ? 'html' : 'plaintext',
                encoding: 'UTF-8',
                ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {})
            }),
            signal: AbortSignal.timeout(20000)
        }
    );
    const payload = await readJsonResponse(response, 'delivery');
    return {
        messageId: payload?.data?.messageId || payload?.data?.messageID || null,
        provider: 'zoho_api'
    };
}

function encryptionKey() {
    const secret = process.env.SMTP_ENCRYPTION_KEY || process.env.APP_SECRET || 'bluecrest-local-development-key';
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(value) {
    if (!value) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(value) {
    if (!value) return '';
    const [iv, tag, payload] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'hex')), decipher.final()]).toString('utf8');
}

async function resolvedSettings() {
    const stored = await emailRepository.getSettings();
    return {
        ...stored,
        smtp_host: stored?.smtp_host || process.env.SMTP_HOST || '',
        smtp_port: Number(stored?.smtp_port || process.env.SMTP_PORT || 587),
        smtp_username: stored?.smtp_username || process.env.SMTP_USER || '',
        smtp_password: stored?.smtp_password_encrypted
            ? decrypt(stored.smtp_password_encrypted)
            : process.env.SMTP_PASS || '',
        smtp_secure: stored
            ? Boolean(stored.smtp_secure)
            : process.env.SMTP_SECURE === 'true',
        sender_email: stored?.sender_email || process.env.MAIL_FROM || '',
        sender_name: stored?.sender_name || process.env.MAIL_FROM_NAME || 'Blue Crest'
    };
}

async function saveSettings(admin, data) {
    const current = await emailRepository.getSettings();
    const passwordEncrypted = data.smtp_password
        ? encrypt(String(data.smtp_password))
        : current?.smtp_password_encrypted ||
            (process.env.SMTP_PASS ? encrypt(process.env.SMTP_PASS) : '');
    const port = Number(data.smtp_port || 587);

    if (!String(data.smtp_host || '').trim()) {
        throw new Error('SMTP host is required');
    }

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('Enter a valid SMTP port');
    }

    if (!String(data.sender_email || '').includes('@')) {
        throw new Error('Enter a valid sender email');
    }

    const saved = await emailRepository.saveSettings({
        smtp_host: String(data.smtp_host || '').trim(),
        smtp_port: port,
        smtp_username: String(data.smtp_username || '').trim(),
        smtp_password_encrypted: passwordEncrypted,
        smtp_secure: Boolean(data.smtp_secure),
        sender_email: String(data.sender_email || '').trim(),
        sender_name: String(data.sender_name || '').trim(),
        updated_by: admin.id
    });
    return sanitizeSettings(saved);
}

function sanitizeSettings(settings) {
    if (!settings) return null;
    const { smtp_password_encrypted, ...safe } = settings;
    return { ...safe, has_password: Boolean(smtp_password_encrypted) };
}

async function createTransporter() {
    const settings = await resolvedSettings();
    if (!settings.smtp_host || !settings.sender_email) throw new Error('SMTP settings are incomplete');

    let connectionHost = settings.smtp_host;
    if (!net.isIP(connectionHost)) {
        try {
            const ipv4Addresses = await dns.promises.resolve4(connectionHost);
            if (ipv4Addresses.length) connectionHost = ipv4Addresses[0];
        } catch (_error) {
            // Let Nodemailer report the original DNS/connection error when IPv4 lookup fails.
        }
    }

    return {
        settings,
        transporter: nodemailer.createTransport({
            host: connectionHost,
            port: Number(settings.smtp_port),
            secure: Boolean(settings.smtp_secure),
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
            tls: {
                servername: settings.smtp_host,
                minVersion: 'TLSv1.2'
            },
            auth: settings.smtp_username
                ? { user: settings.smtp_username, pass: settings.smtp_password }
                : undefined
        })
    };
}

function normalizeEmailError(error) {
    const code = error?.code;
    if (process.env.RAILWAY_PROJECT_ID && ['ENETUNREACH', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code)) {
        const normalized = new Error(
            'The SMTP server is unreachable from Railway. SMTP requires Railway Pro; on Free, Trial, or Hobby use an HTTPS email provider.'
        );
        normalized.code = code;
        return normalized;
    }
    return error;
}

async function sendEmail({ to, subject, html, text, attachments = [] }) {
    if (zohoConfig().enabled) {
        return sendZohoEmail({ to, subject, html, text, attachments });
    }
    const { settings, transporter } = await createTransporter();
    try {
        return await transporter.sendMail({
            from: { address: settings.sender_email, name: settings.sender_name || 'Blue Crest' },
            to,
            subject,
            html,
            text,
            attachments
        });
    } catch (error) {
        throw normalizeEmailError(error);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function emailShell(title, firstName, content) {
    return `
        <div style="background:#f5f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e7eaf0">
                <div style="background:#003399;color:#fff;padding:24px 28px">
                    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Blue Crest Bank</div>
                    <h1 style="font-size:22px;margin:8px 0 0">${escapeHtml(title)}</h1>
                </div>
                <div style="padding:28px">
                    <p style="margin-top:0">Hello ${escapeHtml(firstName || 'Customer')},</p>
                    ${content}
                    <p style="font-size:12px;color:#6b7280;margin:28px 0 0">If you did not expect this message, contact Blue Crest support immediately.</p>
                </div>
            </div>
        </div>`;
}

function money(amount, currency = 'USD') {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: String(currency || 'USD').toUpperCase()
        }).format(Number(amount));
    } catch (_error) {
        return `${currency || 'USD'} ${Number(amount).toFixed(2)}`;
    }
}

async function issueEmailVerification(user, options = {}) {
    if (!user?.id || !user?.email) throw new Error('A valid user is required');
    if (!options.force && Number(user.email_verified) === 1) return { verified: true, already_verified: true };

    const existingRows = await db.query(
        'SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY id DESC',
        [user.id]
    );
    const createdAt = existingRows[0]?.created_at;
    const createdAtText = String(createdAt || '');
    const lastIssuedAt = createdAt instanceof Date
        ? createdAt.getTime()
        : createdAtText
            ? new Date(createdAtText.includes('T') ? createdAtText : `${createdAtText.replace(' ', 'T')}Z`).getTime()
            : 0;
    if (!options.bypassCooldown && options.deliver !== false && lastIssuedAt && Date.now() - lastIssuedAt < 60_000) {
        throw new Error('Please wait one minute before requesting another code');
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await db.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
    await db.query(
        'INSERT INTO email_verifications (user_id, token, expires_at, attempts) VALUES (?, ?, ?, 0)',
        [user.id, codeHash, expiresAt]
    );

    if (options.deliver !== false) {
        const subject = 'Confirm your Blue Crest email address';
        const text = `Hello ${user.first_name || 'Customer'}, your Blue Crest email confirmation code is ${code}. It expires in 30 minutes.`;
        const html = emailShell(subject, user.first_name, `
            <p>Use the confirmation code below to verify your email address.</p>
            <div style="font-size:30px;font-weight:800;letter-spacing:8px;text-align:center;background:#f1f5ff;color:#003399;border-radius:14px;padding:18px;margin:24px 0">${code}</div>
            <p style="color:#4b5563">This code expires in 30 minutes. Never share it with anyone.</p>`);
        await sendEmail({ to: user.email, subject, text, html });
    }

    const result = { verified: false, sent: options.deliver !== false, expires_at: expiresAt };
    if (process.env.NODE_ENV !== 'production') result.development_code = code;
    return result;
}

async function verifyEmailCode(user, rawCode, options = {}) {
    if (!user?.id) throw new Error('Authentication is required');
    if (!options.force && Number(user.email_verified) === 1) return { verified: true, already_verified: true };

    const code = String(rawCode || '').trim();
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit confirmation code');

    const rows = await db.query(
        'SELECT * FROM email_verifications WHERE user_id = ? ORDER BY id DESC',
        [user.id]
    );
    const record = rows[0];
    if (!record) throw new Error('Request a new confirmation code');
    if (new Date(record.expires_at).getTime() < Date.now()) {
        await db.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
        throw new Error('Confirmation code has expired. Request a new one');
    }
    if (Number(record.attempts || 0) >= 5) {
        await db.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
        throw new Error('Too many incorrect attempts. Request a new code');
    }
    if (!await bcrypt.compare(code, record.token)) {
        await db.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [record.id]);
        throw new Error('Invalid confirmation code');
    }

    await db.withTransaction(async () => {
        await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
        await db.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
    });
    return { verified: true };
}

async function sendTransferReceivedEmail(recipient, sender, transfer) {
    if (!recipient?.email || transfer?.transfer_type !== 'INTERNAL') return null;
    const amount = money(transfer.amount, transfer.currency || recipient.preferred_currency);
    const senderName = `${sender?.first_name || ''} ${sender?.last_name || ''}`.trim() || 'another Blue Crest account';
    const subject = `Transfer received: ${amount}`;
    const text = `Hello ${recipient.first_name || 'Customer'}, you received ${amount} from ${senderName}. Reference: ${transfer.reference || transfer.id}.`;
    const html = emailShell('Transfer received', recipient.first_name, `
        <p>A transfer has been credited to your Blue Crest account.</p>
        <div style="background:#f8fafc;border-radius:14px;padding:18px;margin:20px 0">
            <p style="margin:0 0 10px"><strong>Amount:</strong> ${escapeHtml(amount)}</p>
            <p style="margin:0 0 10px"><strong>From:</strong> ${escapeHtml(senderName)}</p>
            <p style="margin:0"><strong>Reference:</strong> ${escapeHtml(transfer.reference || transfer.id)}</p>
        </div>`);
    return sendEmail({ to: recipient.email, subject, text, html });
}

async function sendSingleTransactionEmail(user, transaction) {
    if (!user?.email || !transaction) return null;
    const amount = money(transaction.amount, transaction.currency || user.preferred_currency);
    const isCredit = transaction.type === 'CREDIT';
    const title = isCredit ? 'Account credited' : 'Account debited';
    const subject = `${title}: ${amount}`;
    const source = [transaction.origin_name, transaction.origin_bank].filter(Boolean).join(' — ');
    const sourceText = source
        ? ` From: ${source}${transaction.origin_account_number ? `, account ${transaction.origin_account_number}` : ''}.`
        : '';
    const text = `Hello ${user.first_name || 'Customer'}, your account was ${isCredit ? 'credited' : 'debited'} ${amount}.${sourceText} ${transaction.description || ''} Reference: ${transaction.reference}.`;
    const html = emailShell(title, user.first_name, `
        <p>A single account transaction has been added to your account.</p>
        <div style="background:#f8fafc;border-radius:14px;padding:18px;margin:20px 0">
            <p style="margin:0 0 10px"><strong>Amount:</strong> ${escapeHtml(amount)}</p>
            ${source ? `<p style="margin:0 0 10px"><strong>From:</strong> ${escapeHtml(source)}</p>` : ''}
            ${transaction.origin_account_number ? `<p style="margin:0 0 10px"><strong>Originating account:</strong> ${escapeHtml(transaction.origin_account_number)}</p>` : ''}
            <p style="margin:0 0 10px"><strong>Description:</strong> ${escapeHtml(transaction.description || title)}</p>
            <p style="margin:0"><strong>Reference:</strong> ${escapeHtml(transaction.reference)}</p>
        </div>`);
    return sendEmail({ to: user.email, subject, text, html });
}

async function sendTransferStatusEmail(user, transfer, status) {
    if (!user?.email || !transfer) return null;
    const normalizedStatus = String(status || transfer.status || '').toUpperCase();
    if (!['PENDING', 'RESTRICTED'].includes(normalizedStatus)) return null;

    const amount = money(transfer.amount, transfer.currency || user.preferred_currency);
    const pending = normalizedStatus === 'PENDING';
    const title = pending ? 'Transfer pending review' : 'Transfer restricted';
    const subject = `${title}: ${amount}`;
    const explanation = pending
        ? 'Your transfer was received and is currently pending administrative review. No completed debit will occur until it is approved.'
        : 'Your transfer has been restricted and cannot be completed at this time. Please contact Blue Crest support for assistance.';
    const text = `Hello ${user.first_name || 'Customer'}, ${explanation} Amount: ${amount}. Transfer ID: ${transfer.id}.`;
    const html = emailShell(title, user.first_name, `
        <p>${escapeHtml(explanation)}</p>
        <div style="background:${pending ? '#fffbeb' : '#fff1f2'};border-radius:14px;padding:18px;margin:20px 0">
            <p style="margin:0 0 10px"><strong>Status:</strong> ${normalizedStatus}</p>
            <p style="margin:0 0 10px"><strong>Amount:</strong> ${escapeHtml(amount)}</p>
            <p style="margin:0"><strong>Transfer ID:</strong> ${escapeHtml(transfer.id)}</p>
        </div>`);
    return sendEmail({ to: user.email, subject, text, html });
}

async function sendAccountRestrictionEmail(user) {
    if (!user?.email) return null;
    const subject = 'Important: Your Blue Crest account has been restricted';
    const explanation = 'Your account transfer access has been restricted. To ask about this restriction or restore access, please contact Blue Crest support.';
    const text = `Hello ${user.first_name || 'Customer'}, ${explanation} Please contact Blue Crest support for assistance.`;
    const html = emailShell('Account restricted', user.first_name, `
        <p>${escapeHtml(explanation)}</p>
        <div style="background:#fff1f2;color:#9f1239;border-radius:14px;padding:18px;margin:20px 0">
            <strong>Status: RESTRICTED</strong>
        </div>
        <p>Please contact Blue Crest support if you need assistance.</p>`);
    return sendEmail({ to: user.email, subject, text, html });
}

async function sendAdminEmail(admin, data) {
    const subject = String(data.subject || '').trim();
    const message = String(data.message || '').trim();
    if (!subject || !message) throw new Error('Subject and message are required');
    const users = await userRepository.getAllUsers();
    const ids = new Set((data.user_ids || []).map(Number));
    const recipients = data.send_to_all
        ? users.filter(user => user.role !== 'ADMIN')
        : users.filter(user => ids.has(Number(user.id)));
    if (!recipients.length) throw new Error('Select at least one email recipient');

    const results = [];
    for (const recipient of recipients) {
        const log = await emailRepository.createLog({
            recipient_user_id: recipient.id,
            recipient_email: recipient.email,
            subject,
            sent_by: admin.id
        });
        try {
            const formattedMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
            const html = emailShell(subject, recipient.first_name, `
                <div style="font-size:15px;line-height:1.7;color:#27324a">${formattedMessage}</div>
                <div style="border-top:1px solid #e7eaf0;margin-top:28px;padding-top:20px;color:#4b5563">
                    <p style="margin:0">Regards,</p>
                    <p style="margin:5px 0 0;font-weight:700;color:#003399">Blue Crest Support Team</p>
                </div>`);
            const text = `Hello ${recipient.first_name || 'Customer'},\n\n${message}\n\nRegards,\nBlue Crest Support Team`;
            const info = await sendEmail({ to: recipient.email, subject, html, text });
            await emailRepository.updateLog(log.id, {
                status: 'SENT',
                provider_message_id: info.messageId
            });
            results.push({ email: recipient.email, status: 'SENT' });
        } catch (error) {
            await emailRepository.updateLog(log.id, { status: 'FAILED', error_message: error.message });
            results.push({ email: recipient.email, status: 'FAILED', error: error.message });
        }
    }
    return {
        recipient_count: results.length,
        sent_count: results.filter(item => item.status === 'SENT').length,
        failed_count: results.filter(item => item.status === 'FAILED').length,
        results
    };
}

module.exports = {
    sendEmail,
    issueEmailVerification,
    verifyEmailCode,
    sendTransferReceivedEmail,
    sendSingleTransactionEmail,
    sendTransferStatusEmail,
    sendAccountRestrictionEmail,
    sendAdminEmail,
    saveSettings,
    getSettings: async () => {
        const stored = await emailRepository.getSettings();
        const effective = await resolvedSettings();
        return {
            ...sanitizeSettings(stored),
            delivery_provider: zohoConfig().enabled ? 'ZOHO_API' : 'SMTP',
            smtp_host: effective.smtp_host,
            smtp_port: effective.smtp_port,
            smtp_username: effective.smtp_username,
            smtp_secure: effective.smtp_secure,
            sender_email: effective.sender_email,
            sender_name: effective.sender_name,
            has_password: Boolean(stored?.smtp_password_encrypted || process.env.SMTP_PASS)
        };
    },
    getLogs: emailRepository.getLogs,
    verifySettings: async () => {
        if (zohoConfig().enabled) {
            await getZohoAccessToken();
            return { verified: true, provider: 'ZOHO_API' };
        }
        const { transporter } = await createTransporter();
        try {
            await transporter.verify();
        } catch (error) {
            throw normalizeEmailError(error);
        }
        return { verified: true, provider: 'SMTP' };
    }
};
