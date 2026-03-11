import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verify grocery list exists
  const groceryList = await prisma.groceryList.findUnique({ where: { id } });
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
      isManual: true,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
