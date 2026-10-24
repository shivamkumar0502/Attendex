// Validate SMTP transport without printing credentials or sending account tokens.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const nodemailer = require('nodemailer');

const required = ['SMTP_HOST', 'MAIL_FROM', 'APP_ORIGIN'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw Error(`Missing configuration: ${missing.join(', ')}`);
const origin = new URL(process.env.APP_ORIGIN);
if (origin.protocol !== 'https:' || origin.username || origin.password)
  throw Error('APP_ORIGIN must be a public HTTPS origin without credentials.');
if (origin.pathname !== '/' || origin.search || origin.hash)
  throw Error('APP_ORIGIN must contain only an origin.');
const port = Number(process.env.SMTP_PORT || 587);
if (![465, 587].includes(port)) throw Error('Use SMTP TLS port 465 or STARTTLS port 587.');
if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD))
  throw Error('Configure both SMTP_USER and SMTP_PASSWORD.');
if (!/^[a-f0-9]{64}$/i.test(process.env.ACCOUNT_MAIL_KEY || process.env.BIOMETRIC_KEY || ''))
  throw Error('Configure a stable 64-hex ACCOUNT_MAIL_KEY or BIOMETRIC_KEY.');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465,
  requireTLS: port === 587,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
});
try {
  await transport.verify();
  console.log('SMTP connection and authentication passed. Inbox delivery has not been verified.');
  if (process.env.MAIL_TEST_TO) {
    if (process.env.MAIL_TEST_CONFIRM !== 'SEND_TEST_EMAIL')
      throw Error('Sending requires MAIL_TEST_CONFIRM=SEND_TEST_EMAIL for an operator-owned MAIL_TEST_TO.');
    const result = await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TEST_TO,
      subject: 'Attendex operator delivery check',
      text: 'This is an operator-requested Attendex SMTP delivery test. No account data or recovery tokens are included.',
    });
    if (result.rejected?.length || !result.accepted?.length)
      throw Error('SMTP server did not accept the test recipient.');
    console.log('Test accepted by SMTP server. Confirm inbox/spam delivery manually before acceptance.');
  }
} catch {
  console.error('SMTP check failed. Review private provider settings, TLS, authentication and sender verification.');
  process.exitCode = 1;
} finally {
  transport.close();
}
