import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { aggregateIngredients, RecipeWithIngredients } from '@/lib/ingredient-aggregator';
import type { Ingredient } from '@/types/index';

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
  if (!data.mealPlanId || typeof data.mealPlanId !== 'string') {
    return NextResponse.json({ error: 'Missing required field: mealPlanId' }, { status: 400 });
  }

  const { mealPlanId } = data;

  // Verify meal plan exists and fetch all entries with recipes
  const mealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    include: {
      entries: {
        include: {
          recipe: true,
        },
      },
      groceryList: true,
    },
  });

  if (!mealPlan) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
  }

  // Collect recipes from entries
  const recipes: RecipeWithIngredients[] = mealPlan.entries
    .filter((e) => e.recipe !== null)
    .map((e) => ({
      id: e.recipe!.id,
      title: e.recipe!.title,
      ingredients: e.recipe!.ingredients as unknown as Ingredient[],
    }));

  // Aggregate ingredients
  const aggregated = aggregateIngredients(recipes);

  // Create or replace grocery list — delete existing items, then upsert the list
  const groceryList = await prisma.$transaction(async (tx) => {
    let list = mealPlan.groceryList;

    if (list) {
      // Delete all auto-generated items (keep manual ones... but spec says replace all)
      await tx.groceryItem.deleteMany({
        where: { groceryListId: list.id },
      });
    } else {
      list = await tx.groceryList.create({
        data: { mealPlanId },
      });
    }

    // Create new aggregated items
    await tx.groceryItem.createMany({
      data: aggregated.map((item) => ({
        groceryListId: list!.id,
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category,
        checked: false,
        isManual: false,
      })),
    });

    // Return the full list with items
    return tx.groceryList.findUnique({
      where: { id: list!.id },
      include: { items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
    });
  });

  return NextResponse.json(groceryList, { status: 201 });
}
