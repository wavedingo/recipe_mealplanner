import { auth } from '@/lib/auth';

/** Returns the signed-in user's id, or null when unauthenticated. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
