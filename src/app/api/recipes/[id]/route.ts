import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const recipe = await prisma.recipe.findFirst({
    where: { id, userId },
    include: {
      tags: { include: { tag: true } },
      forkedFrom: { select: { id: true, title: true } },
    },
  });

  if (!recipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }

  return NextResponse.json(recipe);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

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

  const rawTags: string[] | undefined = Array.isArray(data.tags)
    ? (data.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;

  const tags = rawTags !== undefined
    ? rawTags.map((t: string) => t.trim().toLowerCase()).filter(Boolean)
    : undefined;

  // Build the update payload — only include fields that are explicitly provided
  const updateData: Record<string, unknown> = {};
  if (typeof data.title === 'string') updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = typeof data.description === 'string' ? data.description : null;
  if (data.sourceUrl !== undefined) updateData.sourceUrl = typeof data.sourceUrl === 'string' ? data.sourceUrl : null;
  if (data.imageUrl !== undefined) updateData.imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : null;
  if (data.servings !== undefined) updateData.servings = typeof data.servings === 'number' ? data.servings : null;
  if (data.prepTimeMins !== undefined) updateData.prepTimeMins = typeof data.prepTimeMins === 'number' ? data.prepTimeMins : null;
  if (data.cookTimeMins !== undefined) updateData.cookTimeMins = typeof data.cookTimeMins === 'number' ? data.cookTimeMins : null;
  if (Array.isArray(data.ingredients)) updateData.ingredients = data.ingredients;
  if (Array.isArray(data.steps)) updateData.steps = data.steps;
  if (data.rating !== undefined) updateData.rating = typeof data.rating === 'number' ? data.rating : null;
  if (data.notes !== undefined) updateData.notes = typeof data.notes === 'string' ? data.notes : null;

  // Handle tag replacement in a transaction
  try {
    const recipe = await prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findFirst({ where: { id, userId }, select: { id: true } });
      if (!existing) {
        throw new Prisma.PrismaClientKnownRequestError('Not found', {
          code: 'P2025',
          clientVersion: 'ownership-check',
        });
      }

      if (tags !== undefined) {
        // Delete existing tags and replace with the new set
        await tx.recipeTag.deleteMany({ where: { recipeId: id } });

        // Upsert tags and create new RecipeTags
        const tagRecords = await Promise.all(
          tags.map((name) =>
            tx.tag.upsert({
              where: { name },
              update: {},
              create: { name },
            })
          )
        );

        updateData.tags = {
          create: tagRecords.map((tag) => ({ tagId: tag.id })),
        };
      }

      // update recipe (will throw P2025 if not found)
      return tx.recipe.update({
        where: { id },
        data: updateData,
        include: { tags: { include: { tag: true } } },
      });
    });

    return NextResponse.json(recipe);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // RecipeTags and MealPlanEntries cascade delete via schema onDelete: Cascade / SetNull
  const deleted = await prisma.recipe.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
