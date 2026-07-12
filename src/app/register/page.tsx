'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        name: form.get('name'),
        password: form.get('password'),
      }),
    });
    if (res.ok) {
      router.push('/login?registered=1');
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? 'Something went wrong. Please try again.');
    setSubmitting(false);
  }

  const inputClass =
    'block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Create account</h1>
          <div className="mt-2 mx-auto w-10 h-0.5 bg-amber-400 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm text-slate-400">Name</label>
            <input id="name" name="name" type="text" required autoFocus className={inputClass} placeholder="Your name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-slate-400">Email</label>
            <input id="email" name="email" type="email" required className={inputClass} placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-400">Password</label>
            <input id="password" name="password" type="password" required minLength={8} className={inputClass} placeholder="At least 8 characters" />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg p-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
