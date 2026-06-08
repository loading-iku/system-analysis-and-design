export const STUDENT_EMAIL_DOMAIN = "stu.iku.edu.tr";
export const STUDENT_EMAIL_SUFFIX = `@${STUDENT_EMAIL_DOMAIN}`;
export const STUDENT_EMAIL_ERROR =
  `Only ${STUDENT_EMAIL_SUFFIX} email addresses are allowed.`;

type ParsedStudentEmail = {
  email: string;
  studentNumber: string;
  domain: string;
};

export function normalizeStudentEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isAllowedStudentEmail(raw: string): boolean {
  const parsed = parseStudentEmail(raw);
  return parsed?.domain === STUDENT_EMAIL_DOMAIN;
}

export function getStudentNumber(raw: string): string | null {
  return parseStudentEmail(raw)?.studentNumber ?? null;
}

function parseStudentEmail(raw: string): ParsedStudentEmail | null {
  const email = normalizeStudentEmail(raw);
  const parts = email.split("@");

  if (parts.length !== 2) return null;

  const [studentNumber, domain] = parts;
  if (!studentNumber || !domain) return null;

  return { email, studentNumber, domain };
}
