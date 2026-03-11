export interface Ingredient {
  amount: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
}

export interface RecipeStep {
  order: number;
  text: string;
}

export interface ParsedRecipe {
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
