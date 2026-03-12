import convert from 'convert-units';
import type { Ingredient } from '@/types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AggregatedItem {
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  /** Original ingredient entries that contributed to this item */
  sources: Ingredient[];
}

export interface RecipeWithIngredients {
  id: string;
  title: string;
  ingredients: Ingredient[];
}

// ─── Unit mapping ─────────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'Tbs',
  tablespoon: 'Tbs',
  tablespoons: 'Tbs',
  tbs: 'Tbs',
  cup: 'cup',
  cups: 'cup',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'fl-oz',
  'fluid ounce': 'fl-oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  qt: 'qt',
  quart: 'qt',
  quarts: 'qt',
  pint: 'pnt',
  pints: 'pnt',
  pt: 'pnt',
  gal: 'gal',
  gallon: 'gal',
  gallons: 'gal',
};

// ─── Category keywords ────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  produce: [
    'onion', 'garlic', 'tomato', 'lettuce', 'spinach', 'carrot', 'celery',
    'pepper', 'cucumber', 'zucchini', 'broccoli', 'mushroom', 'potato',
    'lemon', 'lime', 'apple', 'banana', 'berry', 'herb', 'basil', 'cilantro',
    'parsley', 'thyme', 'rosemary', 'ginger', 'avocado',
  ],
  dairy: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'egg', 'sour cream'],
  meat: [
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage',
    'salmon', 'tuna', 'shrimp', 'fish',
  ],
  pantry: [
    'flour', 'sugar', 'salt', 'pepper', 'oil', 'vinegar', 'soy sauce',
    'pasta', 'rice', 'bread', 'broth', 'stock', 'tomato sauce', 'can',
    'spice', 'seasoning', 'baking', 'honey', 'syrup', 'sauce', 'extract',
  ],
};

function inferCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return 'other';
}

// ─── Unit dimension helpers ───────────────────────────────────────────────────

type Dimension = 'volume' | 'mass' | 'unknown';

const VOLUME_UNITS = new Set(['tsp', 'Tbs', 'fl-oz', 'cup', 'pnt', 'qt', 'gal', 'ml', 'l']);
const MASS_UNITS = new Set(['oz', 'lb', 'g', 'kg']);

function getDimension(convertUnit: string): Dimension {
  if (VOLUME_UNITS.has(convertUnit)) return 'volume';
  if (MASS_UNITS.has(convertUnit)) return 'mass';
  return 'unknown';
}

function toBase(amount: number, convertUnit: string, dimension: Dimension): number {
  if (dimension === 'volume') {
    return convert(amount).from(convertUnit as Parameters<ReturnType<typeof convert>['from']>[0]).to('ml');
  }
  // mass
  return convert(amount).from(convertUnit as Parameters<ReturnType<typeof convert>['from']>[0]).to('g');
}

function fromBase(total: number, dimension: Dimension): { amount: number; unit: string } {
  if (dimension === 'volume') {
    if (total >= 1000) {
      return { amount: convert(total).from('ml').to('l'), unit: 'l' };
    } else if (total >= 240) {
      return { amount: convert(total).from('ml').to('cup'), unit: 'cup' };
    } else if (total >= 45) {
      return { amount: convert(total).from('ml').to('Tbs'), unit: 'Tbs' };
    } else {
      return { amount: convert(total).from('ml').to('tsp'), unit: 'tsp' };
    }
  } else {
    // mass
    if (total >= 1000) {
      return { amount: convert(total).from('g').to('kg'), unit: 'kg' };
    } else if (total >= 454) {
      return { amount: convert(total).from('g').to('lb'), unit: 'lb' };
    } else {
      return { amount: convert(total).from('g').to('oz'), unit: 'oz' };
    }
  }
}

// ─── Name normalization ───────────────────────────────────────────────────────

const STRIP_WORDS = new Set([
  // preparation descriptors
  'fresh', 'dried', 'frozen', 'cooked', 'raw', 'canned', 'whole',
  'large', 'medium', 'small', 'finely', 'thinly', 'roughly', 'coarsely',
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'peeled',
  'crushed', 'mashed', 'softened', 'melted', 'beaten', 'packed',
  'optional', 'divided', 'extra', 'heaping',
  // units that may still appear as leading words
  'pound', 'lb', 'oz', 'ounce', 'cup', 'tablespoon', 'teaspoon', 'tbsp', 'tsp',
]);

function normalizeName(name: string): string {
  let n = name.toLowerCase().trim();
  // Strip parenthetical text e.g. "(cut into pats)", "(optional)"
  n = n.replace(/\s*\([^)]*\)/g, '').trim();
  // Strip trailing punctuation
  n = n.replace(/[,;.]+$/, '').trim();
  // Strip leading descriptor/unit words (keep at least the last word)
  const words = n.split(/\s+/);
  let start = 0;
  while (start < words.length - 1 && STRIP_WORDS.has(words[start])) {
    start++;
  }
  n = words.slice(start).join(' ');
  // Simple plural normalization (trailing s)
  if (n.endsWith('s') && n.length > 2) {
    n = n.slice(0, -1);
  }
  return n;
}

function toDisplayName(normalizedKey: string): string {
  return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
}

// ─── Unit extraction from name ────────────────────────────────────────────────

function extractUnitFromName(ing: Ingredient): Ingredient {
  if (ing.unit !== null) return ing;
  const words = ing.name.trim().split(/\s+/);
  if (words.length < 2) return ing;
  const mapped = UNIT_MAP[words[0].toLowerCase()];
  if (mapped) {
    return { ...ing, unit: words[0], name: words.slice(1).join(' ') };
  }
  return ing;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export function aggregateIngredients(recipes: RecipeWithIngredients[]): AggregatedItem[] {
  // Collect and pre-process all ingredients (extract units embedded in names)
  const allIngredients: Ingredient[] = recipes.flatMap((r) => r.ingredients).map(extractUnitFromName);

  // Group by normalized name
  const byName = new Map<string, Ingredient[]>();
  for (const ing of allIngredients) {
    const key = normalizeName(ing.name);
    const group = byName.get(key);
    if (group) {
      group.push(ing);
    } else {
      byName.set(key, [ing]);
    }
  }

  const result: AggregatedItem[] = [];

  for (const [key, group] of byName) {
    // Derive canonical display name from the normalized key
    const canonicalName = toDisplayName(key);
    const category = inferCategory(canonicalName);

    // Sub-group by unit dimension
    type DimGroup = {
      dimension: Dimension;
      items: { amount: number; convertUnit: string; original: Ingredient }[];
      nullAmountItems: Ingredient[];
      unknownUnitItems: Ingredient[];
    };

    const volumeGroup: DimGroup = { dimension: 'volume', items: [], nullAmountItems: [], unknownUnitItems: [] };
    const massGroup: DimGroup = { dimension: 'mass', items: [], nullAmountItems: [], unknownUnitItems: [] };
    const nullAmountItems: Ingredient[] = [];
    const unknownUnitItems: Ingredient[] = [];

    for (const ing of group) {
      if (ing.amount === null) {
        nullAmountItems.push(ing);
        continue;
      }
      if (!ing.unit) {
        // No unit — treat as count; keep as separate item
        unknownUnitItems.push(ing);
        continue;
      }
      const normalizedUnit = UNIT_MAP[ing.unit.toLowerCase().trim()];
      if (!normalizedUnit) {
        unknownUnitItems.push(ing);
        continue;
      }
      const dim = getDimension(normalizedUnit);
      if (dim === 'volume') {
        volumeGroup.items.push({ amount: ing.amount, convertUnit: normalizedUnit, original: ing });
      } else if (dim === 'mass') {
        massGroup.items.push({ amount: ing.amount, convertUnit: normalizedUnit, original: ing });
      } else {
        unknownUnitItems.push(ing);
      }
    }

    // Sum volume items
    if (volumeGroup.items.length > 0) {
      const totalBase = volumeGroup.items.reduce((sum, item) => {
        return sum + toBase(item.amount, item.convertUnit, 'volume');
      }, 0);
      const { amount, unit } = fromBase(totalBase, 'volume');
      result.push({
        name: canonicalName,
        amount: Math.round(amount * 100) / 100,
        unit,
        category,
        sources: volumeGroup.items.map((i) => i.original),
      });
    }

    // Sum mass items
    if (massGroup.items.length > 0) {
      const totalBase = massGroup.items.reduce((sum, item) => {
        return sum + toBase(item.amount, item.convertUnit, 'mass');
      }, 0);
      const { amount, unit } = fromBase(totalBase, 'mass');
      result.push({
        name: canonicalName,
        amount: Math.round(amount * 100) / 100,
        unit,
        category,
        sources: massGroup.items.map((i) => i.original),
      });
    }

    // Null-amount items — one item per null-amount ingredient
    for (const ing of nullAmountItems) {
      result.push({
        name: canonicalName,
        amount: null,
        unit: ing.unit,
        category,
        sources: [ing],
      });
    }

    // Unknown-unit items — one item per ingredient
    for (const ing of unknownUnitItems) {
      result.push({
        name: canonicalName,
        amount: ing.amount,
        unit: ing.unit,
        category,
        sources: [ing],
      });
    }
  }

  return result;
}
