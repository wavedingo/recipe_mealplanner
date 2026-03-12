import { NextRequest, NextResponse } from 'next/server';
import { parseRecipeFromUrl, parseRecipeFromText } from '@/lib/recipe-parser';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  // Plain-text mode (Paste & Parse)
  if ('text' in data) {
    if (typeof data.text !== 'string' || !data.text.trim()) {
      return NextResponse.json({ error: 'Missing required field: text' }, { status: 400 });
    }
    if (data.text.length > 100000) {
      return NextResponse.json({ error: 'Pasted text is too long' }, { status: 400 });
    }
    try {
      const recipe = await parseRecipeFromText(data.text);
      return NextResponse.json(recipe);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse recipe';
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  // URL mode
  if (!('url' in data) || typeof data.url !== 'string') {
    return NextResponse.json({ error: 'Missing required field: url or text' }, { status: 400 });
  }

  const url = data.url;

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
