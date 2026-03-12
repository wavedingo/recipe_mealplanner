'use client';

import Link from 'next/link';
import Image from 'next/image';

interface RecipeTag {
  tag: { id: string; name: string };
}

interface Recipe {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  prepTimeMins?: number | null;
  cookTimeMins?: number | null;
  rating?: number | null;
  tags: RecipeTag[];
}

interface RecipeCardProps {
  recipe: Recipe;
}

function StarRating({ rating }: { rating: number | null | undefined }) {
  const value = rating ?? 0;
  return (
    <div className="flex gap-0.5" aria-label={`Rating: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= value ? 'text-amber-400' : 'text-slate-700'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime =
    (recipe.prepTimeMins ?? 0) + (recipe.cookTimeMins ?? 0);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group block bg-slate-900 rounded-xl border border-slate-700/60 overflow-hidden hover:border-amber-500/50 hover:shadow-lg hover:shadow-black/40 transition-all duration-200"
    >
      {/* Image */}
      <div className="relative w-full h-48 bg-slate-800">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.title}
            fill
            className="object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 text-base leading-snug">
          {recipe.title}
        </h3>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.slice(0, 4).map(({ tag }) => (
              <span
                key={tag.id}
                className="px-2 py-0.5 bg-slate-700/60 text-slate-300 text-xs rounded-full font-medium border border-slate-600/40"
              >
                {tag.name}
              </span>
            ))}
            {recipe.tags.length > 4 && (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-500 text-xs rounded-full border border-slate-700">
                +{recipe.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer: rating + time */}
        <div className="flex items-center justify-between pt-1">
          <StarRating rating={recipe.rating} />
          {totalTime > 0 && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {totalTime} min
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
