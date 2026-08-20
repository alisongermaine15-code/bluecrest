const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcrypt');
const { PassThrough } = require('node:stream');

const databasePath = path.join(__dirname, 'financial-flows.test.db');
const supportUploadPath = path.join(__dirname, 'financial-flows-support-uploads');
fs.rmSync(databasePath, { force: true });
fs.rmSync(supportUploadPath, { force: true, recursive: true });
process.env.SQLITE_DB_PATH = databasePath;
process.env.SUPPORT_UPLOAD_DIR = supportUploadPath;
delete process.env.DATABASE_URL;

const initializeDatabase = require('../src/database/init');
const db = require('../src/database/db');
const sqlite = require('../src/database/sqlite');
const userRepository = require('../src/repositories/user.repository');
const transferRepository = require('../src/repositories/transfer.repository');
const transactionRepository = require('../src/repositories/transaction.repository');
const loanRepository = require('../src/repositories/loan.repository');
const transferService = require('../src/services/transfer.service');
const transferVerificationService = require('../src/services/transfer-verification.service');
const userService = require('../src/services/user.service');
const authService = require('../src/services/auth.service');
const ledgerService = require('../src/services/ledger.service');
const transactionService = require('../src/services/transaction.service');
const loanService = require('../src/services/loan.service');
const withdrawalService = require('../src/services/withdrawal.service');
const reconciliationService = require('../src/services/reconciliation.service');
const notificationService = require('../src/services/notification.service');
const emailService = require('../src/services/email.service');
const supportRoutes = require('../src/routes/support.routes');
const transferEmails = [];
const transferStatusEmails = [];
const accountRestrictionEmails = [];
const originalTransferEmail = emailService.sendTransferReceivedEmail;
const originalTransferStatusEmail = emailService.sendTransferStatusEmail;
const originalAccountRestrictionEmail = emailService.sendAccountRestrictionEmail;

async function createUser(id, accountNumber, email, pin = '1234') {
    const password = await bcrypt.hash('Password123!', 4);
    const transferPin = await bcrypt.hash(pin, 4);

    await db.query(
        `INSERT INTO users (
            id, account_number, first_name, last_name, email, password,
            preferred_currency, balance, transfer_pin, transfer_flow,
            kyc_status, status, role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', 'VERIFIED', 'ACTIVE', 'USER')`,
        [id, accountNumber, 'Test', `User${id}`, email, password, 'USD', transferPin]
    );

    await ledgerService.postEntry({
        user_id: id,
        reference: `OPENING-${id}`,
        type: 'CREDIT',
        category: 'opening_balance',
        amount: 1000,
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Test opening balance'
    });

    return userRepository.findUserById(id);
}

async function verificationToken(userId, suffix) {
    const result = await db.query(
        `INSERT INTO transfer_verification_codes
         (user_id, code_hash, code_last_four, status, created_by)
         VALUES (?, 'test-hash', '0000', 'ACTIVE', 1)`,
        [userId]
    );
    const codeId = Number(result.lastInsertRowid);
    const token = `test-verification-${userId}-${suffix}`;

    await db.query(
        `INSERT INTO transfer_verification_sessions
         (user_id, code_id, token, expires_at)
         VALUES (?, ?, ?, ?)`,
        [userId, codeId, token, new Date(Date.now() + 60_000).toISOString()]
    );

    return token;
}

test.before(async () => {
    emailService.sendTransferReceivedEmail = async (recipient, sender, transfer) => {
        transferEmails.push({ recipient, sender, transfer });
    };
    emailService.sendTransferStatusEmail = async (user, transfer, status) => {
        transferStatusEmails.push({ user, transfer, status });
    };
    emailService.sendAccountRestrictionEmail = async user => {
        accountRestrictionEmails.push(user);
    };
    await initializeDatabase();
    await createUser(2, '2000000002', 'sender@example.com');
    await createUser(3, '2000000003', 'recipient@example.com');
});

test.after(() => {
    emailService.sendTransferReceivedEmail = originalTransferEmail;
    emailService.sendTransferStatusEmail = originalTransferStatusEmail;
    emailService.sendAccountRestrictionEmail = originalAccountRestrictionEmail;
    sqlite.close();
    fs.rmSync(databasePath, { force: true });
    fs.rmSync(supportUploadPath, { force: true, recursive: true });
});

test('invalid transfer PIN creates no transfer or ledger entry', async () => {
    const sender = await userRepository.findUserById(2);
    const beforeTransfers = await transferRepository.getUserTransfers(sender.id);
    const beforeTransactions = await transactionRepository.getUserTransactions(sender.id);

    await assert.rejects(
        transferService.createTransfer(sender, {
            transfer_type: 'EXTERNAL',
            recipient_name: 'Example Recipient',
            recipient_bank: 'Example Bank',
            recipient_account_number: '9999999999',
            amount: 25,
            pin: '9999',
            verification_token: 'unused'
        }),
        /Invalid transfer PIN/
    );

    assert.equal((await transferRepository.getUserTransfers(sender.id)).length, beforeTransfers.length);
    assert.equal((await transactionRepository.getUserTransactions(sender.id)).length, beforeTransactions.length);
});

test('cross-border insurance flow verifies the transfer PIN before requesting its code', async () => {
    const sender = await userRepository.findUserById(2);

    await assert.rejects(
        transferVerificationService.verifyPin(sender, '9999'),
        /Invalid transfer PIN/
    );
    assert.deepEqual(
        await transferVerificationService.verifyPin(sender, '1234'),
        { verified: true }
    );
});

test('admin savings balance persists, is returned in user lists, and does not change checking balance', async () => {
    const before = await userRepository.findUserById(2);
    await userService.updateUser(2, { savings_balance: 2750.50 });

    const saved = await userRepository.findUserById(2);
    const listed = (await userService.fetchUsers()).find(user => Number(user.id) === 2);

    assert.equal(Number(saved.savings_balance), 2750.50);
    assert.equal(Number(listed.savings_balance), 2750.50);
    assert.equal(Number(saved.balance), Number(before.balance));
});

test('admin recovery recreates a full active profile and requires first-login email confirmation', async () => {
    const recovered = await userService.registerRecoveredUser({
        first_name: 'Maria',
        last_name: 'Teresa',
        username: 'mariateresa-recovered',
        email: 'maria.recovered@example.com',
        phone: '+12025550119',
        password: 'Temporary123!',
        account_number: '3000000004',
        account_type: 'CHECKING',
        preferred_currency: 'USD',
        date_of_birth: '1985-06-14',
        gender: 'FEMALE',
        country: 'United States of America',
        state: 'New York',
        zip_code: '10001',
        marital_status: 'MARRIED',
        occupation: 'Consultant',
        address: '100 Recovery Avenue, New York, NY',
        government_id_number: 'RECOVERY-ID-1',
        created_at: '2021-04-05T10:30',
        force_password_change: true
    }, 1);

    assert.equal(recovered.status, 'ACTIVE');
    assert.equal(Number(recovered.email_verified), 0);
    assert.equal(recovered.account_number, '3000000004');
    assert.equal(recovered.address, '100 Recovery Avenue, New York, NY');
    assert.equal(recovered.requires_email_confirmation, true);
    assert.equal(Number(recovered.force_password_change), 1);

    await transactionService.createBatchTransactions([
        {
            user_id: recovered.id,
            reference: 'RECOVERY-MARIA-CREDIT-1',
            type: 'CREDIT',
            amount: 500,
            transaction_date: '2024-05-15T09:30',
            description: 'Account Deposit'
        },
        {
            user_id: recovered.id,
            reference: 'RECOVERY-MARIA-CREDIT-2',
            type: 'CREDIT',
            amount: 250,
            transaction_date: '2024-05-16T14:45',
            description: 'Account Deposit'
        }
    ], 1);

    assert.equal(Number((await userRepository.findUserById(recovered.id)).balance), 750);
    const recoveredCredit = await transactionRepository.getTransactionByReference('RECOVERY-MARIA-CREDIT-1');
    assert.equal(recoveredCredit.transaction_date, '2024-05-15T09:30');

    const login = await authService.login('maria.recovered@example.com', 'Temporary123!');
    assert.ok(login.challenge_token);
    assert.equal(login.requires_login_code_setup, true);
});

test('invalid or unaffordable transfer amounts create no ledger entry', async () => {
    const sender = await userRepository.findUserById(2);
    const beforeTransactions = await transactionRepository.getUserTransactions(sender.id);

    await assert.rejects(
        transferService.createTransfer(sender, {
            transfer_type: 'EXTERNAL',
            amount: 'not-a-number'
        }),
        /greater than zero/
    );

    await assert.rejects(
        transferService.createTransfer(sender, {
            transfer_type: 'EXTERNAL',
            amount: 5000,
            pin: '1234'
        }),
        /Insufficient available balance/
    );

    assert.equal((await transactionRepository.getUserTransactions(sender.id)).length, beforeTransactions.length);
});

test('admin reversal creates an opposite ledger entry and restores the balance', async () => {
    const balanceBefore = Number((await userRepository.findUserById(2)).balance);
    const original = await ledgerService.postEntry({
        user_id: 2,
        reference: 'ADMIN-REVERSAL-TEST',
        type: 'CREDIT',
        category: 'admin_adjustment',
        amount: 125,
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Reversal test credit',
        created_by: 1
    });

    assert.equal(Number((await userRepository.findUserById(2)).balance), balanceBefore + 125);

    const result = await ledgerService.reverseEntry(original, 1);
    const storedOriginal = await transactionRepository.getTransactionByReference(original.reference);
    const storedReversal = await transactionRepository.getTransactionByReference(result.reversal.reference);

    assert.equal(storedOriginal.status, 'REVERSED');
    assert.equal(storedReversal.type, 'DEBIT');
    assert.equal(storedReversal.category, 'reversal');
    assert.equal(Number(storedReversal.amount), 125);
    assert.equal(Number((await userRepository.findUserById(2)).balance), balanceBefore);
});

test('pending external transfer reserves funds and completion debits exactly once', async () => {
    const statusEmailCount = transferStatusEmails.length;
    const sender = await userRepository.findUserById(2);
    const token = await verificationToken(sender.id, 'external');
    const transfer = await transferService.createTransfer(sender, {
        transfer_type: 'EXTERNAL',
        recipient_name: 'Example Recipient',
        recipient_bank: 'Example Bank',
        recipient_account_number: '9999999999',
        amount: 250,
        description: 'External test',
        pin: '1234',
        verification_token: token
    });

    assert.equal(transfer.status, 'PENDING');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(transferStatusEmails.length, statusEmailCount + 1);
    assert.equal(transferStatusEmails.at(-1).status, 'PENDING');
    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), 750);

    await transferService.completeTransfer(transfer.id);
    await transferService.completeTransfer(transfer.id);

    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), 750);
    const entries = (await transactionRepository.getUserTransactions(sender.id))
        .filter(entry => entry.reference === `TXN-TRF-${transfer.id}-DEBIT`);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 'COMPLETED');
    assert.equal(entries[0].description, 'Example Recipient · 9999999999');
});

test('admin restriction of a pending transfer emails its sender once', async () => {
    const sender = await userRepository.findUserById(2);
    const token = await verificationToken(sender.id, 'restriction');
    const transfer = await transferService.createTransfer(sender, {
        transfer_type: 'EXTERNAL',
        recipient_name: 'Restricted Recipient',
        recipient_bank: 'Example Bank',
        recipient_account_number: '7777777777',
        amount: 10,
        pin: '1234',
        verification_token: token
    });
    await new Promise(resolve => setImmediate(resolve));
    const beforeRestriction = transferStatusEmails.length;

    const restricted = await transferService.changeTransferStatus(transfer.id, 'RESTRICTED');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(restricted.status, 'RESTRICTED');
    assert.equal(transferStatusEmails.length, beforeRestriction + 1);
    assert.equal(transferStatusEmails.at(-1).status, 'RESTRICTED');
    assert.equal(transferStatusEmails.at(-1).user.id, sender.id);
});

test('rejecting a pending transfer releases reserved funds', async () => {
    const sender = await userRepository.findUserById(2);
    const startingBalance = Number(sender.balance);
    const token = await verificationToken(sender.id, 'rejection');
    const transfer = await transferService.createTransfer(sender, {
        transfer_type: 'EXTERNAL',
        recipient_name: 'Rejected Recipient',
        recipient_bank: 'Example Bank',
        recipient_account_number: '8888888888',
        amount: 20,
        pin: '1234',
        verification_token: token
    });

    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), startingBalance - 20);

    await transferService.changeTransferStatus(transfer.id, 'REJECTED');

    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), startingBalance);
    const entry = await transactionRepository.getTransactionByReference(
        `TXN-TRF-${transfer.id}-DEBIT`
    );
    assert.equal(entry.status, 'DECLINED');
});

test('admin recovery reconstructs a pending transfer hold and preserves its timestamp', async () => {
    const sender = await userRepository.findUserByEmail('maria.recovered@example.com');
    const startingBalance = Number(sender.balance);
    const transfer = await transferService.recoverTransfer({
        sender_id: sender.id,
        transfer_type: 'EXTERNAL',
        status: 'PENDING',
        amount: 120,
        transaction_date: '2024-05-20T16:15',
        recipient_name: 'Historical Recipient',
        recipient_bank: 'Historical Bank',
        recipient_account_number: '4444444444',
        description: 'Recovered pending transfer'
    }, 1);

    assert.equal(transfer.status, 'PENDING');
    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), startingBalance - 120);
    const debit = await transactionRepository.getTransactionByReference(`TXN-TRF-${transfer.id}-DEBIT`);
    assert.equal(debit.status, 'PENDING');
    assert.equal(debit.transaction_date, '2024-05-20T16:15');

    await transferService.changeTransferStatus(transfer.id, 'COMPLETED');
    await transferService.changeTransferStatus(transfer.id, 'COMPLETED');
    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), startingBalance - 120);

    await transferService.changeTransferStatus(transfer.id, 'REVERSED');
    await transferService.changeTransferStatus(transfer.id, 'REVERSED');
    assert.equal(Number((await userRepository.findUserById(sender.id)).balance), startingBalance);
});

test('internal transfer debits sender and credits recipient exactly once', async () => {
    const sender = await userRepository.findUserById(2);
    const recipient = await userRepository.findUserById(3);
    const token = await verificationToken(sender.id, 'internal');
    const transfer = await transferService.createTransfer(sender, {
        transfer_type: 'INTERNAL',
        recipient_account_number: '2000000003',
        amount: 100,
        description: 'Internal test',
        pin: '1234',
        verification_token: token
    });

    await transferService.completeTransfer(transfer.id);
    await transferService.completeTransfer(transfer.id);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(Number((await userRepository.findUserById(2)).balance), 650);
    assert.equal(Number((await userRepository.findUserById(3)).balance), 1100);
    assert.equal(transferEmails.length, 1);
    assert.equal(transferEmails[0].recipient.id, 3);

    const senderEntry = await transactionRepository.getTransactionByReference(
        `TXN-TRF-${transfer.id}-DEBIT`
    );
    const recipientEntry = await transactionRepository.getTransactionByReference(
        `TXN-TRF-${transfer.id}-CREDIT`
    );
    assert.equal(senderEntry.description, `${recipient.first_name} ${recipient.last_name} · ${recipient.account_number}`);
    assert.equal(recipientEntry.description, `${sender.first_name} ${sender.last_name} · ${sender.account_number}`);
});

test('loan disbursement credits exactly once', async () => {
    const borrower = await userRepository.findUserById(2);
    await assert.rejects(
        loanService.createLoan(borrower, {
            requested_amount: 401,
            purpose: 'Over current eligibility'
        }),
        /cannot exceed 400/
    );

    const loan = await loanRepository.createLoan({
        user_id: 2,
        requested_amount: 400,
        purpose: 'Test',
        status: 'READY_FOR_DISBURSEMENT',
        fee_status: 'PAID'
    });

    await loanService.disburseLoan(loan.id, 1);
    await loanService.disburseLoan(loan.id, 1);

    assert.equal(Number((await userRepository.findUserById(2)).balance), 1050);
});

test('withdrawal completion debits exactly once', async () => {
    const user = await userRepository.findUserById(2);
    const destination = await withdrawalService.saveDestination(user, {
        method: 'PAYPAL',
        label: 'Test PayPal',
        details: { email: 'payments@example.com' },
        is_preferred: true
    });
    const withdrawal = await withdrawalService.requestWithdrawal(user, {
        destination_id: destination.id,
        amount: 50
    });

    await withdrawalService.updateStatus({ id: 1 }, withdrawal.id, 'COMPLETED');
    await withdrawalService.updateStatus({ id: 1 }, withdrawal.id, 'COMPLETED');

    assert.equal(Number((await userRepository.findUserById(2)).balance), 1000);
});

test('withdrawal destinations reject passwords, PINs and full card credentials', async () => {
    const user = await userRepository.findUserById(2);

    await assert.rejects(
        withdrawalService.saveDestination(user, {
            method: 'PAYPAL',
            label: 'Unsafe PayPal',
            details: {
                email: 'payments@example.com',
                password: 'must-never-be-stored'
            }
        }),
        /must not be collected or stored/
    );

    await assert.rejects(
        withdrawalService.saveDestination(user, {
            method: 'CARD',
            label: 'Unsafe Card',
            details: {
                cardholder_name: 'Test User',
                last_four: '1234',
                provider_reference: 'processor-token',
                cvv: '123'
            }
        }),
        /must not be collected or stored/
    );
});

test('completed ledger entries reconcile with stored balances', async () => {
    const senderResult = await reconciliationService.reconcileUser(2);
    const recipientResult = await reconciliationService.reconcileUser(3);

    assert.equal(senderResult.reconciled, true);
    assert.equal(recipientResult.reconciled, true);
});

test('admin notifications are delivered and can be marked read', async () => {
    const unreadBefore = await notificationService.getUnreadCount(2);
    const result = await notificationService.sendNotification(
        { id: 1, role: 'ADMIN' },
        {
            user_ids: [2],
            title: 'Test notification',
            message: 'Notification route data is working.',
            type: 'INFO',
            action_link: '/history'
        }
    );

    assert.equal(result.recipient_count, 1);
    const notifications = await notificationService.listForUser(2);
    assert.equal(notifications[0].title, 'Test notification');
    assert.equal(Number(notifications[0].is_read), 0);
    assert.equal(await notificationService.getUnreadCount(2), unreadBefore + 1);

    const marked = await notificationService.markRead(notifications[0].id, 2);
    assert.equal(Number(marked.is_read), 1);
    assert.equal(await notificationService.getUnreadCount(2), unreadBefore);
});

test('customer support messages remain in one thread for customer and admin replies', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await db.query(`INSERT INTO sessions (user_id, token, expires_at) VALUES (3, 'support-customer', ?)`, [expiresAt]);
    await db.query(`INSERT INTO sessions (user_id, token, expires_at) VALUES (1, 'support-admin', ?)`, [expiresAt]);
    await db.query(`INSERT INTO sessions (user_id, token, expires_at) VALUES (2, 'support-other', ?)`, [expiresAt]);
    const response = () => ({ status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } });

    let res = response();
    await supportRoutes({ method: 'POST', url: '/api/v1/support/messages', headers: { authorization: 'Bearer support-customer' } }, res, {
        message: 'I need transfer help.',
        attachment: {
            name: 'transfer-error.png',
            data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        }
    });
    assert.equal(res.status, 201);
    assert.equal(fs.readdirSync(supportUploadPath).length, 1);
    const adminNotice = (await notificationService.listForUser(1)).find(item => item.title.includes('Support message from'));
    assert.ok(adminNotice);
    assert.match(adminNotice.action_link, /^\/admin\?support=\d+$/);

    res = response();
    await supportRoutes({ method: 'GET', url: '/api/v1/admin/support/conversations', headers: { authorization: 'Bearer support-admin' } }, res, {});
    assert.equal(res.status, 200);
    const conversation = res.payload.data.find(item => Number(item.user_id) === 3);
    assert.ok(conversation);

    res = response();
    await supportRoutes({ method: 'POST', url: `/api/v1/admin/support/conversations/${conversation.id}`, headers: { authorization: 'Bearer support-admin' } }, res, { message: 'Support has received your message.' });
    assert.equal(res.status, 201);

    res = response();
    await supportRoutes({ method: 'GET', url: '/api/v1/support/conversation', headers: { authorization: 'Bearer support-customer' } }, res, {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.payload.data.messages.map(item => item.sender_role), ['USER', 'ADMIN']);
    assert.equal(res.payload.data.messages[0].attachments.length, 1);
    assert.equal(res.payload.data.messages[0].attachments[0].original_name, 'transfer-error.png');

    const attachmentId = res.payload.data.messages[0].attachments[0].id;
    const attachmentResponse = new PassThrough();
    const attachmentChunks = [];
    attachmentResponse.status = 0;
    attachmentResponse.writeHead = function (status, headers) { this.status = status; this.responseHeaders = headers; };
    attachmentResponse.on('data', chunk => attachmentChunks.push(chunk));
    const attachmentFinished = new Promise(resolve => attachmentResponse.on('finish', resolve));
    await supportRoutes({ method: 'GET', url: `/api/v1/support/attachments/${attachmentId}`, headers: { authorization: 'Bearer support-customer' } }, attachmentResponse, {});
    await attachmentFinished;
    assert.equal(attachmentResponse.status, 200);
    assert.equal(attachmentResponse.responseHeaders['Content-Type'], 'image/png');
    assert.ok(Buffer.concat(attachmentChunks).length > 8);

    res = response();
    await supportRoutes({ method: 'GET', url: `/api/v1/support/attachments/${attachmentId}`, headers: { authorization: 'Bearer support-other' } }, res, {});
    assert.equal(res.status, 403);

    res = response();
    await supportRoutes({ method: 'POST', url: '/api/v1/support/messages', headers: { authorization: 'Bearer support-customer' } }, res, {
        attachment: { name: 'fake.png', data_url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==' }
    });
    assert.equal(res.status, 400);
    const replyNotice = (await notificationService.listForUser(3)).find(item => item.title === 'New support reply');
    assert.equal(replyNotice.action_link, '/support');
});

test('admin-created personal transactions use account credit wording', async () => {
    const transaction = await ledgerService.postEntry({
        user_id: 3,
        type: 'CREDIT',
        amount: 25000,
        currency: 'USD',
        description: 'Payroll adjustment',
        transaction_date: '2026-07-19',
        created_by: 1,
        origin_name: 'Exon Oil',
        origin_bank: 'Atlantic Commercial Bank',
        origin_account_number: '9876543210'
    });
    const account = (await db.query(`SELECT account_kind FROM accounts WHERE id = ?`, [transaction.account_id]))[0];
    const userNotifications = await notificationService.listForUser(3);
    const notification = userNotifications.find(item => item.created_by === 1 && item.message.includes('Payroll adjustment'));

    assert.notEqual(account?.account_kind, 'JOINT');
    assert.equal(notification.title, 'Account credited');
    assert.match(notification.message, /Your account was credited with \$25,000\.00/);
    assert.match(notification.message, /July 19, 2026/);
    assert.match(notification.message, /Description: Payroll adjustment/);
    assert.match(notification.message, /From: Exon Oil — Atlantic Commercial Bank, account ending 3210/);
    assert.equal(notification.action_link, '/history');
    assert.doesNotMatch(notification.message, /joint|shared|System Admin/i);
    assert.equal(transaction.origin_name, 'Exon Oil');
    assert.equal(transaction.origin_bank, 'Atlantic Commercial Bank');
    assert.equal(transaction.origin_account_number, '9876543210');
});

test('email settings expose environment fallback and validate saved configuration', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'mailer@example.com';
    process.env.SMTP_PASS = 'test-password';
    process.env.MAIL_FROM = 'mailer@example.com';
    process.env.MAIL_FROM_NAME = 'Blue Crest Test';

    const settings = await emailService.getSettings();
    assert.equal(settings.smtp_host, 'smtp.example.com');
    assert.equal(settings.sender_email, 'mailer@example.com');
    assert.equal(settings.has_password, true);

    await assert.rejects(
        emailService.saveSettings(
            { id: 1 },
            { smtp_host: '', smtp_port: 587, sender_email: 'not-an-email' }
        ),
        /SMTP host is required/
    );
});

test('Zoho OAuth errors are reported instead of being hidden as a missing access token', async () => {
    const keys = [
        'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID',
        'ZOHO_ACCOUNTS_URL', 'ZOHO_MAIL_API_URL', 'MAIL_FROM'
    ];
    const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const originalFetch = global.fetch;

    Object.assign(process.env, {
        ZOHO_CLIENT_ID: 'test-client',
        ZOHO_CLIENT_SECRET: 'test-secret',
        ZOHO_REFRESH_TOKEN: 'invalid-refresh',
        ZOHO_ACCOUNT_ID: '12345',
        ZOHO_ACCOUNTS_URL: 'https://accounts.example.test',
        ZOHO_MAIL_API_URL: 'https://mail.example.test',
        MAIL_FROM: 'sender@example.test'
    });
    global.fetch = async () => new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

    try {
        await assert.rejects(
            emailService.sendEmail({ to: 'recipient@example.test', subject: 'Zoho test', text: 'Hello' }),
            /ZOHO_REFRESH_TOKEN was rejected/
        );
    } finally {
        global.fetch = originalFetch;
        for (const key of keys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});

test('Zoho API is preferred over SMTP and sends through HTTPS', async () => {
    const keys = [
        'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID',
        'ZOHO_ACCOUNTS_URL', 'ZOHO_MAIL_API_URL', 'MAIL_FROM'
    ];
    const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const originalFetch = global.fetch;
    const requests = [];

    Object.assign(process.env, {
        ZOHO_CLIENT_ID: 'test-client',
        ZOHO_CLIENT_SECRET: 'test-secret',
        ZOHO_REFRESH_TOKEN: 'test-refresh',
        ZOHO_ACCOUNT_ID: '12345',
        ZOHO_ACCOUNTS_URL: 'https://accounts.example.test',
        ZOHO_MAIL_API_URL: 'https://mail.example.test',
        MAIL_FROM: 'sender@example.test'
    });
    global.fetch = async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith('/oauth/v2/token')) {
            return new Response(JSON.stringify({ access_token: 'test-access', expires_in: 3600 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({
            status: { code: 200, description: 'success' },
            data: { messageId: 'message-1' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
        const result = await emailService.sendEmail({
            to: 'recipient@example.test',
            subject: 'Zoho test',
            html: '<p>Hello</p>'
        });
        assert.equal(result.provider, 'zoho_api');
        assert.equal(result.messageId, 'message-1');
        assert.equal(requests.length, 2);
        assert.match(requests[1].url, /\/api\/accounts\/12345\/messages$/);
        assert.equal(JSON.parse(requests[1].options.body).toAddress, 'recipient@example.test');

        await emailService.sendSingleTransactionEmail(
            { email: 'recipient@example.test', first_name: 'Recipient', preferred_currency: 'USD' },
            {
                type: 'CREDIT', amount: 25000, currency: 'USD', description: 'Payroll adjustment', reference: 'TXN-EMAIL-1',
                origin_name: 'Exon Oil', origin_bank: 'Atlantic Commercial Bank', origin_account_number: '9876543210'
            }
        );
        const emailPayload = JSON.parse(requests[2].options.body);
        assert.match(emailPayload.content, /Exon Oil/);
        assert.match(emailPayload.content, /Atlantic Commercial Bank/);
        assert.match(emailPayload.content, /9876543210/);
    } finally {
        global.fetch = originalFetch;
        for (const key of keys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});

test('Zoho account ID is discovered from MAIL_FROM when it is not configured', async () => {
    const keys = [
        'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID',
        'ZOHO_ACCOUNTS_URL', 'ZOHO_MAIL_API_URL', 'MAIL_FROM'
    ];
    const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const originalFetch = global.fetch;
    const requests = [];

    Object.assign(process.env, {
        ZOHO_CLIENT_ID: 'discovery-client',
        ZOHO_CLIENT_SECRET: 'discovery-secret',
        ZOHO_REFRESH_TOKEN: 'discovery-refresh',
        ZOHO_ACCOUNTS_URL: 'https://accounts.discovery.test',
        ZOHO_MAIL_API_URL: 'https://mail.discovery.test',
        MAIL_FROM: 'support@example.test'
    });
    delete process.env.ZOHO_ACCOUNT_ID;

    global.fetch = async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith('/oauth/v2/token')) {
            return new Response(JSON.stringify({ access_token: 'discovery-access', expires_in: 3600 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (String(url).endsWith('/api/accounts')) {
            return new Response(JSON.stringify({
                status: { code: 200, description: 'success' },
                data: [
                    { accountId: '11111', emailAddress: 'other@example.test' },
                    { accountId: '67890', sendMailDetails: [{ fromAddress: 'support@example.test' }] }
                ]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
            status: { code: 200, description: 'success' },
            data: { messageId: 'discovered-message' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
        const result = await emailService.sendEmail({
            to: 'recipient@example.test', subject: 'Discovery test', text: 'Hello'
        });
        assert.equal(result.provider, 'zoho_api');
        assert.equal(result.messageId, 'discovered-message');
        assert.equal(requests.length, 3);
        assert.match(requests[2].url, /\/api\/accounts\/67890\/messages$/);
    } finally {
        global.fetch = originalFetch;
        for (const key of keys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});

test('admin-composed emails use the personalized Blue Crest template', async () => {
    const keys = [
        'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID',
        'ZOHO_ACCOUNTS_URL', 'ZOHO_MAIL_API_URL', 'MAIL_FROM'
    ];
    const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const originalFetch = global.fetch;
    const requests = [];

    Object.assign(process.env, {
        ZOHO_CLIENT_ID: 'admin-template-client',
        ZOHO_CLIENT_SECRET: 'admin-template-secret',
        ZOHO_REFRESH_TOKEN: 'admin-template-refresh',
        ZOHO_ACCOUNT_ID: '24680',
        ZOHO_ACCOUNTS_URL: 'https://accounts.admin-template.test',
        ZOHO_MAIL_API_URL: 'https://mail.admin-template.test',
        MAIL_FROM: 'support@example.test'
    });
    global.fetch = async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith('/oauth/v2/token')) {
            return new Response(JSON.stringify({ access_token: 'admin-template-access', expires_in: 3600 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({
            status: { code: 200, description: 'success' },
            data: { messageId: 'admin-template-message' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
        const result = await emailService.sendAdminEmail(
            { id: 1 },
            {
                subject: 'Important account update',
                message: 'First line <important>\nSecond line',
                user_ids: [2]
            }
        );
        assert.equal(result.sent_count, 1);
        assert.equal(result.failed_count, 0);
        const payload = JSON.parse(requests.at(-1).options.body);
        assert.match(payload.content, /Blue Crest Bank/);
        assert.match(payload.content, /Hello Test,/);
        assert.match(payload.content, /First line &lt;important&gt;<br>Second line/);
        assert.match(payload.content, /Blue Crest Support Team/);
        assert.doesNotMatch(payload.content, /First line <important>/);
    } finally {
        global.fetch = originalFetch;
        for (const key of keys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});

test('admin account restriction emails the customer only on transition', async () => {
    const before = accountRestrictionEmails.length;
    await userService.updateUser(3, { transfer_flow: 'RESTRICTED' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(accountRestrictionEmails.length, before + 1);
    assert.equal(accountRestrictionEmails.at(-1).id, 3);

    await userService.updateUser(3, { transfer_flow: 'RESTRICTED' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(accountRestrictionEmails.length, before + 1);
});

test('admin can save and clear a custom inline transfer hold message', async () => {
    const saved = await userService.updateUser(3, {
        transfer_flow: 'AUTHORIZATION_HOLD',
        transfer_hold_message: 'Contact support to review the additional transfer requirement.'
    });
    assert.equal(saved.transfer_flow, 'AUTHORIZATION_HOLD');
    assert.equal(saved.transfer_hold_message, 'Contact support to review the additional transfer requirement.');

    const cleared = await userService.updateUser(3, { transfer_hold_message: '   ' });
    assert.equal(cleared.transfer_hold_message, null);
});

test('authorization hold creates a pending transfer with an immutable clearance fee snapshot', async () => {
    await userService.updateUser(2, {
        transfer_flow: 'AUTHORIZATION_HOLD',
        clearance_fee_amount: 75
    });
    const sender = await userRepository.findUserById(2);

    const transfer = await transferService.createTransfer(sender, {
        transfer_type: 'EXTERNAL',
        recipient_name: 'Clearance Recipient',
        recipient_bank: 'Clearance Bank',
        recipient_account_number: '5500000000',
        amount: 20,
        pin: '1234'
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(transfer.status, 'PENDING');
    assert.equal(transfer.clearance_status, 'AWAITING_PAYMENT');
    assert.equal(Number(transfer.clearance_fee_amount), 75);

    await userService.updateUser(2, { clearance_fee_amount: 95 });
    const unchangedTransfer = await transferRepository.getTransferById(transfer.id);
    assert.equal(Number(unchangedTransfer.clearance_fee_amount), 75);

    const adjustedTransfer = await transferService.changeClearanceFee(transfer.id, 82.5);
    assert.equal(Number(adjustedTransfer.clearance_fee_amount), 82.5);

    const submittedTransfer = await transferService.submitClearanceReceipt(sender, transfer.id, 'btc-test-receipt-123456');
    assert.equal(submittedTransfer.clearance_status, 'AWAITING_CONFIRMATION');
    assert.equal(submittedTransfer.clearance_receipt, 'btc-test-receipt-123456');
    await assert.rejects(
        transferService.submitClearanceReceipt(await userRepository.findUserById(3), transfer.id, 'another-receipt'),
        /access denied/
    );

    const completed = await transferService.changeTransferStatus(transfer.id, 'COMPLETED');
    assert.equal(completed.clearance_status, 'CLEARED');
});
