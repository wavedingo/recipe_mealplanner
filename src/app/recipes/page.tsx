import { prisma } from '@/lib/db';
import RecipesClient from './RecipesClient';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const recipes = await prisma.recipe.findMany({
    include: { tags: { include: { tag: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Serialize to plain objects (Prisma returns Date objects etc.)
  const serialized = recipes.map((r) => ({
    ...r,
    ingredients: r.ingredients as unknown as import('@/types/index').Ingredient[],
    steps: r.steps as unknown as import('@/types/index').RecipeStep[],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-[#080c14]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RecipesClient initialRecipes={serialized} />
      </div>
    </div>
  );
}
