import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
// bcryptjs is used instead of bcrypt because it is pure JS (no native addon) and works everywhere.
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';

export async function verifyCredentials(
  emailRaw: unknown,
  passwordRaw: unknown
): Promise<{ id: string; name: string | null; email: string } | null> {
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';
  if (!email || !password) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  // NULL passwordHash (e.g. unseeded placeholder user) can never password-login.
  if (!user?.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        return verifyCredentials(credentials?.email, credentials?.password);
      },
    }),
  ],
});
