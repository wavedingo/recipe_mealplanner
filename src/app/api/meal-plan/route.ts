import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
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

  // Try to find existing meal plan for this week
  let mealPlan = await prisma.mealPlan.findFirst({
    where: {
      weekStartDate: weekStart,
    },
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
    },
  });

  // If no meal plan exists, create one with 7 empty entries
  if (!mealPlan) {
    mealPlan = await prisma.mealPlan.create({
      data: {
        weekStartDate: weekStart,
        entries: {
          create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
        },
      },
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
      },
    });
  }

  return NextResponse.json(mealPlan);
}
