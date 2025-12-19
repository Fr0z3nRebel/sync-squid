'use client';

import { useCallback, useState } from 'react';

interface VideoUploaderProps {
  onVideoSelect: (file: File) => void;
  selectedVideo: File | null;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const ALLOWED_FORMATS = ['video/mp4', 'video/mov', 'video/quicktime'];

export default function VideoUploader({
  onVideoSelect,
  selectedVideo,
}: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return 'Invalid file format. Please upload MP4 or MOV files.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB limit.`;
    }

    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      setError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onVideoSelect(file);
    },
    [onVideoSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    onVideoSelect(null as unknown as File);
    setError(null);
  }, [previewUrl, onVideoSelect]);

  return (
    <div className="w-full">
      {!selectedVideo ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            accept="video/mp4,video/mov,video/quicktime"
            onChange={handleFileInput}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            id="video-upload"
          />
          <div className="pointer-events-none">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-4h-4m-4 0h4"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-semibold">Click to upload</span> or drag
              and drop
            </p>
            <p className="text-xs text-gray-500">
              MP4 or MOV up to 5GB
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {previewUrl && (
                <video
                  src={previewUrl}
                  className="h-20 w-32 rounded object-cover"
                  controls={false}
                />
              )}
              <div>
                <p className="font-medium text-gray-900">
                  {selectedVideo.name}
                </p>
                <p className="text-sm text-gray-500">
                  {(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}

