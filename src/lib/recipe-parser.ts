import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedRecipe, Ingredient, RecipeStep } from '@/types/index';

// ---------------------------------------------------------------------------
// ISO 8601 duration parsing
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 duration string to total minutes.
 * Handles forms like "PT15M", "PT1H30M", "P0DT45M", "PT1H".
 * Returns undefined if the string is falsy or unparsable.
 */
export function parseDuration(duration: string | undefined | null): number | undefined {
  if (!duration) return undefined;
  // ISO 8601 duration: P[nD]T[nH][nM]
  // We only care about hours and minutes; ignore days, weeks, months, years.
  const hoursMatch = duration.match(/(\d+(?:\.\d+)?)H/i);
  const minutesMatch = duration.match(/(\d+(?:\.\d+)?)M/i);
  if (!hoursMatch && !minutesMatch) return undefined;
  const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseFloat(minutesMatch[1]) : 0;
  const total = hours * 60 + minutes;
  return total > 0 ? Math.round(total) : undefined;
}

// ---------------------------------------------------------------------------
// Ingredient string parsing
// ---------------------------------------------------------------------------

const UNITS = [
  'tablespoons', 'tablespoon', 'tbsps', 'tbsp',
  'teaspoons', 'teaspoon', 'tsps', 'tsp',
  'cups', 'cup',
  'ounces', 'ounce', 'ozs', 'oz',
  'pounds', 'pound', 'lbs', 'lb',
  'grams', 'gram', 'gs', 'g',
  'kilograms', 'kilogram', 'kgs', 'kg',
  'milliliters', 'milliliter', 'mls', 'ml',
  'liters', 'liter', 'ls', 'l',
  'pinches', 'pinch',
  'handfuls', 'handful',
  'cloves', 'clove',
  'slices', 'slice',
  'stalks', 'stalk',
  'sprigs', 'sprig',
  'cans', 'can',
  'packages', 'package', 'pkgs', 'pkg',
  'pieces', 'piece',
  'inches', 'inch',
  'quarts', 'quart', 'qts', 'qt',
  'pints', 'pint', 'pts', 'pt',
  'gallons', 'gallon', 'gals', 'gal',
  'sticks', 'stick',
  'heads', 'head',
  'bunches', 'bunch',
  'links', 'link',
  'sheets', 'sheet',
  'drops', 'drop',
  'dashes', 'dash',
];

// Sorted longest-first to avoid partial matches (e.g. "tablespoon" before "tbsp")
const UNITS_SORTED = [...UNITS].sort((a, b) => b.length - a.length);

// Regex to match common fraction characters + regular fractions
const FRACTION_MAP: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
};

function parseFraction(s: string): number | null {
  const trimmed = s.trim();
  if (FRACTION_MAP[trimmed] !== undefined) return FRACTION_MAP[trimmed];
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const slashMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) return parseInt(slashMatch[1], 10) / parseInt(slashMatch[2], 10);
  return null;
}

/**
 * Parse a single ingredient string into structured form.
 * Examples: "2 cups flour", "1/2 tsp salt", "3 large eggs", "salt and pepper to taste"
 */
export function parseIngredient(raw: string): Ingredient {
  let s = raw.trim();

  // Extract notes after a comma
  let notes: string | null = null;
  const commaIdx = s.indexOf(',');
  if (commaIdx !== -1) {
    notes = s.slice(commaIdx + 1).trim() || null;
    s = s.slice(0, commaIdx).trim();
  }

  // Replace unicode fraction characters
  for (const [char, val] of Object.entries(FRACTION_MAP)) {
    s = s.replace(new RegExp(char, 'g'), ` ${val} `);
  }
  s = s.replace(/\s+/g, ' ').trim();

  // Try to parse leading amount
  // Matches patterns like: "1", "1.5", "1/2", "1 1/2", "1 ½"
  const amountPattern = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)?/;
  const amountMatch = s.match(amountPattern);

  let amount: number | null = null;
  let rest = s;

  if (amountMatch && amountMatch[0].trim()) {
    const wholeStr = amountMatch[1];
    const denomStr = amountMatch[2];
    const fracStr = amountMatch[3];

    if (denomStr) {
      // "1/2" form
      amount = parseInt(wholeStr, 10) / parseInt(denomStr, 10);
    } else if (fracStr) {
      // "1 1/2" or "1 0.5" form
      const whole = parseFloat(wholeStr);
      const frac = parseFraction(fracStr);
      amount = frac !== null ? whole + frac : whole;
    } else {
      amount = parseFloat(wholeStr);
    }

    rest = s.slice(amountMatch[0].length).trim();
  }

  if (amount !== null && isNaN(amount)) amount = null;

  // Try to match a unit at the start of rest
  let unit: string | null = null;
  if (amount !== null) {
    const restLower = rest.toLowerCase();
    for (const u of UNITS_SORTED) {
      if (restLower === u || restLower.startsWith(u + ' ') || restLower.startsWith(u + '.')) {
        unit = u;
        rest = rest.slice(u.length).trim();
        // Remove leading period if present
        if (rest.startsWith('.')) rest = rest.slice(1).trim();
        break;
      }
    }
  }

  const name = rest.trim() || (amount === null ? raw.trim() : raw.trim());

  return {
    amount,
    unit,
    name: name || raw.trim(),
    notes,
  };
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

type JsonLdRecipe = Record<string, unknown>;

function extractJsonLd($: cheerio.CheerioAPI): JsonLdRecipe | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const text = $(scripts[i]).html();
    if (!text) continue;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }

    // Could be a single object or an array
    const candidates: unknown[] = Array.isArray(data) ? data : [data];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const obj = candidate as Record<string, unknown>;

      // Check for @graph
      if (obj['@graph'] && Array.isArray(obj['@graph'])) {
        for (const node of obj['@graph']) {
          if (isRecipeNode(node)) return node as JsonLdRecipe;
        }
      }

      if (isRecipeNode(obj)) return obj as JsonLdRecipe;
    }
  }
  return null;
}

function isRecipeNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (!type) return false;
  if (typeof type === 'string') return type === 'Recipe';
  if (Array.isArray(type)) return type.includes('Recipe');
  return false;
}

function parseRecipeYield(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    return match ? parseInt(match[0], 10) : undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    return parseRecipeYield(value[0]);
  }
  return undefined;
}

function parseImageUrl(image: unknown): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && image.length > 0) {
    const first = image[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>;
      if (typeof obj.url === 'string') return obj.url;
    }
  }
  if (image && typeof image === 'object') {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
  }
  return undefined;
}

function parseInstructions(instructions: unknown): RecipeStep[] {
  if (!instructions) return [];

  const toStep = (text: string, order: number): RecipeStep => ({ order, text: text.trim() });

  if (typeof instructions === 'string') {
    return instructions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => toStep(line, i + 1));
  }

  if (Array.isArray(instructions)) {
    const steps: RecipeStep[] = [];
    let order = 1;
    for (const item of instructions) {
      if (typeof item === 'string' && item.trim()) {
        steps.push(toStep(item, order++));
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // HowToSection: recurse into itemListElement
        if (obj['@type'] === 'HowToSection' && Array.isArray(obj.itemListElement)) {
          for (const sub of obj.itemListElement) {
            if (sub && typeof sub === 'object') {
              const subObj = sub as Record<string, unknown>;
              if (typeof subObj.text === 'string' && subObj.text.trim()) {
                steps.push(toStep(subObj.text, order++));
              }
            }
          }
        } else if (typeof obj.text === 'string' && obj.text.trim()) {
          steps.push(toStep(obj.text, order++));
        }
      }
    }
    return steps;
  }

  return [];
}

function parseTags(jsonLd: JsonLdRecipe): string[] {
  const tags = new Set<string>();

  const addTagField = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      value.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t));
    } else if (Array.isArray(value)) {
      value.forEach((v) => addTagField(v));
    }
  };

  addTagField(jsonLd.keywords);
  addTagField(jsonLd.recipeCategory);
  addTagField(jsonLd.recipeCuisine);

  return [...tags];
}

function mapJsonLdToRecipe(jsonLd: JsonLdRecipe, originalUrl: string): ParsedRecipe {
  const sourceUrl =
    (typeof jsonLd.url === 'string' ? jsonLd.url : undefined) ??
    (typeof jsonLd['@id'] === 'string' ? jsonLd['@id'] : undefined) ??
    originalUrl;

  const ingredients = Array.isArray(jsonLd.recipeIngredient)
    ? (jsonLd.recipeIngredient as string[]).map(parseIngredient)
    : [];

  const tags = parseTags(jsonLd);

  return {
    title: typeof jsonLd.name === 'string' ? jsonLd.name : 'Untitled Recipe',
    description: typeof jsonLd.description === 'string' ? jsonLd.description : undefined,
    sourceUrl,
    imageUrl: parseImageUrl(jsonLd.image),
    servings: parseRecipeYield(jsonLd.recipeYield),
    prepTimeMins: parseDuration(typeof jsonLd.prepTime === 'string' ? jsonLd.prepTime : undefined),
    cookTimeMins: parseDuration(typeof jsonLd.cookTime === 'string' ? jsonLd.cookTime : undefined),
    ingredients,
    steps: parseInstructions(jsonLd.recipeInstructions),
    tags: tags.length > 0 ? tags : undefined,
  };
}

// ---------------------------------------------------------------------------
// Microdata extraction
// ---------------------------------------------------------------------------

function extractMicrodata($: cheerio.CheerioAPI, originalUrl: string): ParsedRecipe | null {
  const recipeEl = $('[itemtype*="schema.org/Recipe"]').first();
  if (!recipeEl.length) return null;

  const getProp = (name: string): string | undefined => {
    const el = recipeEl.find(`[itemprop="${name}"]`).first();
    if (!el.length) return undefined;
    return (el.attr('content') ?? el.attr('datetime') ?? el.text()).trim() || undefined;
  };

  const getAllProps = (name: string): string[] => {
    return recipeEl
      .find(`[itemprop="${name}"]`)
      .map((_, el) => {
        const e = $(el);
        return (e.attr('content') ?? e.attr('datetime') ?? e.text()).trim();
      })
      .get()
      .filter(Boolean);
  };

  const title = getProp('name');
  if (!title) return null;

  const ingredients = getAllProps('recipeIngredient').map(parseIngredient);
  const instructionTexts = getAllProps('recipeInstructions');
  const steps: RecipeStep[] = instructionTexts.map((text, i) => ({ order: i + 1, text }));

  return {
    title,
    description: getProp('description'),
    sourceUrl: getProp('url') ?? originalUrl,
    imageUrl: getProp('image'),
    servings: parseRecipeYield(getProp('recipeYield')),
    prepTimeMins: parseDuration(getProp('prepTime')),
    cookTimeMins: parseDuration(getProp('cookTime')),
    ingredients,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Claude API fallback
// ---------------------------------------------------------------------------

const PARSED_RECIPE_INTERFACE = `
interface Ingredient {
  amount: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
}

interface RecipeStep {
  order: number;
  text: string;
}

interface ParsedRecipe {
  title: string;
  description?: string;
  sourceUrl?: string;
  imageUrl?: string;
  servings?: number;
  prepTimeMins?: number;
  cookTimeMins?: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  tags?: string[];
}
`.trim();

async function extractWithClaude(html: string, url: string): Promise<ParsedRecipe> {
  // Strip script and style tags, then take first 15k chars
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const truncated = stripped.slice(0, 15000);

  const client = new Anthropic();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a recipe extraction assistant. Extract recipe information from HTML and return it as JSON.',
    messages: [
      {
        role: 'user',
        content: `Extract the recipe from this HTML and return it as JSON matching this TypeScript interface:\n\n${PARSED_RECIPE_INTERFACE}\n\nHTML:\n${truncated}\n\nReturn only valid JSON, no explanation.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude API returned no text content');
  }

  // Strip markdown code fences if present
  let jsonText = textBlock.text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Claude API returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude API returned unexpected data structure');
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.title || typeof obj.title !== 'string') {
    throw new Error('Claude API response missing required title field');
  }

  // Ensure arrays exist
  if (!Array.isArray(obj.ingredients)) obj.ingredients = [];
  if (!Array.isArray(obj.steps)) obj.steps = [];

  // Back-fill sourceUrl
  if (!obj.sourceUrl) obj.sourceUrl = url;

  return obj as unknown as ParsedRecipe;
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and parse the recipe from the page.
 * Tries JSON-LD first, then microdata, then Claude API as a fallback.
 * Throws a descriptive error on failure.
 */
export async function parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; RecipeParser/1.0; +https://github.com/recipe-mealplan)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    html = await response.text();
  } catch (err) {
    throw new Error(
      `Failed to fetch recipe URL: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const $ = cheerio.load(html);

  // 1. Try JSON-LD
  const jsonLd = extractJsonLd($);
  if (jsonLd) {
    return mapJsonLdToRecipe(jsonLd, url);
  }

  // 2. Try microdata
  const microdata = extractMicrodata($, url);
  if (microdata) {
    return microdata;
  }

  // 3. Fall back to Claude
  return extractWithClaude(html, url);
}
