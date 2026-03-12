'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroceryItem {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  checked: boolean;
  isManual: boolean;
}

interface GroceryList {
  id: string;
  mealPlanId: string;
  items: GroceryItem[];
  createdAt: string;
  updatedAt: string;
}

interface GroupedItem {
  name: string;
  items: GroceryItem[];
}

interface MealPlan {
  id: string;
  weekStartDate: string;
  groceryList?: { id: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  meat: 'Meat & Seafood',
  pantry: 'Pantry',
  other: 'Other',
};

const CATEGORY_ORDER = ['produce', 'dairy', 'meat', 'pantry', 'other'];

function getMondayByOffset(offsetWeeks: number): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

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

function formatAmount(amount: number | null, unit: string | null): string {
  if (amount === null) return unit ?? '';
  const rounded = Math.round(amount * 100) / 100;
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

function groupItemsByName(items: GroceryItem[]): GroupedItem[] {
  const groups = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const existing = groups.get(item.name);
    if (existing) existing.push(item);
    else groups.set(item.name, [item]);
  }
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
}

function getInitialWeekOffset(): number {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search);
  const weekStart = params.get('weekStart');
  if (!weekStart) return 0;
  try {
    const thisMonday = getMondayByOffset(0);
    const targetMonday = getMondayOfWeek(new Date(weekStart));
    const diffMs = targetMonday.getTime() - thisMonday.getTime();
    return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  } catch {
    return 0;
  }
}

// ─── Add Item Form ─────────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (name: string, amount?: number, unit?: string, category?: string) => Promise<void>;
  onCancel: () => void;
}

function AddItemForm({ onAdd, onCancel }: AddItemFormProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('other');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const parsedAmount = amount ? parseFloat(amount) : undefined;
      await onAdd(name.trim(), parsedAmount, unit.trim() || undefined, category || undefined);
    } catch {
      setError('Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
      <p className="text-sm font-semibold text-blue-900 mb-3">Add Item</p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          placeholder="Item name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <input
          type="number"
          placeholder="Amount (optional)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="any"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Unit (optional)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroceryListPage() {
  const [weekOffset, setWeekOffset] = useState(() => getInitialWeekOffset());
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Derived week info
  const selectedMonday = getMondayByOffset(weekOffset);
  const selectedSunday = new Date(selectedMonday);
  selectedSunday.setUTCDate(selectedMonday.getUTCDate() + 6);
  const weekLabel = `${selectedMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}–${selectedSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;

  // Only allow generate/regenerate for current week and next week
  const canGenerate = weekOffset >= 0 && weekOffset <= 1;

  const loadGroceryList = useCallback(async () => {
    setLoading(true);
    setError('');
    setGroceryList(null);
    setMealPlanId(null);
    try {
      const monday = getMondayByOffset(weekOffset);
      const mpRes = await fetch(`/api/meal-plan?weekStart=${formatDateISO(monday)}`);
      if (!mpRes.ok) {
        setError('Failed to load meal plan');
        return;
      }
      const mp = await mpRes.json() as MealPlan;
      setMealPlanId(mp.id);

      if (!mp.groceryList) {
        setGroceryList(null);
        return;
      }

      const glRes = await fetch(`/api/grocery-list/${mp.groceryList.id}`);
      if (!glRes.ok) {
        setError('Failed to load grocery list');
        return;
      }
      const gl = await glRes.json() as GroceryList;
      setGroceryList(gl);
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    loadGroceryList();
  }, [loadGroceryList]);

  const handleGenerate = async () => {
    if (!mealPlanId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId }),
      });
      if (!res.ok) {
        alert('Failed to generate grocery list');
        return;
      }
      await loadGroceryList();
    } catch {
      alert('Network error, please try again');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!mealPlanId) return;
    const hasManual = groceryList?.items.some((i) => i.isManual);
    if (hasManual) {
      const ok = window.confirm(
        'Regenerating will delete all items including your manually added ones. Continue?'
      );
      if (!ok) return;
    }
    setRegenerating(true);
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId }),
      });
      if (!res.ok) {
        alert('Failed to regenerate grocery list');
        return;
      }
      await loadGroceryList();
    } catch {
      alert('Network error, please try again');
    } finally {
      setRegenerating(false);
    }
  };

  const handleToggleGroup = async (groupItems: GroceryItem[]) => {
    if (!groceryList) return;
    const targetChecked = !groupItems.every((i) => i.checked);
    const ids = new Set(groupItems.map((i) => i.id));
    const prev = groceryList;
    setGroceryList({
      ...groceryList,
      items: groceryList.items.map((i) => ids.has(i.id) ? { ...i, checked: targetChecked } : i),
    });
    try {
      await Promise.all(groupItems.map((item) =>
        fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checked: targetChecked }),
        })
      ));
    } catch {
      setGroceryList(prev);
    }
  };

  const handleDeleteGroup = async (groupItems: GroceryItem[]) => {
    if (!groceryList) return;
    const ids = new Set(groupItems.map((i) => i.id));
    try {
      await Promise.all(groupItems.map((item) =>
        fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, { method: 'DELETE' })
      ));
      setGroceryList({ ...groceryList, items: groceryList.items.filter((i) => !ids.has(i.id)) });
    } catch {
      // Silent failure
    }
  };

  const handleCopy = async () => {
    if (!groceryList) return;
    const lines: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = groceryList.items.filter((i) => i.category === cat);
      if (catItems.length === 0) continue;
      lines.push(CATEGORY_LABELS[cat]);
      for (const group of groupItemsByName(catItems)) {
        const amounts = group.items
          .filter((i) => i.amount !== null || i.unit)
          .map((i) => formatAmount(i.amount, i.unit))
          .join(', ');
        lines.push(amounts ? `${group.name}: ${amounts}` : group.name);
      }
      lines.push('');
    }
    await navigator.clipboard.writeText(lines.join('\n').trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddItem = async (name: string, amount?: number, unit?: string, category?: string) => {
    if (!groceryList) return;
    const res = await fetch(`/api/grocery-list/${groceryList.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount, unit, category }),
    });
    if (!res.ok) throw new Error('Failed to add item');
    const newItem = await res.json() as GroceryItem;
    setGroceryList({ ...groceryList, items: [...groceryList.items, newItem] });
    setShowAddForm(false);
  };

  // Group items by category, then by name within each category
  const groupsByCategory = CATEGORY_ORDER.reduce<Record<string, GroupedItem[]>>((acc, cat) => {
    const catItems = (groceryList?.items ?? []).filter((i) => i.category === cat);
    acc[cat] = groupItemsByName(catItems);
    return acc;
  }, {});

  const allGroups = Object.values(groupsByCategory).flat();
  const totalItems = allGroups.length;
  const checkedItems = allGroups.filter((g) => g.items.every((i) => i.checked)).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/recipes" className="text-sm text-blue-600 hover:underline">Recipe Library</Link>
            <span className="text-gray-400">/</span>
            <Link href="/meal-plan" className="text-sm text-blue-600 hover:underline">Meal Plan</Link>
            <span className="text-gray-400">/</span>
            <span className="text-sm text-gray-500">Grocery List</span>
          </div>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Grocery List</h1>
              {groceryList && totalItems > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">{checkedItems} of {totalItems} items checked</p>
              )}
            </div>
            {groceryList && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                {canGenerate && (
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {regenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-5 bg-white rounded-xl border border-gray-200 px-4 py-2.5 shadow-sm">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
            {weekOffset === 0 && <span className="ml-2 text-xs text-blue-600 font-medium">This week</span>}
            {weekOffset === 1 && <span className="ml-2 text-xs text-gray-500">Next week</span>}
            {weekOffset < 0 && <span className="ml-2 text-xs text-gray-400">Past</span>}
            {weekOffset > 1 && <span className="ml-2 text-xs text-gray-400">Future</span>}
          </div>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
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

        {/* Loading */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-6 w-24 bg-gray-200 rounded mb-3" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-12 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !groceryList ? (
          /* Empty state */
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {weekOffset < 0 ? 'No list for this week' : 'No grocery list yet'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {canGenerate
                ? 'Add recipes to your meal plan, then generate a grocery list.'
                : weekOffset < 0
                  ? 'No grocery list was generated for this week.'
                  : 'Grocery lists can only be generated for this week or next week.'}
            </p>
            {canGenerate && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {generating ? 'Generating...' : 'Generate Grocery List'}
                </button>
                <Link href="/meal-plan" className="text-sm text-blue-600 hover:underline">
                  Go to Meal Plan
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Grocery list */
          <div className="space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const groups = groupsByCategory[cat];
              if (groups.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat]}
                  </h2>
                  <ul className="space-y-1">
                    {groups.map((group) => {
                      const allChecked = group.items.every((i) => i.checked);
                      const measurementText = group.items
                        .filter((i) => i.amount !== null || i.unit)
                        .map((i) => formatAmount(i.amount, i.unit))
                        .join(', ');
                      const hasManual = group.items.some((i) => i.isManual);
                      return (
                        <li
                          key={group.name}
                          className={`flex items-center gap-3 p-3 bg-white rounded-xl border transition-colors ${
                            allChecked ? 'border-gray-100 bg-gray-50' : 'border-gray-200'
                          }`}
                        >
                          <button
                            onClick={() => handleToggleGroup(group.items)}
                            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              allChecked
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-300 hover:border-green-400'
                            }`}
                            aria-label={allChecked ? 'Mark as not done' : 'Mark as done'}
                          >
                            {allChecked && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <span
                              className={`text-sm font-medium transition-colors ${
                                allChecked ? 'line-through text-gray-400' : 'text-gray-800'
                              }`}
                            >
                              {group.name}
                            </span>
                            {measurementText && (
                              <span className={`ml-2 text-xs ${allChecked ? 'text-gray-300' : 'text-gray-500'}`}>
                                {measurementText}
                              </span>
                            )}
                            {hasManual && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                                manual
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteGroup(group.items)}
                            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                            aria-label="Delete item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            {/* Add item section — only when canGenerate (current/next week) */}
            {canGenerate && (
              <section>
                {showAddForm ? (
                  <AddItemForm
                    onAdd={handleAddItem}
                    onCancel={() => setShowAddForm(false)}
                  />
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add item
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
