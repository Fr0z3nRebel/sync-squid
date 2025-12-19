'use client';

import { YOUTUBE_CATEGORIES } from '@/lib/youtube-categories';

interface YouTubeCategoryPickerProps {
  selectedCategoryId: string | null;
  onCategoryChange: (categoryId: string | null) => void;
}

export default function YouTubeCategoryPicker({
  selectedCategoryId,
  onCategoryChange,
}: YouTubeCategoryPickerProps) {
  return (
    <div>
      <label
        htmlFor="youtube-category"
        className="block text-sm font-medium text-gray-700"
      >
        YouTube Category
      </label>
      <select
        id="youtube-category"
        value={selectedCategoryId || ''}
        onChange={(e) => onCategoryChange(e.target.value || null)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
      >
        <option value="">Select a category (optional)</option>
        {YOUTUBE_CATEGORIES.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Choose a category to help YouTube recommend your video to the right audience
      </p>
    </div>
  );
}

