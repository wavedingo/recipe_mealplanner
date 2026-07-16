import type { NextAuthConfig } from 'next-auth';

// Shared, edge-safe NextAuth options. middleware.ts builds its own NextAuth
// instance from this (JWT decode only); src/lib/auth.ts adds the Credentials
// provider, which pulls in prisma/bcrypt and must stay out of the middleware bundle.
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  // This app is self-hosted behind arbitrary hostnames/ports by design, so
  // NextAuth must trust the incoming Host header rather than rejecting
  // non-localhost requests during credentials login.
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
