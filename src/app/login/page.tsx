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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Meal Planner</h1>
          <p className="mt-1 text-sm text-gray-500">Enter the household password to continue</p>
        </div>

        <form action={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Household password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Incorrect password. Please try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
