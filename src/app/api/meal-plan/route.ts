import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get('weekStart');

  let weekStart: Date;
  if (weekStartParam) {
    const parsed = new Date(weekStartParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid weekStart date' }, { status: 400 });
    }
    weekStart = getMondayOfWeek(parsed);
  } else {
    weekStart = getMondayOfWeek(new Date());
  }

  // Normalize to start of day UTC
  weekStart.setUTCHours(0, 0, 0, 0);

  // Atomically get or create the meal plan for this week
  const mealPlan = await prisma.mealPlan.upsert({
    where: { weekStartDate: weekStart },
    create: {
      weekStartDate: weekStart,
      entries: {
        create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
      },
    },
    update: {},
    include: {
      entries: {
        include: {
          recipe: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { dayOfWeek: 'asc' },
      },
      groceryList: { select: { id: true } },
    },
  });

  return NextResponse.json(mealPlan);
}
