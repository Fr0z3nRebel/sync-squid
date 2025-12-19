'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const metadataSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().min(1, 'Description is required').max(5000, 'Description must be less than 5000 characters'),
  tags: z.string().optional(),
});

export type MetadataFormData = z.infer<typeof metadataSchema>;

interface MetadataFormProps {
  onSubmit: (data: MetadataFormData) => void;
  defaultValues?: Partial<MetadataFormData>;
}

export default function MetadataForm({
  onSubmit,
  defaultValues,
}: MetadataFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MetadataFormData>({
    resolver: zodResolver(metadataSchema),
    defaultValues: defaultValues || {
      title: '',
      description: '',
      tags: '',
    },
  });

  const parseTags = (tagsString: string): string[] => {
    return tagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  };

  const onFormSubmit = (data: MetadataFormData) => {
    onSubmit({
      ...data,
      tags: data.tags ? parseTags(data.tags) : [],
    } as MetadataFormData & { tags?: string[] });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700"
        >
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          {...register('title')}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          placeholder="Enter video title"
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-gray-700"
        >
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          rows={6}
          {...register('description')}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          placeholder="Enter video description"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="tags"
          className="block text-sm font-medium text-gray-700"
        >
          Tags
        </label>
        <input
          type="text"
          id="tags"
          {...register('tags')}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          placeholder="Enter tags separated by commas (e.g., tech, tutorial, coding)"
        />
        <p className="mt-1 text-xs text-gray-500">
          Separate multiple tags with commas
        </p>
        {errors.tags && (
          <p className="mt-1 text-sm text-red-600">{errors.tags.message}</p>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Continue
      </button>
    </form>
  );
}

