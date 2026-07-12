import { auth, signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/recipes');

  // Note: only the presence of `error` / `registered` is checked below, not the
  // value, so the query params are never rendered directly into the DOM.
  const { error, registered } = await searchParams;

  async function handleSignIn(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: '/recipes',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=InvalidCredentials`);
      }
      // Re-throw non-AuthError (e.g. NEXT_REDIRECT from next-auth signIn with redirectTo)
      // so Next.js can handle the redirect correctly.
      throw err;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Meal Planner</h1>
          <div className="mt-2 mx-auto w-10 h-0.5 bg-amber-400 rounded-full" />
          <p className="mt-3 text-sm text-slate-400">Sign in to continue</p>
        </div>

        {registered && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3">
            Account created. Sign in below.
          </p>
        )}

        <form action={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-slate-400">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
              placeholder="Password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
              Incorrect email or password. Please try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          No account?{' '}
          <Link href="/register" className="text-amber-400 hover:text-amber-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
