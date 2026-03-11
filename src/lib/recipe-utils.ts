import type { Ingredient, RecipeStep } from '@/types/index';

export const knownUnits = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l',
  'clove', 'cloves', 'piece', 'pieces', 'slice', 'slices', 'can', 'cans',
  'bunch', 'handful', 'pinch', 'dash', 'quart', 'pint', 'gallon',
]);

export function parseSimpleIngredients(lines: string[]): Ingredient[] {
  return lines.filter(Boolean).map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^([\d./]+(?:\s*[\d./]+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
    if (match) {
      const amount = parseFloat(match[1].replace(/\s+/g, ''));
      const possibleUnit = match[2] ?? null;
      const rest = match[3] ?? '';
      if (possibleUnit && knownUnits.has(possibleUnit.toLowerCase())) {
        return { amount: isNaN(amount) ? null : amount, unit: possibleUnit, name: rest, notes: null };
      }
      return { amount: isNaN(amount) ? null : amount, unit: null, name: (possibleUnit ? possibleUnit + ' ' + rest : rest).trim(), notes: null };
    }
    return { amount: null, unit: null, name: trimmed, notes: null };
  });
}

export function parseSimpleSteps(lines: string[]): RecipeStep[] {
  return lines.filter(Boolean).map((line, i) => ({ order: i + 1, text: line.trim() }));
}

export function parseOptionalInt(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : undefined;
}
