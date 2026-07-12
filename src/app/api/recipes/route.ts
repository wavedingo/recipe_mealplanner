import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Ingredient } from '@/types/index';
import { getSessionUserId } from '@/lib/session';

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;

  let recipes = await prisma.recipe.findMany({
    where: { userId },
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
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // Phase 1: forking is same-user only (cross-user forks arrive with Phase 2 visibility rules)
  const forkedFromId = typeof data.forkedFromId === 'string' ? data.forkedFromId : undefined;
  if (forkedFromId) {
    const source = await prisma.recipe.findFirst({
      where: { id: forkedFromId, userId },
      select: { id: true },
    });
    if (!source) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }
  }

  const recipe = await prisma.recipe.create({
    data: {
      userId,
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
      forkedFromId,
      tags: {
        create: tagRecords.map((tag) => ({ tagId: tag.id })),
      },
    },
    include: { tags: { include: { tag: true } } },
  });

  return NextResponse.json(recipe, { status: 201 });
}
