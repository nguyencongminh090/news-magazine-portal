// Plain-text bodies only (ADR-003 #1). The token travels in the URL fragment, so it never reaches server logs.
export const RESET_TTL_MINUTES = 30;

export const resetPasswordEmail = ({ to, appBaseUrl, token }) => ({
  to,
  subject: 'Reset your News Portal password',
  text: `Someone asked to reset the password for your News Portal account.

Open this link within ${RESET_TTL_MINUTES} minutes to choose a new password:
${appBaseUrl}/reset-password#token=${token}

If you did not ask for this, ignore this email; your password stays the same.
`,
});

export const VERIFY_TTL_HOURS = 24;

export const verifyEmailEmail = ({ to, appBaseUrl, token }) => ({
  to,
  subject: 'Confirm your News Portal email address',
  text: `Please confirm that this address belongs to your News Portal account.

Open this link within ${VERIFY_TTL_HOURS} hours to confirm it:
${appBaseUrl}/verify-email#token=${token}

If you did not create a News Portal account, ignore this email.
`,
});
