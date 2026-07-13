import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify grocery list exists
  const groceryList = await prisma.groceryList.findFirst({
    where: { id, mealPlan: { userId } },
  });
  if (!groceryList) {
    return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 });
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

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }

  const item = await prisma.groceryItem.create({
    data: {
      groceryListId: id,
      name: data.name.trim(),
      amount: typeof data.amount === 'number' ? data.amount : null,
      unit: typeof data.unit === 'string' ? data.unit : null,
      category: typeof data.category === 'string' ? data.category : 'other',
      checked: false,
      isManual: true,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
