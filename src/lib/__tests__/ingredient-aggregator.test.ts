import { aggregateIngredients, AggregatedItem, RecipeWithIngredients } from '../ingredient-aggregator';

function makeRecipe(id: string, title: string, ingredients: { amount: number | null; unit: string | null; name: string; notes?: string | null }[]): RecipeWithIngredients {
  return {
    id,
    title,
    ingredients: ingredients.map((i) => ({ ...i, notes: i.notes ?? null })),
  };
}

describe('aggregateIngredients', () => {
  it('sums same ingredients with same unit', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 1, unit: 'cup', name: 'flour' },
      ]),
      makeRecipe('r2', 'Recipe 2', [
        { amount: 2, unit: 'cup', name: 'flour' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('flour');
    expect(result[0].unit).toBe('cup');
    expect(result[0].amount).toBeCloseTo(3, 1);
  });

  it('converts compatible units (cup + tbsp) and sums', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 1, unit: 'cup', name: 'milk' },
      ]),
      makeRecipe('r2', 'Recipe 2', [
        { amount: 2, unit: 'tablespoon', name: 'milk' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('milk');
    // 1 cup = 236.59ml, 2 tbsp = 2 * 14.79ml = 29.57ml => total ~266.16ml
    // 266ml >= 240ml => should be in cups, ~1.13 cups
    expect(result[0].unit).toBe('cup');
    expect(result[0].amount).toBeCloseTo(1.13, 1);
  });

  it('keeps incompatible units (cup + lb) as separate items', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 2, unit: 'cup', name: 'butter' },
        { amount: 2, unit: 'lb', name: 'butter' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    // One item for volume (cup), one for mass (lb)
    expect(result).toHaveLength(2);
    const units = result.map((r) => r.unit);
    // 2 cups = ~473ml >= 240ml => cup
    expect(units).toContain('cup');
    expect(units.some((u) => u === 'lb' || u === 'oz')).toBe(true);
  });

  it('keeps null-amount ingredients as separate items', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: null, unit: 'cup', name: 'salt' },
        { amount: 1, unit: 'tsp', name: 'salt' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    // null-amount is kept separate, the 1 tsp is a separate aggregated item
    const saltItems = result.filter((r) => r.name.toLowerCase().includes('salt'));
    expect(saltItems.length).toBeGreaterThanOrEqual(2);
    const nullItem = saltItems.find((r) => r.amount === null);
    expect(nullItem).toBeDefined();
  });

  it('infers produce category for onion', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [{ amount: 1, unit: null, name: 'onion' }]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result[0].category).toBe('produce');
  });

  it('infers dairy category for milk', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [{ amount: 1, unit: 'cup', name: 'milk' }]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result[0].category).toBe('dairy');
  });

  it('infers meat category for chicken', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [{ amount: 1, unit: 'lb', name: 'chicken breast' }]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result[0].category).toBe('meat');
  });

  it('infers pantry category for rice', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [{ amount: 1, unit: 'cup', name: 'rice' }]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result[0].category).toBe('pantry');
  });

  it('assigns other category for unrecognized names', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [{ amount: 1, unit: 'cup', name: 'mystery ingredient xyz' }]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result[0].category).toBe('other');
  });

  it('groups plural and singular names together', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 1, unit: 'tsp', name: 'garlic' },
        { amount: 2, unit: 'tsp', name: 'garlics' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(3, 1);
  });

  it('does not merge ground beef with beef', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 1, unit: 'lb', name: 'beef' },
        { amount: 1, unit: 'lb', name: 'ground beef' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    const names = result.map((r) => r.name);
    expect(names.some((n) => n.toLowerCase() === 'beef')).toBe(true);
    expect(names.some((n) => n.toLowerCase() === 'ground beef')).toBe(true);
  });

  it('converts g and kg (mass) and sums', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 500, unit: 'g', name: 'flour' },
        { amount: 1, unit: 'kg', name: 'flour' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    expect(result).toHaveLength(1);
    // 500g + 1000g = 1500g => >= 1000g => kg
    expect(result[0].unit).toBe('kg');
    expect(result[0].amount).toBeCloseTo(1.5, 1);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it('handles ingredients with no unit (count items) as separate items', () => {
    const recipes = [
      makeRecipe('r1', 'Recipe 1', [
        { amount: 2, unit: null, name: 'egg' },
        { amount: 3, unit: null, name: 'egg' },
      ]),
    ];
    const result = aggregateIngredients(recipes);
    // Both kept separate since no unit => unknownUnitItems
    const eggItems = result.filter((r) => r.name.toLowerCase().includes('egg'));
    expect(eggItems.length).toBe(2);
  });
});
