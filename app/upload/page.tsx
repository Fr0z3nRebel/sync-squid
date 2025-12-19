'use client';

import { useState, useEffect } from 'react';
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
  const [facebookPages, setFacebookPages] = useState<Array<{ id: string; name: string; category?: string; picture?: { data: { url: string } } }>>([]);
  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState<string | null>(null);
  const [loadingFacebookPages, setLoadingFacebookPages] = useState(false);
  const [facebookPagesError, setFacebookPagesError] = useState<string | null>(null);
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

  // Fetch Facebook pages when Facebook is selected
  useEffect(() => {
    const fetchFacebookPages = async () => {
      if (selectedPlatforms.includes('facebook') && !loadingFacebookPages) {
        setLoadingFacebookPages(true);
        setFacebookPagesError(null);
        try {
          const response = await fetch('/api/platforms/facebook/pages');
          if (response.ok) {
            const data = await response.json();
            const pages = data.pages || [];
            console.log(`Received ${pages.length} pages from API. Total: ${data.total}`);
            console.log('Pages:', pages.map((p: any) => ({ id: p.id, name: p.name })));
            setFacebookPages(pages);
            // Auto-select first page if available and none selected
            if (pages.length > 0 && !selectedFacebookPageId) {
              setSelectedFacebookPageId(pages[0].id);
            } else if (pages.length === 0) {
              setFacebookPagesError('No Facebook pages found. Please ensure you have at least one page and have granted the "pages_show_list" permission during authentication.');
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `Failed to fetch Facebook pages (${response.status})`;
            console.error('Failed to fetch Facebook pages:', response.status, errorData);
            setFacebookPagesError(errorMessage);
            setFacebookPages([]);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Facebook pages';
          console.error('Error fetching Facebook pages:', error);
          setFacebookPagesError(errorMessage);
          setFacebookPages([]);
        } finally {
          setLoadingFacebookPages(false);
        }
      } else if (!selectedPlatforms.includes('facebook')) {
        // Clear pages when Facebook is deselected
        setFacebookPages([]);
        setSelectedFacebookPageId(null);
        setFacebookPagesError(null);
      }
    };

    fetchFacebookPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatforms]);

  const handleSubmit = async () => {
    if (!videoFile || !metadata || !scheduledDate || selectedPlatforms.length === 0) {
      setError('Please complete all steps');
      return;
    }

    // Validate Facebook page selection
    if (selectedPlatforms.includes('facebook') && !selectedFacebookPageId) {
      setError('Please select a Facebook page to post to');
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

      // Step 3: Store the file path in the database for potential retry
      if (postId && filePath) {
        const supabase = createClient();
        await supabase
          .from('scheduled_posts')
          .update({ video_file_path: filePath })
          .eq('id', postId);
      }

      // Step 4: Process uploads to each platform from storage
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
            facebookPageId: platform === 'facebook' ? selectedFacebookPageId : undefined,
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
      
      // Check if any failed
      const failures = results.filter(r => r.status === 'rejected');
      const successes = results.filter(r => r.status === 'fulfilled');
      
      // Only delete video from storage if ALL platforms succeeded
      if (failures.length === 0 && successes.length === selectedPlatforms.length) {
        try {
          await fetch('/api/upload/delete-storage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath }),
          });
          
          // Clear the file path from database since video is deleted
          if (postId) {
            const supabase = createClient();
            await supabase
              .from('scheduled_posts')
              .update({ video_file_path: null })
              .eq('id', postId);
          }
        } catch (deleteErr) {
          console.error('Error deleting video from storage:', deleteErr);
          // Don't fail the request if deletion fails - cleanup job will handle it
        }
      }
      
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
      
      // Don't delete video from storage if upload failed - keep it for retry
      // The video_file_path is already stored in the database
      
      // Update post status to failed if we have a postId
      if (postId) {
        const supabase = createClient();
        await supabase
          .from('scheduled_posts')
          .update({ status: 'failed' })
          .eq('id', postId);
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
                <>
                  <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Facebook Page <span className="text-red-500">*</span>
                    </label>
                    {loadingFacebookPages ? (
                      <p className="text-sm text-gray-600">Loading pages...</p>
                    ) : facebookPagesError ? (
                      <div className="rounded-md bg-red-50 p-3">
                        <p className="text-sm text-red-800 font-medium">Error loading pages</p>
                        <p className="text-sm text-red-700 mt-1">{facebookPagesError}</p>
                        <p className="text-xs text-red-600 mt-2">
                          Try disconnecting and reconnecting your Facebook account, and make sure to select all pages you want to use.
                        </p>
                      </div>
                    ) : facebookPages.length > 0 ? (
                      <select
                        value={selectedFacebookPageId || ''}
                        onChange={(e) => setSelectedFacebookPageId(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                        required
                      >
                        <option value="">Select a page...</option>
                        {facebookPages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name} {page.category ? `(${page.category})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-md bg-amber-50 p-3">
                        <p className="text-sm text-amber-800 font-medium">No Facebook pages found</p>
                        <p className="text-sm text-amber-700 mt-1">
                          Please ensure you have at least one page and have granted the "pages_show_list" permission during authentication.
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setFacebookPages([]);
                        setLoadingFacebookPages(false);
                        setSelectedFacebookPageId(null);
                        setFacebookPagesError(null);
                      }}
                      className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      Refresh Pages
                    </button>
                    {facebookPages.length > 0 && (
                      <p className="mt-2 text-xs text-gray-500">
                        Total pages found: {facebookPages.length}
                      </p>
                    )}
                  </div>
                  
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
                </>
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
                  disabled={uploading || selectedPlatforms.length === 0 || (selectedPlatforms.includes('facebook') && !selectedFacebookPageId)}
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

