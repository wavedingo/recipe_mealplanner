import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const groceryList = await prisma.groceryList.findUnique({
    where: { id },
    include: { items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  });

  if (!groceryList) {
    return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 });
  }

  return NextResponse.json(groceryList);
}
