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
  customLabel: string | null;
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-100">Choose a Recipe</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Loading recipes...</div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-400 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
              {search ? 'No recipes match your search' : 'No recipes in your library'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {filtered.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    onClick={() => onSelect(recipe)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700">
                      {recipe.imageUrl ? (
                        <Image src={recipe.imageUrl} alt={recipe.title} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-200 line-clamp-2">{recipe.title}</span>
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

// ─── Auto-fill Modal ──────────────────────────────────────────────────────────

interface AutoFillModalProps {
  emptyDayCount: number;
  onGenerate: (prompt: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function AutoFillModal({ emptyDayCount, onGenerate, onClose, loading }: AutoFillModalProps) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(prompt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Auto-fill Meal Plan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {emptyDayCount} {emptyDayCount === 1 ? 'day' : 'days'} to fill
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800 disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label htmlFor="autofill-prompt" className="block text-sm font-medium text-slate-300 mb-1.5">
              Describe the vibe <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              ref={inputRef}
              id="autofill-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              placeholder={'e.g. "hearty autumn meals" or "keto-friendly, kid-friendly, no fish"'}
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-none disabled:opacity-50"
            />
          </div>
          <p className="text-xs text-slate-600">
            Already-planned days won't be overwritten. Suggestions not in your library appear as placeholders.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || emptyDayCount === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-900 bg-amber-400 rounded-xl hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

interface DayCellMenuState { dayOfWeek: number; }

interface DayCellProps {
  entry: MealPlanEntry;
  onAdd: (dayOfWeek: number) => void;
  onRemove: (dayOfWeek: number) => void;
  openMenu: DayCellMenuState | null;
  setOpenMenu: (m: DayCellMenuState | null) => void;
}

function DayCell({ entry, onAdd, onRemove, openMenu, setOpenMenu }: DayCellProps) {
  const hasRecipe = !!entry.recipe;
  const hasLabel = !hasRecipe && !!entry.customLabel;
  const isMenuOpen = openMenu?.dayOfWeek === entry.dayOfWeek;

  if (hasRecipe && entry.recipe) {
    return (
      <div className="relative min-h-[120px] flex flex-col">
        <button
          onClick={() => setOpenMenu(isMenuOpen ? null : { dayOfWeek: entry.dayOfWeek })}
          className="flex-1 flex flex-col items-stretch text-left rounded-xl overflow-hidden border border-slate-700/60 hover:border-amber-500/50 hover:shadow-lg hover:shadow-black/30 transition-all group bg-slate-900"
        >
          <div className="relative w-full h-24 bg-slate-800 flex-shrink-0">
            {entry.recipe.imageUrl ? (
              <Image src={entry.recipe.imageUrl} alt={entry.recipe.title} fill className="object-cover opacity-90 group-hover:opacity-100 transition-opacity" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-700">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="px-2 py-2">
            <p className="text-xs font-medium text-slate-300 group-hover:text-slate-100 line-clamp-2 leading-tight transition-colors">
              {entry.recipe.title}
            </p>
          </div>
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />
            <div className="absolute top-full left-0 mt-1 z-30 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/50 w-40 overflow-hidden">
              <Link
                href={`/recipes/${entry.recipe.id}`}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
                onClick={() => setOpenMenu(null)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View recipe
              </Link>
              <button
                onClick={() => { setOpenMenu(null); onRemove(entry.dayOfWeek); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/40 transition-colors"
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

  if (hasLabel) {
    return (
      <div className="relative min-h-[120px] flex flex-col">
        <button
          onClick={() => setOpenMenu(isMenuOpen ? null : { dayOfWeek: entry.dayOfWeek })}
          className="flex-1 flex flex-col items-center justify-center text-center rounded-xl border border-amber-800/40 bg-amber-950/20 hover:border-amber-600/50 hover:bg-amber-950/30 transition-all px-3 py-4 min-h-[120px]"
        >
          <svg className="w-4 h-4 text-amber-500/70 mb-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-xs font-medium text-amber-300/80 italic leading-tight line-clamp-3">
            {entry.customLabel}
          </p>
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />
            <div className="absolute top-full left-0 mt-1 z-30 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/50 w-48 overflow-hidden">
              <button
                onClick={() => { setOpenMenu(null); onAdd(entry.dayOfWeek); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Use library recipe
              </button>
              <Link
                href={`/recipes?add=true&title=${encodeURIComponent(entry.customLabel ?? '')}`}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
                onClick={() => setOpenMenu(null)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create new recipe
              </Link>
              <button
                onClick={() => { setOpenMenu(null); onRemove(entry.dayOfWeek); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/40 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-[120px] flex flex-col">
      <button
        onClick={() => onAdd(entry.dayOfWeek)}
        className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-amber-950/10 transition-all text-slate-700 hover:text-amber-500/70 min-h-[120px]"
        aria-label="Add recipe"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
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
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFillError, setAutoFillError] = useState('');
  const [openMenu, setOpenMenu] = useState<{ dayOfWeek: number } | null>(null);
  const [groceryLoading, setGroceryLoading] = useState(false);

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
      setMealPlan(await res.json() as MealPlan);
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

  const handleRemoveRecipe = async (dayOfWeek: number) => {
    if (!mealPlan) return;
    try {
      const res = await fetch(`/api/meal-plan/${mealPlan.id}/entry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfWeek, recipeId: null }),
      });
      if (!res.ok) { alert('Failed to remove. Please try again.'); return; }
      setMealPlan((prev) => prev ? {
        ...prev,
        entries: prev.entries.map((e) =>
          e.dayOfWeek === dayOfWeek ? { ...e, recipeId: null, recipe: null, customLabel: null } : e
        ),
      } : prev);
    } catch { alert('Network error. Please try again.'); }
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
      if (!res.ok) { alert('Failed to assign recipe. Please try again.'); return; }
      const updatedEntry = await res.json() as MealPlanEntry;
      setMealPlan((prev) => prev ? {
        ...prev,
        entries: prev.entries.map((e) => e.dayOfWeek === updatedEntry.dayOfWeek ? updatedEntry : e),
      } : prev);
    } catch { alert('Network error. Please try again.'); }
  };

  const handleAutoFill = async (prompt: string) => {
    if (!mealPlan) return;
    setAutoFillLoading(true);
    setAutoFillError('');
    try {
      const res = await fetch(`/api/meal-plan/${mealPlan.id}/auto-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setAutoFillError(err.error || 'Auto-fill failed. Please try again.');
        return;
      }
      setMealPlan(await res.json() as MealPlan);
      setShowAutoFill(false);
    } catch {
      setAutoFillError('Network error. Please try again.');
    } finally {
      setAutoFillLoading(false);
    }
  };

  const handleGenerateGroceryList = async () => {
    if (!mealPlan) return;
    setGroceryLoading(true);
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId: mealPlan.id }),
      });
      if (!res.ok) return;
      router.push(`/grocery-list?weekStart=${formatDateISO(currentMonday)}`);
    } catch {
      // ignore
    } finally {
      setGroceryLoading(false);
    }
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i));
  const weekEndDate = weekDates[6];
  const entriesByDay = new Map<number, MealPlanEntry>((mealPlan?.entries ?? []).map((e) => [e.dayOfWeek, e]));
  const allEntries: MealPlanEntry[] = Array.from({ length: 7 }, (_, i) =>
    entriesByDay.get(i) ?? { id: `placeholder-${i}`, mealPlanId: mealPlan?.id ?? '', dayOfWeek: i, recipeId: null, recipe: null, customLabel: null }
  );
  const emptyDayCount = allEntries.filter((e) => !e.recipeId && !e.customLabel).length;
  const isThisWeek = formatDateISO(currentMonday) === formatDateISO(getMondayOfWeek(new Date()));

  return (
    <div className="min-h-screen bg-[#080c14]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/recipes" className="text-xs text-slate-500 hover:text-amber-400 transition-colors tracking-wide uppercase">
                Library
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-xs text-slate-600 tracking-wide uppercase">Meal Plan</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-50 tracking-tight">Meal Planner</h1>
            <p className="text-sm text-slate-500 mt-1">
              {formatMonthDay(currentMonday)} – {formatMonthDay(weekEndDate)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAutoFillError(''); setShowAutoFill(true); }}
                disabled={!mealPlan || loading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 hover:bg-slate-700 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Auto-fill
              </button>

              <button
                onClick={handleGenerateGroceryList}
                disabled={groceryLoading || !mealPlan}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {groceryLoading ? 'Generating...' : 'Grocery List'}
              </button>
            </div>
            {autoFillError && <p className="text-xs text-red-400">{autoFillError}</p>}
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={goToPrevWeek}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-400 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          {!isThisWeek && (
            <button
              onClick={goToThisWeek}
              className="px-3 py-2 text-sm font-medium text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-lg hover:bg-amber-950/50 transition-colors"
            >
              This Week
            </button>
          )}
          <button
            onClick={goToNextWeek}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-400 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-950/40 border border-red-800/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-8 bg-slate-800 rounded-lg mb-2" />
                <div className="h-28 bg-slate-900 rounded-xl" />
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
                  <div className={`text-center py-1.5 rounded-lg ${isToday ? 'bg-amber-500' : 'bg-slate-800/60'}`}>
                    <p className={`text-xs font-semibold tracking-wide ${isToday ? 'text-slate-900' : 'text-slate-500'}`}>
                      {DAY_NAMES[entry.dayOfWeek]}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? 'text-slate-900' : 'text-slate-300'}`}>
                      {formatMonthDay(date)}
                    </p>
                  </div>
                  <DayCell
                    entry={entry}
                    onAdd={(d) => setPickerDay(d)}
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

      {pickerDay !== null && (
        <RecipePicker onSelect={handlePickerSelect} onClose={() => setPickerDay(null)} />
      )}

      {showAutoFill && (
        <AutoFillModal
          emptyDayCount={emptyDayCount}
          onGenerate={handleAutoFill}
          onClose={() => setShowAutoFill(false)}
          loading={autoFillLoading}
        />
      )}
    </div>
  );
}
