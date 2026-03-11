import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
// bcryptjs is used instead of bcrypt because it is pure JS (no native addon) and works everywhere.
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const password = credentials?.password as string;
        const hash = process.env.HOUSEHOLD_PASSWORD_HASH;
        if (!hash) {
          throw new Error('HOUSEHOLD_PASSWORD_HASH environment variable is not set');
        }
        if (!password) return null;
        const valid = await bcrypt.compare(password, hash);
        if (!valid) return null;
        return { id: 'household', name: 'Household' };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
});
