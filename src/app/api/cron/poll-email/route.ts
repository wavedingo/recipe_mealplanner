import { NextResponse } from 'next/server';
import { pollEmailForRecipes } from '@/lib/imap-poller';

export async function GET() {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    return NextResponse.json(
      { processed: 0, errors: [] },
      { status: 200 }
    );
  }

  try {
    const result = await pollEmailForRecipes();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { processed: 0, errors: [message] },
      { status: 500 }
    );
  }
}
