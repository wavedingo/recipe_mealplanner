'use client';

import { useState, useCallback, useTransition } from 'react';
import RecipeCard from '@/components/RecipeCard';
import type { ParsedRecipe, Ingredient, RecipeStep } from '@/types/index';
import { parseSimpleIngredients, parseSimpleSteps, parseOptionalInt } from '@/lib/recipe-utils';

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

interface RecipesClientProps {
  initialRecipes: Recipe[];
}

// ─── Add Recipe Modal ────────────────────────────────────────────────────────

type ModalTab = 'url' | 'manual';

type ParsedPreview = ParsedRecipe;

interface RecipeFormData {
  title: string;
  description: string;
  sourceUrl: string;
  imageUrl: string;
  servings: string;
  prepTimeMins: string;
  cookTimeMins: string;
  mealTags: string[];
  dietaryTags: string[];
  customTags: string;
  ingredientsRaw: string;
  stepsRaw: string;
}

const MEAL_TAG_OPTIONS = ['breakfast', 'lunch', 'dinner', 'dessert', 'sides'];
const DIETARY_TAG_OPTIONS = ['gluten-free', 'vegan', 'vegetarian', 'dairy-free', 'nut-free'];

const emptyForm = (): RecipeFormData => ({
  title: '',
  description: '',
  sourceUrl: '',
  imageUrl: '',
  servings: '',
  prepTimeMins: '',
  cookTimeMins: '',
  mealTags: [],
  dietaryTags: [],
  customTags: '',
  ingredientsRaw: '',
  stepsRaw: '',
});

function parsedToFormData(p: ParsedPreview): RecipeFormData {
  return {
    title: p.title ?? '',
    description: p.description ?? '',
    sourceUrl: p.sourceUrl ?? '',
    imageUrl: p.imageUrl ?? '',
    servings: p.servings != null ? String(p.servings) : '',
    prepTimeMins: p.prepTimeMins != null ? String(p.prepTimeMins) : '',
    cookTimeMins: p.cookTimeMins != null ? String(p.cookTimeMins) : '',
    mealTags: [],
    dietaryTags: [],
    customTags: '',
    ingredientsRaw: p.ingredients
      .map((ing) => [ing.amount, ing.unit, ing.name].filter(Boolean).join(' '))
      .join('\n'),
    stepsRaw: p.steps.map((s) => s.text).join('\n'),
  };
}

function formDataToPayload(form: RecipeFormData) {
  const customTagList = form.customTags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const allTags = [...form.mealTags, ...form.dietaryTags, ...customTagList];
  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    sourceUrl: form.sourceUrl.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    servings: parseOptionalInt(form.servings),
    prepTimeMins: parseOptionalInt(form.prepTimeMins),
    cookTimeMins: parseOptionalInt(form.cookTimeMins),
    tags: allTags,
    ingredients: parseSimpleIngredients(form.ingredientsRaw.split('\n')),
    steps: parseSimpleSteps(form.stepsRaw.split('\n')),
  };
}

interface RecipeFormProps {
  form: RecipeFormData;
  onChange: (updates: Partial<RecipeFormData>) => void;
}

function TagSelector({
  mealTags,
  dietaryTags,
  customTags,
  onChange,
}: {
  mealTags: string[];
  dietaryTags: string[];
  customTags: string;
  onChange: (updates: Partial<RecipeFormData>) => void;
}) {
  const toggleMeal = (tag: string) =>
    onChange({ mealTags: mealTags.includes(tag) ? mealTags.filter((t) => t !== tag) : [...mealTags, tag] });
  const toggleDietary = (tag: string) =>
    onChange({ dietaryTags: dietaryTags.includes(tag) ? dietaryTags.filter((t) => t !== tag) : [...dietaryTags, tag] });

  const pillClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
    }`;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Meal Type</label>
        <div className="flex flex-wrap gap-2">
          {MEAL_TAG_OPTIONS.map((tag) => (
            <button key={tag} type="button" onClick={() => toggleMeal(tag)} className={pillClass(mealTags.includes(tag))}>
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Dietary</label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAG_OPTIONS.map((tag) => (
            <button key={tag} type="button" onClick={() => toggleDietary(tag)} className={pillClass(dietaryTags.includes(tag))}>
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Custom Tags <span className="text-gray-400 font-normal">(comma separated)</span>
        </label>
        <input
          type="text"
          value={customTags}
          onChange={(e) => onChange({ customTags: e.target.value })}
          placeholder="quick, weeknight, make-ahead"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

function RecipeFormFields({ form, onChange }: RecipeFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Recipe title"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
        <input
          type="url"
          value={form.sourceUrl}
          onChange={(e) => onChange({ sourceUrl: e.target.value })}
          placeholder="https://..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
        <input
          type="url"
          value={form.imageUrl}
          onChange={(e) => onChange({ imageUrl: e.target.value })}
          placeholder="https://..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {form.imageUrl && (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.imageUrl}
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
          <input type="number" value={form.servings} onChange={(e) => onChange({ servings: e.target.value })} placeholder="4" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prep (min)</label>
          <input type="number" value={form.prepTimeMins} onChange={(e) => onChange({ prepTimeMins: e.target.value })} placeholder="15" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cook (min)</label>
          <input type="number" value={form.cookTimeMins} onChange={(e) => onChange({ cookTimeMins: e.target.value })} placeholder="30" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <TagSelector
        mealTags={form.mealTags}
        dietaryTags={form.dietaryTags}
        customTags={form.customTags}
        onChange={onChange}
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Ingredients <span className="text-gray-400 font-normal">(one per line, e.g. &quot;2 cups flour&quot;)</span>
        </label>
        <textarea
          value={form.ingredientsRaw}
          onChange={(e) => onChange({ ingredientsRaw: e.target.value })}
          placeholder={"2 cups flour\n1 tsp salt\n3 large eggs"}
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Steps <span className="text-gray-400 font-normal">(one per line)</span>
        </label>
        <textarea
          value={form.stepsRaw}
          onChange={(e) => onChange({ stepsRaw: e.target.value })}
          placeholder={"Preheat oven to 350°F.\nMix dry ingredients.\nBake for 30 minutes."}
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
      </div>
    </div>
  );
}

interface AddRecipeModalProps {
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
}

function AddRecipeModal({ onClose, onSaved }: AddRecipeModalProps) {
  const [tab, setTab] = useState<ModalTab>('url');
  const [urlInput, setUrlInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [form, setForm] = useState<RecipeFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showForm, setShowForm] = useState(false); // after parse in URL tab

  const updateForm = (updates: Partial<RecipeFormData>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const handleParse = async () => {
    setParseError('');
    setParsing(true);
    try {
      const res = await fetch('/api/recipes/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? 'Failed to parse recipe';
        if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
          setParseError('This site blocks automated access. Switch to the Manual Entry tab to add this recipe yourself.');
        } else {
          setParseError(errMsg);
        }
        return;
      }
      setForm(parsedToFormData(data as ParsedPreview));
      setShowForm(true);
    } catch {
      setParseError('Network error, please try again');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    setSaveError('');
    if (!form.title.trim()) {
      setSaveError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDataToPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save recipe');
        return;
      }
      onSaved(data as Recipe);
    } catch {
      setSaveError('Network error, please try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['url', 'manual'] as ModalTab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setShowForm(false);
                setParseError('');
                setSaveError('');
                if (t === 'manual') setForm(emptyForm());
              }}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'url' ? 'From URL' : 'Manual Entry'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tab === 'url' && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Recipe URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleParse()}
                    placeholder="https://www.example.com/recipe"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleParse}
                    disabled={!urlInput.trim() || parsing}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {parsing ? 'Parsing…' : 'Parse'}
                  </button>
                </div>
                {parseError && (
                  <p className="text-red-600 text-sm">{parseError}</p>
                )}
              </div>

              {showForm && (
                <>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm text-gray-500 mb-4">Review and edit the parsed recipe before saving:</p>
                    <RecipeFormFields form={form} onChange={updateForm} />
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'manual' && (
            <RecipeFormFields form={form} onChange={updateForm} />
          )}
        </div>

        {/* Footer */}
        {(tab === 'manual' || showForm) && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            {saveError ? (
              <p className="text-red-600 text-sm">{saveError}</p>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save Recipe'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────

export default function RecipesClient({ initialRecipes }: RecipesClientProps) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [, startTransition] = useTransition();

  // Collect unique tags from all recipes
  const allTags = Array.from(
    new Map(
      recipes.flatMap((r) => r.tags.map(({ tag }) => [tag.id, tag]))
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Client-side filtering
  const filtered = recipes.filter((r) => {
    const matchesSearch =
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.ingredients.some((ing) =>
        ing.name.toLowerCase().includes(search.toLowerCase())
      );
    const matchesTag =
      !activeTag ||
      r.tags.some(({ tag }) => tag.id === activeTag);
    return matchesSearch && matchesTag;
  });

  const handleSaved = useCallback((newRecipe: Recipe) => {
    startTransition(() => {
      setRecipes((prev) => [newRecipe, ...prev]);
      setShowModal(false);
    });
  }, []);

  return (
    <>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipe Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Recipe
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes or ingredients…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeTag === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveTag(activeTag === tag.id ? null : tag.id)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTag === tag.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Recipe grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">
            {search || activeTag ? 'No recipes match your filters' : 'No recipes yet'}
          </p>
          {!search && !activeTag && (
            <p className="text-gray-400 text-sm mt-1">Add your first recipe to get started</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AddRecipeModal onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}
    </>
  );
}
