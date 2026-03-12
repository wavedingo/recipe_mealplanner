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

function getWeekOffsetFromUrl(): number {
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
    if (!name.trim()) { setError('Name is required'); return; }
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

  const inputCls = "px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40";

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 bg-slate-800/60 rounded-xl border border-slate-700">
      <p className="text-sm font-semibold text-slate-200 mb-3">Add Item</p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="text" placeholder="Item name *" value={name} onChange={(e) => setName(e.target.value)} className={`col-span-2 ${inputCls}`} autoFocus />
        <input type="number" placeholder="Amount (optional)" value={amount} onChange={(e) => setAmount(e.target.value)} step="any" className={inputCls} />
        <input type="text" placeholder="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`col-span-2 ${inputCls}`}>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="px-4 py-2 bg-amber-400 text-slate-900 text-sm font-medium rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
          {submitting ? 'Adding...' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg border border-slate-600 hover:bg-slate-600 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroceryListPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  // Read weekStart from URL after mount — useState lazy initializer doesn't
  // run on the client during SSR hydration, so useEffect is required here.
  useEffect(() => {
    const offset = getWeekOffsetFromUrl();
    if (offset !== 0) setWeekOffset(offset);
  }, []);
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [mealPlanId, setMealPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedMonday = getMondayByOffset(weekOffset);
  const selectedSunday = new Date(selectedMonday);
  selectedSunday.setUTCDate(selectedMonday.getUTCDate() + 6);
  const weekLabel = `${selectedMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}–${selectedSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;

  const canGenerate = weekOffset >= 0 && weekOffset <= 1;

  const loadGroceryList = useCallback(async () => {
    setLoading(true);
    setError('');
    setGroceryList(null);
    setMealPlanId(null);
    try {
      const monday = getMondayByOffset(weekOffset);
      const mpRes = await fetch(`/api/meal-plan?weekStart=${formatDateISO(monday)}`);
      if (!mpRes.ok) { setError('Failed to load meal plan'); return; }
      const mp = await mpRes.json() as MealPlan;
      setMealPlanId(mp.id);
      if (!mp.groceryList) { setGroceryList(null); return; }
      const glRes = await fetch(`/api/grocery-list/${mp.groceryList.id}`);
      if (!glRes.ok) { setError('Failed to load grocery list'); return; }
      setGroceryList(await glRes.json() as GroceryList);
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => { loadGroceryList(); }, [loadGroceryList]);

  const handleGenerate = async () => {
    if (!mealPlanId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mealPlanId }) });
      if (!res.ok) { alert('Failed to generate grocery list'); return; }
      await loadGroceryList();
    } catch { alert('Network error, please try again'); }
    finally { setGenerating(false); }
  };

  const handleRegenerate = async () => {
    if (!mealPlanId) return;
    const hasManual = groceryList?.items.some((i) => i.isManual);
    if (hasManual && !window.confirm('Regenerating will delete all items including your manually added ones. Continue?')) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mealPlanId }) });
      if (!res.ok) { alert('Failed to regenerate grocery list'); return; }
      await loadGroceryList();
    } catch { alert('Network error, please try again'); }
    finally { setRegenerating(false); }
  };

  const handleToggleGroup = async (groupItems: GroceryItem[]) => {
    if (!groceryList) return;
    const targetChecked = !groupItems.every((i) => i.checked);
    const ids = new Set(groupItems.map((i) => i.id));
    const prev = groceryList;
    setGroceryList({ ...groceryList, items: groceryList.items.map((i) => ids.has(i.id) ? { ...i, checked: targetChecked } : i) });
    try {
      await Promise.all(groupItems.map((item) =>
        fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checked: targetChecked }) })
      ));
    } catch { setGroceryList(prev); }
  };

  const handleDeleteGroup = async (groupItems: GroceryItem[]) => {
    if (!groceryList) return;
    const ids = new Set(groupItems.map((i) => i.id));
    try {
      await Promise.all(groupItems.map((item) => fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, { method: 'DELETE' })));
      setGroceryList({ ...groceryList, items: groceryList.items.filter((i) => !ids.has(i.id)) });
    } catch { /* silent */ }
  };

  const handleCopy = async () => {
    if (!groceryList) return;
    const lines: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = groceryList.items.filter((i) => i.category === cat);
      if (catItems.length === 0) continue;
      lines.push(CATEGORY_LABELS[cat]);
      for (const group of groupItemsByName(catItems)) {
        const amounts = group.items.filter((i) => i.amount !== null || i.unit).map((i) => formatAmount(i.amount, i.unit)).join(', ');
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
    const res = await fetch(`/api/grocery-list/${groceryList.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, amount, unit, category }) });
    if (!res.ok) throw new Error('Failed to add item');
    const newItem = await res.json() as GroceryItem;
    setGroceryList({ ...groceryList, items: [...groceryList.items, newItem] });
    setShowAddForm(false);
  };

  const groupsByCategory = CATEGORY_ORDER.reduce<Record<string, GroupedItem[]>>((acc, cat) => {
    acc[cat] = groupItemsByName((groceryList?.items ?? []).filter((i) => i.category === cat));
    return acc;
  }, {});

  const allGroups = Object.values(groupsByCategory).flat();
  const totalItems = allGroups.length;
  const checkedItems = allGroups.filter((g) => g.items.every((i) => i.checked)).length;

  const btnSecondary = "inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 text-sm font-medium rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50 transition-colors";

  return (
    <div className="min-h-screen bg-[#080c14]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/recipes" className="text-xs text-slate-500 hover:text-amber-400 transition-colors tracking-wide uppercase">Library</Link>
            <span className="text-slate-700">/</span>
            <Link href="/meal-plan" className="text-xs text-slate-500 hover:text-amber-400 transition-colors tracking-wide uppercase">Meal Plan</Link>
            <span className="text-slate-700">/</span>
            <span className="text-xs text-slate-600 tracking-wide uppercase">Grocery List</span>
          </div>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-3xl font-bold text-slate-50 tracking-tight">Grocery List</h1>
              {groceryList && totalItems > 0 && (
                <p className="text-sm text-slate-500 mt-1">{checkedItems} of {totalItems} items checked</p>
              )}
            </div>
            {groceryList && (
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className={btnSecondary}>
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-emerald-400">Copied!</span>
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
                  <button onClick={handleRegenerate} disabled={regenerating} className={btnSecondary}>
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
        <div className="flex items-center justify-between mb-5 bg-slate-900 rounded-xl border border-slate-700 px-4 py-2.5">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <span className="text-sm font-medium text-slate-300">{weekLabel}</span>
            {weekOffset === 0 && <span className="ml-2 text-xs text-amber-400 font-medium">This week</span>}
            {weekOffset === 1 && <span className="ml-2 text-xs text-slate-500">Next week</span>}
            {weekOffset < 0 && <span className="ml-2 text-xs text-slate-600">Past</span>}
            {weekOffset > 1 && <span className="ml-2 text-xs text-slate-600">Future</span>}
          </div>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-950/40 border border-red-800/50 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-5 w-20 bg-slate-800 rounded mb-3" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => (<div key={j} className="h-12 bg-slate-900 rounded-lg" />))}
                </div>
              </div>
            ))}
          </div>
        ) : !groceryList ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              {weekOffset < 0 ? 'No list for this week' : 'No grocery list yet'}
            </h2>
            <p className="text-sm text-slate-500 mb-6">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {generating ? 'Generating...' : 'Generate Grocery List'}
                </button>
                <Link href="/meal-plan" className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
                  Go to Meal Plan
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const groups = groupsByCategory[cat];
              if (groups.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2 px-1">
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
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                            allChecked
                              ? 'border-slate-800 bg-slate-900/40'
                              : 'border-slate-700/60 bg-slate-900'
                          }`}
                        >
                          <button
                            onClick={() => handleToggleGroup(group.items)}
                            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              allChecked
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-slate-600 hover:border-emerald-500'
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
                            <span className={`text-sm font-medium transition-colors ${allChecked ? 'line-through text-slate-600' : 'text-slate-200'}`}>
                              {group.name}
                            </span>
                            {measurementText && (
                              <span className={`ml-2 text-xs ${allChecked ? 'text-slate-700' : 'text-slate-500'}`}>
                                {measurementText}
                              </span>
                            )}
                            {hasManual && (
                              <span className="ml-2 text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">
                                manual
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeleteGroup(group.items)}
                            className="flex-shrink-0 p-1 text-slate-700 hover:text-red-400 transition-colors rounded"
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

            {canGenerate && (
              <section>
                {showAddForm ? (
                  <AddItemForm onAdd={handleAddItem} onCancel={() => setShowAddForm(false)} />
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-slate-900 border-2 border-dashed border-slate-700 rounded-xl text-sm font-medium text-slate-600 hover:border-amber-600/50 hover:text-amber-500/70 hover:bg-amber-950/10 transition-all"
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
