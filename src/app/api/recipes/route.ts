import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Ingredient } from '@/types/index';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;

  let recipes = await prisma.recipe.findMany({
    include: { tags: { include: { tag: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (search) {
    const lower = search.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(lower) ||
        (r.ingredients as unknown as Ingredient[]).some((i) =>
          i.name.toLowerCase().includes(lower)
        )
    );
  }

  if (tag) {
    const lower = tag.toLowerCase();
    recipes = recipes.filter((r) =>
      r.tags.some((rt) => rt.tag.name.toLowerCase() === lower)
    );
  }

  return NextResponse.json(recipes);
}

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

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
  }

  const tags: string[] = Array.isArray(data.tags)
    ? (data.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const normalizedTags = tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean);

  // Upsert tags (deduplicate names first to avoid duplicate RecipeTag rows)
  const uniqueTagNames = [...new Set(normalizedTags)];
  const tagRecords = await Promise.all(
    uniqueTagNames.map((name) =>
      prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );

  const recipe = await prisma.recipe.create({
    data: {
      title: data.title.trim(),
      description: typeof data.description === 'string' ? data.description : undefined,
      sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : undefined,
      imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
      servings: typeof data.servings === 'number' ? data.servings : undefined,
      prepTimeMins: typeof data.prepTimeMins === 'number' ? data.prepTimeMins : undefined,
      cookTimeMins: typeof data.cookTimeMins === 'number' ? data.cookTimeMins : undefined,
      ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
      steps: Array.isArray(data.steps) ? data.steps : [],
      rating: typeof data.rating === 'number' ? data.rating : undefined,
      notes: typeof data.notes === 'string' ? data.notes : undefined,
      tags: {
        create: tagRecords.map((tag) => ({ tagId: tag.id })),
      },
    },
    include: { tags: { include: { tag: true } } },
  });

  return NextResponse.json(recipe, { status: 201 });
}
