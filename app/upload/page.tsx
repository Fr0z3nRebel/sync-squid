'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import VideoUploader from '@/components/VideoUploader';
import MetadataForm, { type MetadataFormData } from '@/components/MetadataForm';
import SchedulePicker from '@/components/SchedulePicker';
import PlatformSelector from '@/components/PlatformSelector';
import YouTubeCategoryPicker from '@/components/YouTubeCategoryPicker';
import { useToast } from '@/components/ToastProvider';
import { createClient } from '@/lib/supabase/client';
import type { Platform } from '@/types/database';

type Step = 'upload' | 'metadata' | 'schedule' | 'platforms';

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<MetadataFormData & { tags?: string[] } | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTimezone, setScheduledTimezone] = useState<string>('UTC');
  const [youtubeCategoryId, setYoutubeCategoryId] = useState<string | null>(null);
  const [facebookVideoType, setFacebookVideoType] = useState<'REELS' | 'VIDEO'>('VIDEO');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleVideoSelect = (file: File | null) => {
    setVideoFile(file);
    if (file) {
      setStep('metadata');
    }
  };

  const handleMetadataSubmit = (data: MetadataFormData) => {
    // MetadataForm returns tags as string[], so we can safely cast
    setMetadata(data as MetadataFormData & { tags?: string[] });
    setStep('schedule');
  };

  const handleScheduleSelect = (date: Date, timezone?: string) => {
    setScheduledDate(date);
    if (timezone) {
      setScheduledTimezone(timezone);
    }
    // Don't auto-advance - wait for Continue button
  };

  const handleSubmit = async () => {
    if (!videoFile || !metadata || !scheduledDate || selectedPlatforms.length === 0) {
      setError('Please complete all steps');
      return;
    }

    setUploading(true);
    setError(null);

    let filePath: string | null = null;
    let postId: string | null = null;

    try {
      // Step 1: Create the post record first (without video)
      const createResponse = await fetch('/api/upload/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: metadata.title,
          description: metadata.description,
          tags: Array.isArray(metadata.tags) ? metadata.tags : (metadata.tags || '').split(',').map((t: string) => t.trim()),
          // Format the date as a naive date string (YYYY-MM-DDTHH:mm:ss) without timezone
          // The server will interpret this in the selected timezone
          scheduledAt: formatInTimeZone(
            scheduledDate,
            scheduledTimezone,
            "yyyy-MM-dd'T'HH:mm:ss"
          ),
          timezone: scheduledTimezone,
          youtubeCategoryId: youtubeCategoryId,
          platforms: selectedPlatforms,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create post');
      }

      const createData = await createResponse.json();
      postId = createData.postId;

      if (!postId) {
        throw new Error('Failed to get post ID');
      }

      // Step 2: Upload video directly to Supabase Storage (client-side, bypasses Vercel limit)
      const supabase = createClient();
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const fileExt = videoFile.name.split('.').pop();
      const fileName = `${postId}-${Date.now()}.${fileExt}`;
      filePath = `${currentUser.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, videoFile, {
          contentType: videoFile.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload to storage: ${uploadError.message}`);
      }

      // Step 3: Process uploads to each platform from storage
      const uploadPromises = selectedPlatforms.map(async (platform: Platform) => {
        const processResponse = await fetch('/api/upload/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            postId,
            filePath,
            platform,
            title: metadata.title,
            description: metadata.description,
            tags: Array.isArray(metadata.tags) ? metadata.tags : (metadata.tags || '').split(',').map((t: string) => t.trim()),
            scheduledAt: scheduledDate.toISOString(),
            youtubeCategoryId: youtubeCategoryId,
            facebookVideoType: platform === 'facebook' ? facebookVideoType : undefined,
          }),
        });

        if (!processResponse.ok) {
          const errorData = await processResponse.json();
          throw new Error(`${platform}: ${errorData.error || 'Upload failed'}`);
        }

        return await processResponse.json();
      });

      // Wait for all uploads to complete
      const results = await Promise.allSettled(uploadPromises);
      
      // Delete video from Supabase Storage after all platforms are processed
      try {
        await fetch('/api/upload/delete-storage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filePath }),
        });
      } catch (deleteErr) {
        console.error('Error deleting video from storage:', deleteErr);
        // Don't fail the request if deletion fails - cleanup job will handle it
      }
      
      // Check if any failed
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        const errorMessages = failures.map(f => 
          f.status === 'rejected' ? f.reason?.message || 'Unknown error' : ''
        ).join(', ');
        throw new Error(`Some uploads failed: ${errorMessages}`);
      }

      // Update post status
      if (postId) {
        const supabase = createClient();
        await supabase
          .from('scheduled_posts')
          .update({ status: 'pending' })
          .eq('id', postId);
      }

      showToast('Video uploaded and scheduled successfully!', 'success');
      if (postId) {
        router.push(`/dashboard?success=uploaded&postId=${postId}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload video';
      setError(errorMessage);
      showToast(errorMessage, 'error');
      
      // Try to clean up the video from storage if it was uploaded
      if (filePath) {
        try {
          await fetch('/api/upload/delete-storage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath }),
          });
        } catch (cleanupErr) {
          console.error('Error cleaning up video:', cleanupErr);
        }
      }
      
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Sync Squid</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Upload Video</h2>
          <p className="mt-2 text-gray-600">
            Upload and schedule your video across multiple platforms
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center">
            {(['upload', 'metadata', 'schedule', 'platforms'] as Step[]).map(
              (s, index) => (
                <div key={s} className="flex flex-1 items-center">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      step === s
                        ? 'bg-indigo-600 text-white'
                        : ['upload', 'metadata', 'schedule', 'platforms'].indexOf(step) > index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {index + 1}
                  </div>
                  {index < 3 && (
                    <div
                      className={`h-1 flex-1 ${
                        ['upload', 'metadata', 'schedule', 'platforms'].indexOf(step) > index
                          ? 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Step Content */}
        <div className="rounded-lg bg-white p-6 shadow">
          {step === 'upload' && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Step 1: Upload Video
              </h3>
              <VideoUploader
                onVideoSelect={handleVideoSelect}
                selectedVideo={videoFile}
              />
            </div>
          )}

          {step === 'metadata' && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Step 2: Video Metadata
              </h3>
              <MetadataForm
                onSubmit={handleMetadataSubmit}
                defaultValues={metadata || undefined}
              />
              <button
                onClick={() => setStep('upload')}
                className="mt-4 text-sm text-indigo-600 hover:text-indigo-700"
              >
                ← Back
              </button>
            </div>
          )}

          {step === 'schedule' && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Step 3: Schedule
              </h3>
              <SchedulePicker
                onScheduleSelect={handleScheduleSelect}
                defaultDate={scheduledDate || undefined}
                defaultTimezone={scheduledTimezone}
              />
              <div className="mt-6">
                <YouTubeCategoryPicker
                  selectedCategoryId={youtubeCategoryId}
                  onCategoryChange={setYoutubeCategoryId}
                />
              </div>
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => setStep('metadata')}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    if (scheduledDate) {
                      setStep('platforms');
                    }
                  }}
                  disabled={!scheduledDate}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'platforms' && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Step 4: Select Platforms
              </h3>
              <PlatformSelector
                selectedPlatforms={selectedPlatforms}
                onPlatformsChange={setSelectedPlatforms}
              />
              
              {selectedPlatforms.includes('facebook') && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Facebook Video Type
                  </label>
                  <select
                    value={facebookVideoType}
                    onChange={(e) => setFacebookVideoType(e.target.value as 'REELS' | 'VIDEO')}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  >
                    <option value="VIDEO">Regular Video</option>
                    <option value="REELS">Reels</option>
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    {facebookVideoType === 'REELS' 
                      ? 'Video will be posted as a Reel (requires 9:16 aspect ratio, 3-90 seconds)'
                      : 'Video will be posted as a regular video on your Page'}
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => setStep('schedule')}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={uploading || selectedPlatforms.length === 0}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload & Schedule'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

