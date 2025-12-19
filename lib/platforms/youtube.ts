import { createClient } from '@/lib/supabase/server';
import type { PlatformConnection } from '@/types/database';

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/youtube/callback`;

export function getYouTubeAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    // Use full youtube scope which includes upload, read, and update permissions
    scope: 'https://www.googleapis.com/auth/youtube',
    access_type: 'offline',
    prompt: 'consent', // Force consent screen to ensure new scopes are granted
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCodeForTokens(
  code: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return await response.json();
}

export async function refreshYouTubeToken(
  refreshToken: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return await response.json();
}

export async function getYouTubeConnection(
  userId: string
): Promise<PlatformConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
    .single();

  if (error || !data) {
    return null;
  }

  return data as PlatformConnection;
}

export async function saveYouTubeConnection(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  platformUserId?: string
): Promise<void> {
  const supabase = await createClient();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error } = await supabase.from('platform_connections').upsert(
    {
      user_id: userId,
      platform: 'youtube',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      platform_user_id: platformUserId || null,
    },
    {
      onConflict: 'user_id,platform',
    }
  );

  if (error) {
    throw new Error(`Failed to save connection: ${error.message}`);
  }
}

export async function getValidYouTubeAccessToken(
  userId: string
): Promise<string> {
  const connection = await getYouTubeConnection(userId);

  if (!connection) {
    throw new Error('YouTube account not connected');
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    // Token is expired or about to expire, refresh it
    if (!connection.refresh_token) {
      throw new Error('No refresh token available');
    }

    const refreshed = await refreshYouTubeToken(connection.refresh_token);
    const newExpiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    // Update the connection with new token
    const supabase = await createClient();
    await supabase
      .from('platform_connections')
      .update({
        access_token: refreshed.access_token,
        expires_at: newExpiresAt,
      })
      .eq('id', connection.id);

    return refreshed.access_token;
  }

  return connection.access_token;
}

export interface YouTubeUploadOptions {
  videoFile: File | ArrayBuffer;
  title: string;
  description: string;
  tags?: string[];
  scheduledAt: Date;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  categoryId?: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  thumbnailUrl: string;
}

export async function uploadVideoToYouTube(
  userId: string,
  options: YouTubeUploadOptions
): Promise<YouTubeUploadResult> {
  const accessToken = await getValidYouTubeAccessToken(userId);

  // Validate and filter tags
  const validTags = validateYouTubeTags(options.tags);

  // Step 1: Initialize upload and get upload URL
  const metadata = {
    snippet: {
      title: options.title,
      description: options.description,
      tags: validTags,
      categoryId: options.categoryId || '22', // Default to People & Blogs if not specified
    },
    status: {
      privacyStatus: options.privacyStatus || 'private',
      publishAt: options.scheduledAt.toISOString(),
      selfDeclaredMadeForKids: false,
    },
  };

  // Initialize the upload
  const initResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/*',
        'X-Upload-Content-Length': options.videoFile instanceof File 
          ? options.videoFile.size.toString() 
          : options.videoFile.byteLength.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Failed to initialize YouTube upload: ${error}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('No upload URL received from YouTube');
  }

  // Step 2: Upload the video file
  const videoBuffer: ArrayBuffer = options.videoFile instanceof File
    ? await options.videoFile.arrayBuffer()
    : options.videoFile;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/*',
      'Content-Length': videoBuffer.byteLength.toString(),
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload video to YouTube: ${error}`);
  }

  const uploadResult = await uploadResponse.json();

  if (!uploadResult.id) {
    throw new Error('No video ID received from YouTube');
  }

  // Step 3: Get video details including thumbnail
  const videoDetailsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${uploadResult.id}&part=snippet`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!videoDetailsResponse.ok) {
    // Video uploaded but couldn't get details, return what we have
    return {
      videoId: uploadResult.id,
      thumbnailUrl: `https://img.youtube.com/vi/${uploadResult.id}/maxresdefault.jpg`,
    };
  }

  const videoDetails = await videoDetailsResponse.json();
  const thumbnails = videoDetails.items?.[0]?.snippet?.thumbnails;

  return {
    videoId: uploadResult.id,
    thumbnailUrl:
      thumbnails?.maxres?.url ||
      thumbnails?.standard?.url ||
      thumbnails?.high?.url ||
      thumbnails?.medium?.url ||
      thumbnails?.default?.url ||
      `https://img.youtube.com/vi/${uploadResult.id}/maxresdefault.jpg`,
  };
}

/**
 * Update the scheduled publish time for an existing YouTube video
 */
export async function updateYouTubeVideoSchedule(
  userId: string,
  videoId: string,
  scheduledAt: Date
): Promise<void> {
  const accessToken = await getValidYouTubeAccessToken(userId);

  // Get current video details first
  const getResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${videoId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!getResponse.ok) {
    const error = await getResponse.text();
    throw new Error(`Failed to get video details: ${error}`);
  }

  const videoData = await getResponse.json();
  if (!videoData.items || videoData.items.length === 0) {
    throw new Error('Video not found');
  }

  const video = videoData.items[0];

  // Update the video with new scheduled time
  // Note: YouTube API requires both snippet and status parts when updating
  const updateResponse = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet,status',
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: videoId,
        snippet: video.snippet, // Include snippet to avoid errors
        status: {
          ...video.status,
          publishAt: scheduledAt.toISOString(),
        },
      }),
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update YouTube video schedule: ${error}`);
  }
}

export interface YouTubeUpdateMetadataOptions {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  skipTags?: boolean; // Skip updating tags entirely (keeps existing YouTube tags)
}

/**
 * Validate and filter tags for YouTube API requirements:
 * - Each tag max 30 characters
 * - Total combined length of all tags max 500 characters
 *   - Tags with spaces are wrapped in quotes, adding 2 characters
 *   - Commas between tags also count (1 character per tag after the first)
 * - Remove empty tags and trim whitespace
 * - Remove invalid characters (no apostrophes, question marks, exclamation marks, or punctuation)
 * - Tags must be alphanumeric with limited special characters (spaces, hyphens, underscores)
 * - Remove duplicate tags (case-insensitive)
 */
function validateYouTubeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  // Filter and validate tags
  const validTags: string[] = [];
  let totalLength = 0;
  const maxTagLength = 30;
  const maxTotalLength = 500;
  
  // YouTube allows: letters, numbers, spaces, hyphens, underscores ONLY
  // NO apostrophes, question marks, exclamation marks, or any other punctuation
  // Be very restrictive - YouTube is extremely strict about tag format
  const sanitizeTag = (tag: string): string => {
    if (!tag || typeof tag !== 'string') {
      return '';
    }
    
    // Remove ALL punctuation including apostrophes, question marks, exclamation marks, etc.
    // Keep only alphanumeric, spaces, hyphens, and underscores
    // The regex [^\w\s\-] removes everything except word characters, spaces, and hyphens
    // This explicitly removes: apostrophes ('), question marks (?), exclamation marks (!), etc.
    let sanitized = tag
      .replace(/[''""?!.,;:()\[\]{}@#$%^&*+=|\\\/<>~`]/g, '') // Explicitly remove common punctuation
      .replace(/[^\w\s\-]/g, '') // Remove any remaining invalid characters (keep only word chars, spaces, hyphens)
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
    
    // Remove tags that are only special characters or too short (less than 1 character after sanitization)
    if (sanitized.length < 1) {
      return '';
    }
    
    // Remove leading/trailing hyphens that might cause issues
    sanitized = sanitized.replace(/^\-+|\-+$/g, '');
    
    // Final check - if tag is empty after all processing, return empty string
    if (sanitized.length < 1) {
      return '';
    }
    
    // Ensure tag doesn't contain only spaces
    if (!sanitized.replace(/\s/g, '').length) {
      return '';
    }
    
    return sanitized;
  };

  // Use a Set to track tags we've already added (case-insensitive for duplicate detection)
  const seenTags = new Set<string>();

  for (const tag of tags) {
    // Trim and filter empty tags
    let processedTag = tag.trim();
    if (!processedTag) continue;

    // Sanitize the tag
    processedTag = sanitizeTag(processedTag);
    if (!processedTag) continue;

    // Check individual tag length
    if (processedTag.length > maxTagLength) {
      // Truncate to max length
      processedTag = processedTag.substring(0, maxTagLength).trim();
      if (!processedTag) continue;
    }

    // Check for duplicates (case-insensitive)
    const tagLower = processedTag.toLowerCase();
    if (seenTags.has(tagLower)) {
      // Skip duplicate tags
      continue;
    }

    // Calculate the length YouTube will count for this tag
    // Tags with spaces are wrapped in quotes, adding 2 characters
    // Also add 1 for the comma separator (except for the first tag)
    const hasSpaces = processedTag.includes(' ');
    const tagCharLength = hasSpaces ? processedTag.length + 2 : processedTag.length;
    const commaLength = validTags.length > 0 ? 1 : 0; // comma before this tag (if not first)
    const youtubeTagLength = tagCharLength + commaLength;

    // Check if adding this tag would exceed total length
    // YouTube's 500 character limit includes quotes for tags with spaces AND commas between tags
    if (totalLength + youtubeTagLength > maxTotalLength) {
      // Stop adding tags if we'd exceed the limit
      break;
    }

    validTags.push(processedTag);
    seenTags.add(tagLower);
    totalLength += youtubeTagLength;
  }

  return validTags;
}

/**
 * Update metadata (title, description, tags) for an existing YouTube video
 */
export async function updateYouTubeVideoMetadata(
  userId: string,
  videoId: string,
  options: YouTubeUpdateMetadataOptions
): Promise<void> {
  const accessToken = await getValidYouTubeAccessToken(userId);

  // Get current video details first
  const getResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!getResponse.ok) {
    const error = await getResponse.text();
    throw new Error(`Failed to get video details: ${error}`);
  }

  const videoData = await getResponse.json();
  if (!videoData.items || videoData.items.length === 0) {
    throw new Error('Video not found');
  }

  const video = videoData.items[0];

  // Build snippet object with ONLY writable fields
  // YouTube API rejects updates that include read-only fields like:
  // publishedAt, channelId, thumbnails, liveBroadcastContent, localized
  const snippetUpdate: any = {
    title: options.title,
    description: options.description,
    categoryId: options.categoryId || video.snippet.categoryId || '22',
  };

  // Include defaultLanguage if it exists (optional writable field)
  if (video.snippet.defaultLanguage) {
    snippetUpdate.defaultLanguage = video.snippet.defaultLanguage;
  }

  // Only update tags if they are provided and not skipped
  // skipTags option allows updating only title/description without touching tags
  if (options.skipTags) {
    // Don't include tags field at all - YouTube will keep existing tags
    console.log('YouTube: Skipping tag update, keeping existing tags');
  } else if (options.tags !== undefined && options.tags !== null) {
    const validTags = validateYouTubeTags(options.tags);
    
    // Log for debugging
    console.log('YouTube tags validation:', {
      input: options.tags,
      output: validTags,
      totalLength: validTags.reduce((sum, tag) => sum + (tag.includes(' ') ? tag.length + 2 : tag.length), 0),
    });
    
    // Set tags - use validated array (can be empty)
    snippetUpdate.tags = validTags;
  }
  // If tags not provided and not skipping, don't include tags field - YouTube keeps existing

  // Update the video metadata
  const updateResponse = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet',
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: videoId,
        snippet: snippetUpdate,
      }),
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update YouTube video metadata: ${error}`);
  }
}

