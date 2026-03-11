import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Check meal plan exists
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id } });
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
      data: { recipeId },
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
