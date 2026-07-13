import { NextRequest, NextResponse } from 'next/server';
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

  const groceryList = await prisma.groceryList.findFirst({
    where: { id, mealPlan: { userId } },
    include: { items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  });

  if (!groceryList) {
    return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 });
  }

  return NextResponse.json(groceryList);
}
