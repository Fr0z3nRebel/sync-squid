'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDateInTimezone } from '@/lib/date-utils';
import { formatInTimeZone } from 'date-fns-tz';
import { COMMON_TIMEZONES } from '@/lib/youtube-categories';
import type { ScheduledPost, PostPlatform, Platform } from '@/types/database';
import SchedulePicker from './SchedulePicker';
import { useToast } from './ToastProvider';

interface PostWithPlatforms extends ScheduledPost {
  post_platforms: PostPlatform[];
}

const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  uploading: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  uploaded: 'bg-purple-100 text-purple-800',
};

export default function ScheduledPostsList() {
  const [posts, setPosts] = useState<PostWithPlatforms[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState<Date | null>(null);
  const [editTimezone, setEditTimezone] = useState<string>('UTC');
  const [saving, setSaving] = useState(false);
  const [retryingPlatform, setRetryingPlatform] = useState<{ postId: string; platform: Platform } | null>(null);
  const [retryVideoFile, setRetryVideoFile] = useState<File | null>(null);
  const { showToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadPosts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      let query = supabase
        .from('scheduled_posts')
        .select(`
          id,
          user_id,
          title,
          description,
          tags,
          scheduled_at,
          created_at,
          status,
          timezone,
          youtube_category_id,
          youtube_category_type,
          post_platforms (*)
        `)
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading posts:', error);
      } else {
        setPosts((data as PostWithPlatforms[]) || []);
      }
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSchedule = (post: PostWithPlatforms) => {
    setEditingPostId(post.id);
    setEditTimezone(post.timezone || 'UTC');
    // Convert UTC date back to the post's timezone for editing
    const timezone = post.timezone || 'UTC';
    const dateInTz = formatInTimeZone(
      new Date(post.scheduled_at),
      timezone,
      "yyyy-MM-dd'T'HH:mm:ss"
    );
    setEditSchedule(new Date(dateInTz));
  };

  const handleCancelEdit = () => {
    setEditingPostId(null);
    setEditSchedule(null);
  };

  const handleSaveSchedule = async () => {
    if (!editingPostId || !editSchedule) return;

    setSaving(true);
    try {
      // Format the date as a naive date string (YYYY-MM-DDTHH:mm:ss) without timezone
      // The server will interpret this in the selected timezone
      const dateStr = formatInTimeZone(
        editSchedule,
        editTimezone || 'UTC',
        "yyyy-MM-dd'T'HH:mm:ss"
      );
      
      const response = await fetch(`/api/posts/${editingPostId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scheduledAt: dateStr,
          timezone: editTimezone,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update schedule');
      }

      const result = await response.json();
      
      if (result.warning) {
        showToast(
          `${result.warning}. ${result.errors?.join(' ') || ''} Please reconnect your YouTube account if you see permission errors.`,
          'error'
        );
      } else {
        showToast('Schedule updated successfully', 'success');
      }
      
      await loadPosts();
      setEditingPostId(null);
      setEditSchedule(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update schedule';
      showToast(errorMessage, 'error');
      console.error('Error updating schedule:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async (postId: string, platform: Platform) => {
    // If we're already in retry mode and have a file, upload it first
    if (retryVideoFile && retryingPlatform?.postId === postId && retryingPlatform?.platform === platform) {
      // User provided a new video file, upload it to Supabase Storage first
      try {
        const formData = new FormData();
        formData.append('video', retryVideoFile);
        formData.append('postId', postId);

        const storageResponse = await fetch('/api/upload/storage', {
          method: 'POST',
          body: formData,
        });

        if (!storageResponse.ok) {
          const errorData = await storageResponse.json();
          throw new Error(errorData.error || 'Failed to upload video to storage');
        }

        const storageData = await storageResponse.json();
        const filePath = storageData.filePath;

        // Now retry with the new file path
        const response = await fetch('/api/upload/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postId,
            platform,
            filePath,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to retry upload');
        }

        showToast(`Successfully retried upload to ${PLATFORM_NAMES[platform]}`, 'success');
        await loadPosts();
        setRetryingPlatform(null);
        setRetryVideoFile(null);
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to retry upload';
        showToast(errorMessage, 'error');
        console.error('Error retrying upload:', error);
        return;
      }
    }

    // First attempt: try without a file (use existing file in storage)
    try {
      const response = await fetch('/api/upload/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          platform,
          // Don't pass filePath - let API use existing file
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresVideo) {
          // Video not found - show file input
          setRetryingPlatform({ postId, platform });
          showToast('Video file not found in storage. Please select a video file to retry.', 'error');
          return;
        }
        throw new Error(data.error || 'Failed to retry upload');
      }

      showToast(`Successfully retried upload to ${PLATFORM_NAMES[platform]}`, 'success');
      await loadPosts();
      setRetryingPlatform(null);
      setRetryVideoFile(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retry upload';
      showToast(errorMessage, 'error');
      console.error('Error retrying upload:', error);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">Loading posts...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">No scheduled posts yet.</p>
        <p className="mt-2 text-sm text-gray-500">
          Upload your first video to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            filter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            filter === 'pending'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('uploading')}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            filter === 'uploading'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Uploading
        </button>
        <button
          onClick={() => setFilter('published')}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            filter === 'published'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Published
        </button>
        <button
          onClick={() => setFilter('failed')}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            filter === 'failed'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Failed
        </button>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {posts.map((post) => {
          const youtubePlatform = post.post_platforms.find(
            (pp) => pp.platform === 'youtube'
          );
          const thumbnailUrl =
            youtubePlatform?.thumbnail_url ||
            'https://via.placeholder.com/320x180?text=No+Thumbnail';

          return (
            <div
              key={post.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt={post.title}
                    className="h-32 w-56 rounded object-cover"
                  />
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {post.title}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {post.description}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_COLORS[post.status] || STATUS_COLORS.pending
                      }`}
                    >
                      {post.status}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                    <span>
                      Scheduled:{' '}
                      {formatDateInTimezone(
                        post.scheduled_at,
                        post.timezone || null,
                        'MMM d, yyyy h:mm a'
                      )}
                      {post.timezone && post.timezone !== 'UTC' && (
                        <span className="ml-1 text-xs text-gray-400">
                          ({COMMON_TIMEZONES.find((tz) => tz.value === post.timezone)?.label || post.timezone})
                        </span>
                      )}
                    </span>
                    {post.tags && post.tags.length > 0 && (
                      <span>Tags: {post.tags.join(', ')}</span>
                    )}
                    {(post.status === 'pending' || post.status === 'uploading') && (
                      <button
                        onClick={() => handleEditSchedule(post)}
                        className="text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        Edit Schedule
                      </button>
                    )}
                  </div>

                  {/* Edit Schedule Modal */}
                  {editingPostId === post.id && editSchedule && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-gray-900">
                        Edit Schedule
                      </h4>
                      <SchedulePicker
                        onScheduleSelect={(date, tz) => {
                          setEditSchedule(date);
                          if (tz) {
                            setEditTimezone(tz);
                          }
                        }}
                        defaultDate={editSchedule}
                        defaultTimezone={editTimezone}
                      />
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={handleSaveSchedule}
                          disabled={saving || !editSchedule}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Platform Status */}
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-medium text-gray-700">
                      Platform Status:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {post.post_platforms.map((pp) => {
                        const isRetrying = retryingPlatform?.postId === post.id && retryingPlatform?.platform === pp.platform;
                        const showRetry = pp.status === 'failed';
                        
                        return (
                          <div
                            key={pp.id}
                            className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1"
                          >
                            <span className="text-sm font-medium text-gray-700">
                              {PLATFORM_NAMES[pp.platform]}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                STATUS_COLORS[pp.status] || STATUS_COLORS.pending
                              }`}
                            >
                              {pp.status}
                            </span>
                            {pp.error_message && (
                              <span className="text-xs text-red-600 max-w-xs truncate" title={pp.error_message}>
                                {pp.error_message}
                              </span>
                            )}
                            {showRetry && (
                              <div className="flex items-center gap-2">
                                {isRetrying && (
                                  <>
                                    <input
                                      type="file"
                                      accept="video/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          setRetryVideoFile(file);
                                        }
                                      }}
                                      className="text-xs"
                                    />
                                    <button
                                      onClick={() => handleRetry(post.id, pp.platform)}
                                      disabled={!retryVideoFile}
                                      className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Retry with New Video
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRetryingPlatform(null);
                                        setRetryVideoFile(null);
                                      }}
                                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {!isRetrying && (
                                  <button
                                    onClick={() => handleRetry(post.id, pp.platform)}
                                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                                  >
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

