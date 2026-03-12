'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { parseSimpleIngredients, parseSimpleSteps, parseOptionalInt } from '@/lib/recipe-utils';
import type { Ingredient, RecipeStep } from '@/types/index';

const MEAL_TAG_OPTIONS = ['breakfast', 'lunch', 'dinner', 'dessert', 'sides'];
const DIETARY_TAG_OPTIONS = ['gluten-free', 'vegan', 'vegetarian', 'dairy-free', 'nut-free'];

interface RecipeTag {
  tag: { id: string; name: string };
}

interface Recipe {
  id: string;
  title: string;
  description?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  servings?: number | null;
  prepTimeMins?: number | null;
  cookTimeMins?: number | null;
  rating?: number | null;
  notes?: string | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  tags: RecipeTag[];
  createdAt: string;
  updatedAt: string;
}

// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number | null | undefined;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;

  return (
    <div className="flex gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          onMouseLeave={() => !readOnly && setHovered(null)}
          className={`transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
        >
          <svg
            className={`w-6 h-6 ${star <= display ? 'text-amber-400' : 'text-gray-300'} transition-colors`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ─── Servings Adjuster ───────────────────────────────────────────────────────

function ServingsAdjuster({
  base,
  current,
  onChange,
}: {
  base: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
        disabled={current <= 1}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <span className="text-lg font-semibold w-8 text-center text-gray-900">{current}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(99, current + 1))}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {current !== base && (
        <button
          type="button"
          onClick={() => onChange(base)}
          className="text-xs text-blue-600 hover:underline ml-1"
        >
          Reset
        </button>
      )}
    </div>
  );
}

// ─── Scale ingredient amount ──────────────────────────────────────────────────

function scaleAmount(amount: number | null, baseServings: number, currentServings: number): string {
  if (amount === null) return '';
  const scaled = (amount * currentServings) / baseServings;
  // Avoid ugly floating points: round to 3 significant figures
  const rounded = parseFloat(scaled.toPrecision(3));
  // Show as fraction-ish if close to simple fraction
  return String(rounded);
}

// ─── Ingredient display ───────────────────────────────────────────────────────

function IngredientItem({
  ingredient,
  scale,
}: {
  ingredient: Ingredient;
  scale: number; // multiplier
}) {
  const amount =
    ingredient.amount != null
      ? parseFloat((ingredient.amount * scale).toPrecision(3))
      : null;

  return (
    <li className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
      <span className="text-gray-800 text-sm leading-relaxed">
        {amount != null && <strong className="font-semibold">{amount} </strong>}
        {ingredient.unit && <span className="text-gray-600">{ingredient.unit} </span>}
        {ingredient.name}
        {ingredient.notes && (
          <span className="text-gray-400 ml-1">({ingredient.notes})</span>
        )}
      </span>
    </li>
  );
}

// ─── Edit form helpers ────────────────────────────────────────────────────────

interface EditableRecipe {
  title: string;
  description: string;
  sourceUrl: string;
  imageUrl: string;
  servings: string;
  prepTimeMins: string;
  cookTimeMins: string;
  rating: number | null;
  notes: string;
  mealTags: string[];
  dietaryTags: string[];
  customTags: string;
  ingredientsRaw: string;
  stepsRaw: string;
}

function recipeToEditable(r: Recipe): EditableRecipe {
  const allTagNames = r.tags.map(({ tag }) => tag.name.toLowerCase());
  const mealTags = allTagNames.filter((t) => MEAL_TAG_OPTIONS.includes(t));
  const dietaryTags = allTagNames.filter((t) => DIETARY_TAG_OPTIONS.includes(t));
  const customTagList = allTagNames.filter((t) => !MEAL_TAG_OPTIONS.includes(t) && !DIETARY_TAG_OPTIONS.includes(t));
  return {
    title: r.title,
    description: r.description ?? '',
    sourceUrl: r.sourceUrl ?? '',
    imageUrl: r.imageUrl ?? '',
    servings: r.servings != null ? String(r.servings) : '',
    prepTimeMins: r.prepTimeMins != null ? String(r.prepTimeMins) : '',
    cookTimeMins: r.cookTimeMins != null ? String(r.cookTimeMins) : '',
    rating: r.rating ?? null,
    notes: r.notes ?? '',
    mealTags,
    dietaryTags,
    customTags: customTagList.join(', '),
    ingredientsRaw: r.ingredients
      .map((ing) => [ing.amount, ing.unit, ing.name].filter(Boolean).join(' '))
      .join('\n'),
    stepsRaw: r.steps.map((s) => s.text).join('\n'),
  };
}

function editableToPayload(e: EditableRecipe) {
  const customTagList = e.customTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  return {
    title: e.title.trim(),
    description: e.description.trim() || null,
    sourceUrl: e.sourceUrl.trim() || null,
    imageUrl: e.imageUrl.trim() || null,
    servings: parseOptionalInt(e.servings) ?? null,
    prepTimeMins: parseOptionalInt(e.prepTimeMins) ?? null,
    cookTimeMins: parseOptionalInt(e.cookTimeMins) ?? null,
    rating: e.rating,
    notes: e.notes.trim() || null,
    tags: [...e.mealTags, ...e.dietaryTags, ...customTagList],
    ingredients: parseSimpleIngredients(e.ingredientsRaw.split('\n')),
    steps: parseSimpleSteps(e.stepsRaw.split('\n')),
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Servings scaling
  const [currentServings, setCurrentServings] = useState<number>(1);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<EditableRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Notes auto-save
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Rating
  const [rating, setRating] = useState<number | null>(null);

  // Toast state
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // Load recipe
  useEffect(() => {
    fetch(`/api/recipes/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Recipe not found');
        return res.json() as Promise<Recipe>;
      })
      .then((data) => {
        setRecipe(data);
        setCurrentServings(data.servings ?? 1);
        setNotes(data.notes ?? '');
        setRating(data.rating ?? null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const handleEdit = () => {
    if (!recipe) return;
    setEditData(recipeToEditable(recipe));
    setEditMode(true);
    setSaveError('');
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditData(null);
    setSaveError('');
  };

  const handleSaveEdit = async () => {
    if (!editData || !recipe) return;
    if (!editData.title.trim()) {
      setSaveError('Title is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editableToPayload(editData)),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save');
        return;
      }
      const updated = data as Recipe;
      setRecipe(updated);
      setCurrentServings(updated.servings ?? 1);
      setNotes(updated.notes ?? '');
      setRating(updated.rating ?? null);
      setEditMode(false);
      setEditData(null);
      showToast('Recipe saved!');
    } catch {
      setSaveError('Network error, please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleRatingChange = useCallback(
    async (newRating: number) => {
      if (!recipe) return;
      const previousRating = rating;
      setRating(newRating); // optimistic update
      try {
        const res = await fetch(`/api/recipes/${recipe.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: newRating }),
        });
        if (!res.ok) throw new Error('Failed to save rating');
      } catch {
        setRating(previousRating); // rollback on failure
        showToast('Failed to save rating');
      }
    },
    [recipe, rating, showToast]
  );

  const handleNotesSave = useCallback(async () => {
    if (!recipe) return;
    setNotesSaving(true);
    try {
      await fetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      showToast('Notes saved');
    } catch {
      // silent fail
    } finally {
      setNotesSaving(false);
    }
  }, [recipe, notes, showToast]);

  const handleAddToMealPlan = () => {
    showToast('Feature coming soon — meal plan integration in progress!');
  };

  const handleDelete = async () => {
    if (!recipe) return;
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      window.location.href = '/recipes';
    } catch {
      showToast('Failed to delete recipe');
    }
  };

  const handleShare = async () => {
    if (!recipe) return;
    const shareUrl = recipe.sourceUrl || window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: recipe.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard!');
      }
    } catch {
      // user cancelled share or clipboard failed
    }
  };

  // ── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading recipe…</p>
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600 font-medium">{error || 'Recipe not found'}</p>
          <Link href="/recipes" className="text-blue-600 hover:underline text-sm">
            Back to recipes
          </Link>
        </div>
      </div>
    );
  }

  const baseServings = recipe.servings ?? 1;
  const scale = currentServings / baseServings;

  // ── Edit mode view ────────────────────────────────────────────────────────

  if (editMode && editData) {
    const update = (key: keyof EditableRecipe) => (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setEditData((prev) => prev ? { ...prev, [key]: e.target.value } : prev);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {/* Back */}
          <Link href="/recipes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to recipes
          </Link>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900">Edit Recipe</h1>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
                <button onClick={handleCancelEdit} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

            {saveError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{saveError}</div>
            )}

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input value={editData.title} onChange={update('title')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={editData.description} onChange={update('description')} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
                <input type="url" value={editData.sourceUrl} onChange={update('sourceUrl')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input type="url" value={editData.imageUrl} onChange={update('imageUrl')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {editData.imageUrl && (
                  <div className="mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editData.imageUrl}
                      alt="Preview"
                      className="h-24 w-36 object-cover rounded-lg border border-gray-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
                  <input type="number" value={editData.servings} onChange={update('servings')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prep (min)</label>
                  <input type="number" value={editData.prepTimeMins} onChange={update('prepTimeMins')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cook (min)</label>
                  <input type="number" value={editData.cookTimeMins} onChange={update('cookTimeMins')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                <StarRating
                  value={editData.rating}
                  onChange={(v) => setEditData((prev) => prev ? { ...prev, rating: v } : prev)}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Meal Type</label>
                  <div className="flex flex-wrap gap-2">
                    {MEAL_TAG_OPTIONS.map((tag) => {
                      const active = editData.mealTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setEditData((prev) => prev ? { ...prev, mealTags: active ? prev.mealTags.filter((t) => t !== tag) : [...prev.mealTags, tag] } : prev)}
                          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Dietary</label>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_TAG_OPTIONS.map((tag) => {
                      const active = editData.dietaryTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setEditData((prev) => prev ? { ...prev, dietaryTags: active ? prev.dietaryTags.filter((t) => t !== tag) : [...prev.dietaryTags, tag] } : prev)}
                          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Tags <span className="text-gray-400 font-normal">(comma separated)</span>
                  </label>
                  <input
                    value={editData.customTags}
                    onChange={(e) => setEditData((prev) => prev ? { ...prev, customTags: e.target.value } : prev)}
                    placeholder="quick, weeknight, make-ahead"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ingredients <span className="text-gray-400 font-normal">(one per line)</span>
                </label>
                <textarea value={editData.ingredientsRaw} onChange={update('ingredientsRaw')} rows={8} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Steps <span className="text-gray-400 font-normal">(one per line)</span>
                </label>
                <textarea value={editData.stepsRaw} onChange={update('stepsRaw')} rows={8} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={editData.notes} onChange={update('notes')} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────

  const totalTime = (recipe.prepTimeMins ?? 0) + (recipe.cookTimeMins ?? 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in">
          {toast}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Back nav */}
        <Link href="/recipes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to recipes
        </Link>

        {/* Hero image */}
        {recipe.imageUrl && (
          <div className="relative w-full h-64 sm:h-80 rounded-2xl overflow-hidden mb-6 shadow-sm">
            <Image
              src={recipe.imageUrl}
              alt={recipe.title}
              fill
              className="object-cover"
              priority
              unoptimized // user-supplied URLs are external; Next.js image optimization requires an allowlist
            />
          </div>
        )}

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">{recipe.title}</h1>

              {/* Tags */}
              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {recipe.tags.map(({ tag }) => (
                    <span key={tag.id} className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {recipe.description && (
                <p className="text-gray-600 text-sm leading-relaxed">{recipe.description}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleEdit}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
              <button
                onClick={handleAddToMealPlan}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Add to meal plan
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-5 mt-4 pt-4 border-t border-gray-100">
            {/* Rating */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Rating:</span>
              <StarRating value={rating} onChange={handleRatingChange} />
            </div>

            {/* Time */}
            {totalTime > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {recipe.prepTimeMins != null && <span>Prep: {recipe.prepTimeMins} min</span>}
                {recipe.prepTimeMins != null && recipe.cookTimeMins != null && <span>·</span>}
                {recipe.cookTimeMins != null && <span>Cook: {recipe.cookTimeMins} min</span>}
                {recipe.prepTimeMins != null && recipe.cookTimeMins != null && (
                  <span className="font-medium text-gray-700">({totalTime} min total)</span>
                )}
              </div>
            )}

            {/* Source */}
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Source
              </a>
            )}
          </div>
        </div>

        {/* Servings adjuster */}
        {recipe.servings != null && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-4 mb-5 flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Servings:</span>
            <ServingsAdjuster
              base={baseServings}
              current={currentServings}
              onChange={setCurrentServings}
            />
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ingredients</h2>
            <ul className="space-y-0">
              {recipe.ingredients.map((ing, i) => (
                <IngredientItem key={i} ingredient={ing} scale={scale} />
              ))}
            </ul>
          </div>
        )}

        {/* Steps */}
        {recipe.steps.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Instructions</h2>
            <ol className="space-y-4">
              {recipe.steps
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((step) => (
                  <li key={step.order} className="flex gap-4">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center mt-0.5">
                      {step.order}
                    </span>
                    <p className="text-gray-800 text-sm leading-relaxed pt-1">{step.text}</p>
                  </li>
                ))}
            </ol>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
            {notesSaving && (
              <span className="text-xs text-gray-400">Saving…</span>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (recipe.notes ?? '')) {
                handleNotesSave();
              }
            }}
            placeholder="Add your personal notes, substitutions, or tips…"
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y bg-gray-50 placeholder-gray-400"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleNotesSave}
              disabled={notesSaving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
