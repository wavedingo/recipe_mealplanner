import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

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

  if (typeof data.dayOfWeek !== 'number' || data.dayOfWeek < 0 || data.dayOfWeek > 6) {
    return NextResponse.json({ error: 'dayOfWeek must be a number between 0 and 6' }, { status: 400 });
  }

  const dayOfWeek = data.dayOfWeek;
  const recipeId = data.recipeId === null ? null : typeof data.recipeId === 'string' ? data.recipeId : undefined;

  if (recipeId === undefined) {
    return NextResponse.json({ error: 'recipeId must be a string or null' }, { status: 400 });
  }

  // Validate recipe exists (and belongs to the caller) when recipeId is provided
  if (recipeId !== null) {
    const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }
  }

  // Check meal plan exists and belongs to the caller
  const mealPlan = await prisma.mealPlan.findFirst({ where: { id, userId } });
  if (!mealPlan) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
  }

  // Find the entry for this day and update it
  const entry = await prisma.mealPlanEntry.findFirst({
    where: { mealPlanId: id, dayOfWeek },
  });

  let updatedEntry;
  if (entry) {
    updatedEntry = await prisma.mealPlanEntry.update({
      where: { id: entry.id },
      data: { recipeId, customLabel: null },
      include: {
        recipe: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
          },
        },
      },
    });
  } else {
    // Create entry if somehow missing
    updatedEntry = await prisma.mealPlanEntry.create({
      data: {
        mealPlanId: id,
        dayOfWeek,
        recipeId,
      },
      include: {
        recipe: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
          },
        },
      },
    });
  }

  return NextResponse.json(updatedEntry);
}
