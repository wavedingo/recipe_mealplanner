import { NextRequest, NextResponse } from 'next/server';
import { parseRecipeFromUrl } from '@/lib/recipe-parser';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('url' in body) || typeof (body as Record<string, unknown>).url !== 'string') {
    return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
  }

  const url = (body as { url: string }).url;

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: 'URL must use http or https' }, { status: 400 });
  }
  if (url.length > 2048) {
    return NextResponse.json({ error: 'URL too long' }, { status: 400 });
  }

  try {
    const recipe = await parseRecipeFromUrl(url);
    return NextResponse.json(recipe);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse recipe';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
