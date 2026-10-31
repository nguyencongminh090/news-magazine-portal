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
