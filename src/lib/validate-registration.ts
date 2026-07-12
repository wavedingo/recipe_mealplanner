export interface RegistrationInput {
  email: string;
  name: string;
  password: string;
}

export type RegistrationValidation =
  | { ok: true; value: RegistrationInput }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(body: unknown): RegistrationValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }
  const data = body as Record<string, unknown>;

  const email =
    typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'A valid email is required' };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Name is required' };
  }

  const password = typeof data.password === 'string' ? data.password : '';
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  return { ok: true, value: { email, name, password } };
}
