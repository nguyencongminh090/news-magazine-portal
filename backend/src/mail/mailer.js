import nodemailer from 'nodemailer';

export const MAIL_TRANSPORTS = ['log', 'smtp'];

/**
 * ADR-003 #1: one interface, `send({ to, subject, text })`. `smtp` works with any relay (or Mailpit locally) via SMTP_URL;
 * `log` prints the message for dev/test and is refused in production by loadConfig.
 */
export function createMailer({ transport = 'log', smtpUrl, from = 'News Portal <no-reply@localhost>', log = console.log, createTransport = nodemailer.createTransport } = {}) {
  if (transport === 'smtp') {
    const smtp = createTransport(smtpUrl);
    return { send: async ({ to, subject, text }) => { await smtp.sendMail({ from, to, subject, text }); } };
  }
  if (transport === 'log') {
    return { send: async ({ to, subject, text }) => log(`[mail:log] to=${to} subject=${subject}\n${text}`) };
  }
  throw new Error(`Unknown mail transport: ${transport}`);
}
