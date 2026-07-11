const ULAB_EMAIL_DOMAIN = '@ulab.edu.bd';

// Student Google accounts are set up with the student ID in parentheses, e.g. "John Doe (2021-1-60-123)".
// See app/api/attendance/checkin/route.ts for the matching attendance check-in logic.
const STUDENT_ID_PATTERN = /\(([^)]+)\)/;

export function isUlabEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(ULAB_EMAIL_DOMAIN);
}

export function looksLikeStudentName(name: string | null | undefined): boolean {
  return STUDENT_ID_PATTERN.test((name || '').trim());
}

export const GOOGLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  domain: 'Google sign-in requires a @ulab.edu.bd account.',
  student: 'This looks like a student Google account. Teacher accounts cannot be created or linked with a student Google account.',
};
