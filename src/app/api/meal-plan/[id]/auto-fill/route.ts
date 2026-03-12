import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Suggestion {
  dayOfWeek: number;
  recipeId: string | null;
  mealName: string | null;
}

interface EntryRow {
  id: string;
  dayOfWeek: number;
  recipeId: string | null;
  customLabel: string | null;
}

interface RecipeRow {
  id: string;
  title: string;
  tags: Array<{ tag: { name: string } }>;
}

export async function POST(
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

  const data = body as Record<string, unknown>;
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';

  // Load meal plan with entries
  const mealPlanRaw = await prisma.mealPlan.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          recipe: { select: { id: true, title: true, imageUrl: true } },
        },
      },
    },
  });

  if (!mealPlanRaw) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
  }

  const entries = mealPlanRaw.entries as unknown as EntryRow[];

  // Only fill days with no recipe and no label
  const emptyEntries = entries.filter(
    (e: EntryRow) => e.recipeId === null && !e.customLabel
  );

  if (emptyEntries.length === 0) {
    return NextResponse.json(mealPlanRaw);
  }

  // Fetch library recipes (id, title, tags only)
  const recipesRaw = await prisma.recipe.findMany({
    select: {
      id: true,
      title: true,
      tags: { include: { tag: true } },
    },
  });

  const recipes = recipesRaw as unknown as RecipeRow[];
  const recipeIdSet = new Set(recipes.map((r: RecipeRow) => r.id));

  const daysToFill = emptyEntries
    .map((e: EntryRow) => `${DAY_NAMES[e.dayOfWeek]} (dayOfWeek: ${e.dayOfWeek})`)
    .join(', ');

  const libraryList = recipes.length > 0
    ? recipes
        .map((r: RecipeRow) => {
          const tags = r.tags.map((rt: { tag: { name: string } }) => rt.tag.name).join(', ');
          return `- id: "${r.id}", title: "${r.title}"${tags ? `, tags: [${tags}]` : ''}`;
        })
        .join('\n')
    : '(no recipes in library yet)';

  const client = new Anthropic();

  let message;
  try {
    message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a meal planning assistant. Given a user's prompt and their recipe library, suggest one meal per empty day.

Aim for a varied, interesting week. Use library recipes when they are a genuinely good fit for the user's prompt. For other days — or whenever variety calls for it — suggest fresh meal ideas NOT in the library. A good plan typically mixes both.

When the library has fewer than 50 recipes, lean heavily toward novel suggestions (non-library meals) so the user discovers new ideas rather than cycling through a small set repeatedly.

Return ONLY a valid JSON array with no markdown fences:
[
  { "dayOfWeek": 0, "recipeId": "exact-id-from-library", "mealName": null },
  { "dayOfWeek": 2, "recipeId": null, "mealName": "Butternut Squash Soup" }
]

Rules:
- Only include the days listed in "Days to fill"
- If using a library recipe, set recipeId to its exact id and mealName to null
- If suggesting a non-library meal, set recipeId to null and mealName to the meal name (2–5 words)
- Never set both recipeId and mealName on the same entry
- Never suggest the same meal (by name or recipe) more than once in the same week
- Do not force library recipes — suggesting meals not in the library is encouraged
- dayOfWeek: 0=Monday through 6=Sunday`,
    messages: [
      {
        role: 'user',
        content: `User prompt: "${prompt || 'Plan a balanced week of meals'}"

Days to fill: ${daysToFill}

Library size: ${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}

Library recipes:
${libraryList}`,
      },
    ],
  });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 529 || status === 503) {
      return NextResponse.json(
        { error: 'The AI service is temporarily overloaded. Please wait a moment and try again.' },
        { status: 503 }
      );
    }
    throw err;
  }

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';

  let suggestions: Suggestion[];
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    suggestions = JSON.parse(cleaned) as Suggestion[];
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
  }

  // Apply suggestions — skip days not in the empty set
  const emptyDaySet = new Set(emptyEntries.map((e: EntryRow) => e.dayOfWeek));
  const validSuggestions = suggestions.filter(
    (s: Suggestion) =>
      typeof s.dayOfWeek === 'number' &&
      s.dayOfWeek >= 0 &&
      s.dayOfWeek <= 6 &&
      emptyDaySet.has(s.dayOfWeek)
  );

  await Promise.all(
    validSuggestions.map((s: Suggestion) => {
      const entry = entries.find((e: EntryRow) => e.dayOfWeek === s.dayOfWeek);
      if (!entry) return Promise.resolve();

      const recipeId = s.recipeId && recipeIdSet.has(s.recipeId) ? s.recipeId : null;
      const customLabel =
        !recipeId && typeof s.mealName === 'string' && s.mealName.trim()
          ? s.mealName.trim()
          : null;

      return prisma.mealPlanEntry.update({
        where: { id: entry.id },
        data: { recipeId, customLabel },
      });
    })
  );

  // Re-fetch and return the updated meal plan
  const updated = await prisma.mealPlan.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          recipe: { select: { id: true, title: true, imageUrl: true } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}
