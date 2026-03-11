'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipeInEntry {
  id: string;
  title: string;
  imageUrl?: string | null;
}

interface MealPlanEntry {
  id: string;
  mealPlanId: string;
  dayOfWeek: number; // 0=Mon ... 6=Sun
  recipeId: string | null;
  recipe: RecipeInEntry | null;
}

interface MealPlan {
  id: string;
  weekStartDate: string;
  entries: MealPlanEntry[];
}

interface RecipeForPicker {
  id: string;
  title: string;
  imageUrl?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Recipe Picker Modal ──────────────────────────────────────────────────────

interface RecipePickerProps {
  onSelect: (recipe: RecipeForPicker) => void;
  onClose: () => void;
}

function RecipePicker({ onSelect, onClose }: RecipePickerProps) {
  const [recipes, setRecipes] = useState<RecipeForPicker[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    fetch('/api/recipes')
      .then((r) => r.json())
      .then((data) => {
        setRecipes(data as RecipeForPicker[]);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load recipes');
        setLoading(false);
      });
  }, []);

  const filtered = search
    ? recipes.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Choose a Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading recipes...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500 text-sm">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              {search ? 'No recipes match your search' : 'No recipes in your library'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    onClick={() => onSelect(recipe)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-blue-50 transition-colors text-left"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      {recipe.imageUrl ? (
                        <Image
                          src={recipe.imageUrl}
                          alt={recipe.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-800 line-clamp-2">{recipe.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

interface DayCellMenuState {
  dayOfWeek: number;
}

interface DayCellProps {
  entry: MealPlanEntry;
  onAdd: (dayOfWeek: number) => void;
  onRemove: (dayOfWeek: number) => void;
  openMenu: DayCellMenuState | null;
  setOpenMenu: (m: DayCellMenuState | null) => void;
}

function DayCell({ entry, onAdd, onRemove, openMenu, setOpenMenu }: DayCellProps) {
  const hasRecipe = !!entry.recipe;
  const isMenuOpen = openMenu?.dayOfWeek === entry.dayOfWeek;

  return (
    <div className="relative min-h-[120px] flex flex-col">
      {hasRecipe && entry.recipe ? (
        <button
          onClick={() => setOpenMenu(isMenuOpen ? null : { dayOfWeek: entry.dayOfWeek })}
          className="flex-1 flex flex-col items-stretch text-left rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group bg-white"
        >
          {/* Recipe image */}
          <div className="relative w-full h-24 bg-gray-100 flex-shrink-0">
            {entry.recipe.imageUrl ? (
              <Image
                src={entry.recipe.imageUrl}
                alt={entry.recipe.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="px-2 py-2">
            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">
              {entry.recipe.title}
            </p>
          </div>
        </button>
      ) : (
        <button
          onClick={() => onAdd(entry.dayOfWeek)}
          className="flex-1 flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-400 hover:text-blue-500 min-h-[120px]"
          aria-label="Add recipe"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Context menu */}
      {isMenuOpen && entry.recipe && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />
          <div className="absolute top-full left-0 mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-200 w-40 overflow-hidden">
            <Link
              href={`/recipes/${entry.recipe.id}`}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setOpenMenu(null)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View recipe
            </Link>
            <button
              onClick={() => {
                setOpenMenu(null);
                onRemove(entry.dayOfWeek);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MealPlanPage() {
  const router = useRouter();
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Picker state
  const [pickerDay, setPickerDay] = useState<number | null>(null);

  // Context menu state
  const [openMenu, setOpenMenu] = useState<{ dayOfWeek: number } | null>(null);

  // Grocery list state
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryComingSoon, setGroceryComingSoon] = useState(false);

  const fetchMealPlan = useCallback(async (monday: Date) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/meal-plan?weekStart=${formatDateISO(monday)}`);
      if (!res.ok) {
        const data = await res.json();
        setError((data as { error?: string }).error ?? 'Failed to load meal plan');
        return;
      }
      const data = await res.json();
      setMealPlan(data as MealPlan);
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMealPlan(currentMonday);
    setOpenMenu(null);
  }, [currentMonday, fetchMealPlan]);

  const goToPrevWeek = () => setCurrentMonday((d) => addDays(d, -7));
  const goToNextWeek = () => setCurrentMonday((d) => addDays(d, 7));
  const goToThisWeek = () => setCurrentMonday(getMondayOfWeek(new Date()));

  const handleAddRecipe = (dayOfWeek: number) => {
    setPickerDay(dayOfWeek);
  };

  const handleRemoveRecipe = async (dayOfWeek: number) => {
    if (!mealPlan) return;
    try {
      const res = await fetch(`/api/meal-plan/${mealPlan.id}/entry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek, recipeId: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error || 'Failed to remove recipe. Please try again.');
        return;
      }
      // Optimistically update the local state
      setMealPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.dayOfWeek === dayOfWeek ? { ...e, recipeId: null, recipe: null } : e
          ),
        };
      });
    } catch {
      alert('Network error. Please try again.');
    }
  };

  const handlePickerSelect = async (recipe: RecipeForPicker) => {
    if (!mealPlan || pickerDay === null) return;
    setPickerDay(null);
    try {
      const res = await fetch(`/api/meal-plan/${mealPlan.id}/entry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek: pickerDay, recipeId: recipe.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error || 'Failed to assign recipe. Please try again.');
        return;
      }
      const updatedEntry = await res.json() as MealPlanEntry;
      setMealPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.dayOfWeek === updatedEntry.dayOfWeek ? updatedEntry : e
          ),
        };
      });
    } catch {
      alert('Network error. Please try again.');
    }
  };

  const handleGenerateGroceryList = async () => {
    if (!mealPlan) return;
    setGroceryLoading(true);
    setGroceryComingSoon(false);
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId: mealPlan.id }),
      });
      if (res.status === 404 || res.status === 405) {
        setGroceryComingSoon(true);
        return;
      }
      if (!res.ok) {
        setGroceryComingSoon(true);
        return;
      }
      router.push('/grocery-list');
    } catch {
      setGroceryComingSoon(true);
    } finally {
      setGroceryLoading(false);
    }
  };

  // Compute dates for each column
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i));
  const weekEndDate = weekDates[6];

  // Build entries map by dayOfWeek for easy lookup
  const entriesByDay = new Map<number, MealPlanEntry>(
    (mealPlan?.entries ?? []).map((e) => [e.dayOfWeek, e])
  );

  // Ensure all 7 days have entries (even if the map is missing some)
  const allEntries: MealPlanEntry[] = Array.from({ length: 7 }, (_, i) => {
    return (
      entriesByDay.get(i) ?? {
        id: `placeholder-${i}`,
        mealPlanId: mealPlan?.id ?? '',
        dayOfWeek: i,
        recipeId: null,
        recipe: null,
      }
    );
  });

  const thisWeekMonday = getMondayOfWeek(new Date());
  const isThisWeek = formatDateISO(currentMonday) === formatDateISO(thisWeekMonday);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/recipes" className="text-sm text-blue-600 hover:underline">
                Recipe Library
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-sm text-gray-500">Meal Plan</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Meal Planner</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatMonthDay(currentMonday)} – {formatMonthDay(weekEndDate)}
            </p>
          </div>

          {/* Grocery list button */}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleGenerateGroceryList}
              disabled={groceryLoading || !mealPlan}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {groceryLoading ? 'Generating...' : 'Generate Grocery List'}
            </button>
            {groceryComingSoon && (
              <p className="text-xs text-gray-500">Coming soon — grocery list feature not yet available</p>
            )}
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={goToPrevWeek}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          {!isThisWeek && (
            <button
              onClick={goToThisWeek}
              className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              This Week
            </button>
          )}
          <button
            onClick={goToNextWeek}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded-lg mb-2" />
                <div className="h-28 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-3">
            {allEntries.map((entry) => {
              const date = weekDates[entry.dayOfWeek];
              const today = new Date();
              today.setUTCHours(0, 0, 0, 0);
              const isToday = date.getTime() === today.getTime();

              return (
                <div key={entry.dayOfWeek} className="flex flex-col gap-2">
                  {/* Column header */}
                  <div className={`text-center py-1.5 rounded-lg ${isToday ? 'bg-blue-600' : 'bg-gray-100'}`}>
                    <p className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-500'}`}>
                      {DAY_NAMES[entry.dayOfWeek]}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-800'}`}>
                      {formatMonthDay(date)}
                    </p>
                  </div>

                  {/* Day cell */}
                  <DayCell
                    entry={entry}
                    onAdd={handleAddRecipe}
                    onRemove={handleRemoveRecipe}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recipe picker modal */}
      {pickerDay !== null && (
        <RecipePicker
          onSelect={handlePickerSelect}
          onClose={() => setPickerDay(null)}
        />
      )}
    </div>
  );
}
