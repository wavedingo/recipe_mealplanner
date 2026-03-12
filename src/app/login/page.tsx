import { auth, signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/recipes');

  // Note: only the presence of `error` is checked below, not its value,
  // so the query param is never rendered directly into the DOM.
  const { error } = await searchParams;

  async function handleSignIn(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
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
          <p className="mt-3 text-sm text-slate-400">Enter the household password to continue</p>
        </div>

        <form action={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
              placeholder="Household password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
              Incorrect password. Please try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
