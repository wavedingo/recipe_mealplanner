import { parseDuration, parseIngredient, parseRecipeFromUrl } from '../recipe-parser';
import type { ParsedRecipe } from '@/types/index';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Mock Anthropic
// ---------------------------------------------------------------------------
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    _mockCreate: mockCreate,
  };
});

function getMockCreate() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@anthropic-ai/sdk');
  return mod._mockCreate as jest.Mock;
}

// ---------------------------------------------------------------------------
// Helper to create a mock HTML response
// ---------------------------------------------------------------------------
function mockHtmlResponse(html: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => html,
  });
}

// ---------------------------------------------------------------------------
// parseDuration tests
// ---------------------------------------------------------------------------
describe('parseDuration', () => {
  it('parses minutes only: PT15M → 15', () => {
    expect(parseDuration('PT15M')).toBe(15);
  });

  it('parses hours only: PT1H → 60', () => {
    expect(parseDuration('PT1H')).toBe(60);
  });

  it('parses hours and minutes: PT1H30M → 90', () => {
    expect(parseDuration('PT1H30M')).toBe(90);
  });

  it('parses with day prefix: P0DT45M → 45', () => {
    expect(parseDuration('P0DT45M')).toBe(45);
  });

  it('parses 2 hours 15 minutes: PT2H15M → 135', () => {
    expect(parseDuration('PT2H15M')).toBe(135);
  });

  it('returns undefined for null', () => {
    expect(parseDuration(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseDuration('')).toBeUndefined();
  });

  it('returns undefined for unparsable string', () => {
    expect(parseDuration('not-a-duration')).toBeUndefined();
  });

  it('returns undefined for zero duration', () => {
    expect(parseDuration('PT0M')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseIngredient tests
// ---------------------------------------------------------------------------
describe('parseIngredient', () => {
  it('parses "2 cups flour"', () => {
    const result = parseIngredient('2 cups flour');
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('cups');
    expect(result.name).toBe('flour');
    expect(result.notes).toBeNull();
  });

  it('parses "1/2 tsp salt"', () => {
    const result = parseIngredient('1/2 tsp salt');
    expect(result.amount).toBeCloseTo(0.5);
    expect(result.unit).toBe('tsp');
    expect(result.name).toBe('salt');
  });

  it('parses "1 1/2 cups milk"', () => {
    const result = parseIngredient('1 1/2 cups milk');
    expect(result.amount).toBeCloseTo(1.5);
    expect(result.unit).toBe('cups');
    expect(result.name).toBe('milk');
  });

  it('parses "3 large eggs" (no unit)', () => {
    const result = parseIngredient('3 large eggs');
    expect(result.amount).toBe(3);
    expect(result.unit).toBeNull();
    expect(result.name).toContain('eggs');
  });

  it('parses "salt and pepper to taste" (no amount)', () => {
    const result = parseIngredient('salt and pepper to taste');
    expect(result.amount).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.name).toBeTruthy();
  });

  it('parses "1 lb ground beef" (lb unit)', () => {
    const result = parseIngredient('1 lb ground beef');
    expect(result.amount).toBe(1);
    expect(result.unit).toBe('lb');
    expect(result.name).toBe('ground beef');
  });

  it('extracts notes after comma: "2 cups flour, sifted"', () => {
    const result = parseIngredient('2 cups flour, sifted');
    expect(result.amount).toBe(2);
    expect(result.unit).toBe('cups');
    expect(result.name).toBe('flour');
    expect(result.notes).toBe('sifted');
  });

  it('parses "100 g butter"', () => {
    const result = parseIngredient('100 g butter');
    expect(result.amount).toBe(100);
    expect(result.unit).toBe('g');
    expect(result.name).toBe('butter');
  });

  it('handles unicode fraction "½ cup sugar"', () => {
    const result = parseIngredient('½ cup sugar');
    expect(result.amount).toBeCloseTo(0.5);
    expect(result.unit).toBe('cup');
    expect(result.name).toBe('sugar');
  });

  it('handles decimal amount "1.5 tbsp olive oil"', () => {
    const result = parseIngredient('1.5 tbsp olive oil');
    expect(result.amount).toBeCloseTo(1.5);
    expect(result.unit).toBe('tbsp');
    expect(result.name).toBe('olive oil');
  });
});

// ---------------------------------------------------------------------------
// JSON-LD extraction tests
// ---------------------------------------------------------------------------

const JSON_LD_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <title>Chocolate Cake</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Chocolate Cake",
    "description": "A rich chocolate cake recipe.",
    "url": "https://example.com/chocolate-cake",
    "image": "https://example.com/cake.jpg",
    "recipeYield": "8 servings",
    "prepTime": "PT20M",
    "cookTime": "PT45M",
    "recipeIngredient": [
      "2 cups all-purpose flour",
      "1 tsp baking soda",
      "1/2 tsp salt",
      "1 cup butter, softened"
    ],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Preheat oven to 350°F." },
      { "@type": "HowToStep", "text": "Mix dry ingredients." },
      { "@type": "HowToStep", "text": "Cream butter and sugar." },
      { "@type": "HowToStep", "text": "Bake for 45 minutes." }
    ],
    "keywords": "cake, chocolate, dessert",
    "recipeCategory": "Dessert",
    "recipeCuisine": "American"
  }
  </script>
</head>
<body><h1>Chocolate Cake</h1></body>
</html>
`;

describe('parseRecipeFromUrl — JSON-LD extraction', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses a JSON-LD recipe', async () => {
    mockHtmlResponse(JSON_LD_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/chocolate-cake');

    expect(recipe.title).toBe('Chocolate Cake');
    expect(recipe.description).toBe('A rich chocolate cake recipe.');
    expect(recipe.sourceUrl).toBe('https://example.com/chocolate-cake');
    expect(recipe.imageUrl).toBe('https://example.com/cake.jpg');
    expect(recipe.servings).toBe(8);
    expect(recipe.prepTimeMins).toBe(20);
    expect(recipe.cookTimeMins).toBe(45);
  });

  it('parses ingredients correctly', async () => {
    mockHtmlResponse(JSON_LD_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/chocolate-cake');

    expect(recipe.ingredients).toHaveLength(4);
    const flour = recipe.ingredients[0];
    expect(flour.amount).toBe(2);
    expect(flour.unit).toBe('cups');
    expect(flour.name).toContain('flour');

    const butter = recipe.ingredients[3];
    expect(butter.notes).toBe('softened');
  });

  it('parses steps correctly', async () => {
    mockHtmlResponse(JSON_LD_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/chocolate-cake');

    expect(recipe.steps).toHaveLength(4);
    expect(recipe.steps[0].order).toBe(1);
    expect(recipe.steps[0].text).toBe('Preheat oven to 350°F.');
    expect(recipe.steps[3].order).toBe(4);
  });

  it('parses tags from keywords, category, and cuisine', async () => {
    mockHtmlResponse(JSON_LD_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/chocolate-cake');

    expect(recipe.tags).toBeDefined();
    expect(recipe.tags).toContain('cake');
    expect(recipe.tags).toContain('chocolate');
    expect(recipe.tags).toContain('dessert');
    expect(recipe.tags).toContain('Dessert');
    expect(recipe.tags).toContain('American');
  });
});

// ---------------------------------------------------------------------------
// Array-form @type test
// ---------------------------------------------------------------------------
const JSON_LD_ARRAY_TYPE_FIXTURE = `
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@type": ["Recipe", "Thing"],
  "name": "Simple Soup",
  "recipeIngredient": [],
  "recipeInstructions": []
}
</script>
</head><body></body></html>
`;

describe('parseRecipeFromUrl — JSON-LD array @type', () => {
  beforeEach(() => mockFetch.mockReset());

  it('handles @type as an array containing "Recipe"', async () => {
    mockHtmlResponse(JSON_LD_ARRAY_TYPE_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/soup');
    expect(recipe.title).toBe('Simple Soup');
  });
});

// ---------------------------------------------------------------------------
// @graph test
// ---------------------------------------------------------------------------
const JSON_LD_GRAPH_FIXTURE = `
<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "My Page" },
    {
      "@type": "Recipe",
      "name": "Graph Recipe",
      "recipeIngredient": ["1 cup water"],
      "recipeInstructions": [{ "@type": "HowToStep", "text": "Boil water." }]
    }
  ]
}
</script>
</head><body></body></html>
`;

describe('parseRecipeFromUrl — JSON-LD @graph', () => {
  beforeEach(() => mockFetch.mockReset());

  it('extracts recipe from @graph', async () => {
    mockHtmlResponse(JSON_LD_GRAPH_FIXTURE);
    const recipe = await parseRecipeFromUrl('https://example.com/graph');
    expect(recipe.title).toBe('Graph Recipe');
    expect(recipe.steps[0].text).toBe('Boil water.');
  });
});

// ---------------------------------------------------------------------------
// Claude fallback test
// ---------------------------------------------------------------------------
const NO_SCHEMA_HTML = `
<!DOCTYPE html>
<html><head><title>A Recipe</title></head>
<body><p>Some unstructured recipe content.</p></body>
</html>
`;

const CLAUDE_RESPONSE: ParsedRecipe = {
  title: 'Claude Extracted Recipe',
  description: 'Extracted by Claude',
  sourceUrl: 'https://example.com/no-schema',
  ingredients: [{ amount: 1, unit: 'cup', name: 'water', notes: null }],
  steps: [{ order: 1, text: 'Boil the water.' }],
  tags: ['simple'],
};

describe('parseRecipeFromUrl — Claude fallback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    getMockCreate().mockReset();
  });

  it('falls back to Claude when no JSON-LD or microdata is found', async () => {
    mockHtmlResponse(NO_SCHEMA_HTML);
    getMockCreate().mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(CLAUDE_RESPONSE) }],
    });

    const recipe = await parseRecipeFromUrl('https://example.com/no-schema');
    expect(recipe.title).toBe('Claude Extracted Recipe');
    expect(recipe.ingredients[0].name).toBe('water');
    expect(recipe.steps[0].text).toBe('Boil the water.');
    expect(getMockCreate()).toHaveBeenCalledTimes(1);
  });

  it('strips markdown code fences from Claude response', async () => {
    mockHtmlResponse(NO_SCHEMA_HTML);
    const fencedResponse = '```json\n' + JSON.stringify(CLAUDE_RESPONSE) + '\n```';
    getMockCreate().mockResolvedValueOnce({
      content: [{ type: 'text', text: fencedResponse }],
    });

    const recipe = await parseRecipeFromUrl('https://example.com/no-schema');
    expect(recipe.title).toBe('Claude Extracted Recipe');
  });
});

// ---------------------------------------------------------------------------
// Error handling tests
// ---------------------------------------------------------------------------
describe('parseRecipeFromUrl — error handling', () => {
  beforeEach(() => mockFetch.mockReset());

  it('throws a descriptive error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(parseRecipeFromUrl('https://example.com/missing')).rejects.toThrow(
      'Failed to fetch recipe URL'
    );
  });

  it('throws a descriptive error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(parseRecipeFromUrl('https://example.com/broken')).rejects.toThrow(
      'Failed to fetch recipe URL'
    );
  });
});
