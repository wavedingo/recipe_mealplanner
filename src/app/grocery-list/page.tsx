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
          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <input
          type="number"
          placeholder="Amount (optional)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="any"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Unit (optional)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const currentMonday = getMondayOfWeek(new Date());

  const loadGroceryList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Get current week's meal plan first
      const mpRes = await fetch(`/api/meal-plan?weekStart=${formatDateISO(currentMonday)}`);
      if (!mpRes.ok) {
        setError('Failed to load meal plan');
        return;
      }
      const mp = await mpRes.json() as MealPlan;

      if (!mp.groceryList) {
        // No grocery list yet
        setGroceryList(null);
        return;
      }

      // Fetch the grocery list
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
  }, [currentMonday]);

  useEffect(() => {
    loadGroceryList();
  }, [loadGroceryList]);

  const handleToggleChecked = async (item: GroceryItem) => {
    if (!groceryList) return;
    const optimistic = {
      ...groceryList,
      items: groceryList.items.map((i) =>
        i.id === item.id ? { ...i, checked: !i.checked } : i
      ),
    };
    setGroceryList(optimistic);
    try {
      const res = await fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: !item.checked }),
      });
      if (!res.ok) {
        // Revert
        setGroceryList(groceryList);
      }
    } catch {
      setGroceryList(groceryList);
    }
  };

  const handleDeleteItem = async (item: GroceryItem) => {
    if (!groceryList) return;
    try {
      const res = await fetch(`/api/grocery-list/${groceryList.id}/items/${item.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGroceryList({
          ...groceryList,
          items: groceryList.items.filter((i) => i.id !== item.id),
        });
      }
    } catch {
      // Silent failure
    }
  };

  const handleAddItem = async (name: string, amount?: number, unit?: string, category?: string) => {
    if (!groceryList) return;
    const res = await fetch(`/api/grocery-list/${groceryList.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount, unit, category }),
    });
    if (!res.ok) {
      throw new Error('Failed to add item');
    }
    const newItem = await res.json() as GroceryItem;
    setGroceryList({
      ...groceryList,
      items: [...groceryList.items, newItem],
    });
    setShowAddForm(false);
  };

  const handleRegenerate = async () => {
    // Warn if there are manual items
    const hasManual = groceryList?.items.some((i) => i.isManual);
    if (hasManual) {
      const ok = window.confirm(
        'Regenerating will delete all items including your manually added ones. Continue?'
      );
      if (!ok) return;
    }

    setRegenerating(true);
    try {
      // Get current week's meal plan
      const mpRes = await fetch(`/api/meal-plan?weekStart=${formatDateISO(currentMonday)}`);
      if (!mpRes.ok) {
        alert('Failed to load meal plan');
        return;
      }
      const mp = await mpRes.json() as MealPlan;

      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId: mp.id }),
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

  // Group items by category
  const itemsByCategory = CATEGORY_ORDER.reduce<Record<string, GroceryItem[]>>((acc, cat) => {
    acc[cat] = (groceryList?.items ?? []).filter((i) => i.category === cat);
    return acc;
  }, {});

  const totalItems = groceryList?.items.length ?? 0;
  const checkedItems = groceryList?.items.filter((i) => i.checked).length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/recipes" className="text-sm text-blue-600 hover:underline">
                Recipe Library
              </Link>
              <span className="text-gray-400">/</span>
              <Link href="/meal-plan" className="text-sm text-blue-600 hover:underline">
                Meal Plan
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-sm text-gray-500">Grocery List</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Grocery List</h1>
            {groceryList && totalItems > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {checkedItems} of {totalItems} items checked
              </p>
            )}
          </div>

          {groceryList && (
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
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No grocery list yet</h2>
            <p className="text-sm text-gray-500 mb-6">
              Add recipes to your meal plan and generate a grocery list.
            </p>
            <Link
              href="/meal-plan"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Go to Meal Plan
            </Link>
          </div>
        ) : (
          /* Grocery list */
          <div className="space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const items = itemsByCategory[cat];
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat]}
                  </h2>
                  <ul className="space-y-1">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className={`flex items-center gap-3 p-3 bg-white rounded-xl border transition-colors ${
                          item.checked ? 'border-gray-100 bg-gray-50' : 'border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => handleToggleChecked(item)}
                          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            item.checked
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300 hover:border-green-400'
                          }`}
                          aria-label={item.checked ? 'Mark as not done' : 'Mark as done'}
                        >
                          {item.checked && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm font-medium transition-colors ${
                              item.checked ? 'line-through text-gray-400' : 'text-gray-800'
                            }`}
                          >
                            {item.name}
                          </span>
                          {(item.amount !== null || item.unit) && (
                            <span className={`ml-2 text-xs ${item.checked ? 'text-gray-300' : 'text-gray-500'}`}>
                              {formatAmount(item.amount, item.unit)}
                            </span>
                          )}
                          {item.isManual && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                              manual
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                          aria-label="Delete item"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {/* Add item section */}
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
          </div>
        )}
      </div>
    </div>
  );
}
