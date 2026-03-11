import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { id, itemId } = await params;

  // Verify item belongs to the list
  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryListId: id },
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await prisma.groceryItem.delete({ where: { id: itemId } });

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  const { id, itemId } = await params;

  // Verify item belongs to the list
  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryListId: id },
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
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

  const updated = await prisma.groceryItem.update({
    where: { id: itemId },
    data: {
      ...(typeof data.checked === 'boolean' && { checked: data.checked }),
      ...(typeof data.name === 'string' && data.name.trim() && { name: data.name.trim() }),
      ...(typeof data.amount === 'number' && { amount: data.amount }),
      ...(data.amount === null && { amount: null }),
      ...(data.unit !== undefined && { unit: data.unit }),
    },
  });

  return NextResponse.json(updated);
}
