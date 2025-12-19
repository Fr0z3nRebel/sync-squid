import { createClient } from '@/lib/supabase/server';
import type { PlatformConnection } from '@/types/database';

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/tiktok/callback`;

export function getTikTokAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'video.upload',
    ...(state && { state }),
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export async function exchangeTikTokCodeForTokens(
  code: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_in: data.data.expires_in,
  };
}

export async function refreshTikTokToken(
  refreshToken: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.data.access_token,
    expires_in: data.data.expires_in,
  };
}

export async function getTikTokConnection(
  userId: string
): Promise<PlatformConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'tiktok')
    .single();

  if (error || !data) {
    return null;
  }

  return data as PlatformConnection;
}

export async function saveTikTokConnection(
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
      platform: 'tiktok',
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

export async function getValidTikTokAccessToken(
  userId: string
): Promise<string> {
  const connection = await getTikTokConnection(userId);

  if (!connection) {
    throw new Error('TikTok account not connected');
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

    const refreshed = await refreshTikTokToken(connection.refresh_token);
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

export interface TikTokUploadOptions {
  videoFile: File | ArrayBuffer;
  title: string;
  description: string;
  scheduledAt: Date;
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIEND' | 'SELF_ONLY';
}

export interface TikTokUploadResult {
  videoId: string;
  thumbnailUrl: string | null;
}

export async function uploadVideoToTikTok(
  userId: string,
  options: TikTokUploadOptions
): Promise<TikTokUploadResult> {
  const accessToken = await getValidTikTokAccessToken(userId);

  // TikTok API v2 upload process
  // Step 1: Initialize upload
  const videoBuffer: ArrayBuffer = options.videoFile instanceof File
    ? await options.videoFile.arrayBuffer()
    : options.videoFile;

  const initResponse = await fetch(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: options.title,
          description: options.description,
          privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoBuffer.byteLength,
          chunk_size: 10000000, // 10MB chunks
          total_chunk_count: Math.ceil(videoBuffer.byteLength / 10000000),
        },
      }),
    }
  );

  if (!initResponse.ok) {
    const error = await initResponse.text();
    // TikTok API might not be fully available, throw with a clear message
    throw new Error(`TikTok API error: ${error}. TikTok API may have limitations or require additional setup.`);
  }

  const initData = await initResponse.json();

  if (initData.error) {
    throw new Error(`TikTok API error: ${initData.error.message || 'Unknown error'}`);
  }

  const publishId = initData.data.publish_id;
  const uploadUrl = initData.data.upload_url;

  if (!publishId || !uploadUrl) {
    throw new Error('Invalid response from TikTok API');
  }

  // Step 2: Upload video in chunks
  const chunkSize = 10000000; // 10MB
  const totalChunks = Math.ceil(videoBuffer.byteLength / chunkSize);
  let startOffset = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const endOffset = Math.min(startOffset + chunkSize, videoBuffer.byteLength);
    const chunk = videoBuffer.slice(startOffset, endOffset);

    const uploadChunkResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${startOffset}-${endOffset - 1}/${videoBuffer.byteLength}`,
      },
      body: chunk,
    });

    if (!uploadChunkResponse.ok) {
      const error = await uploadChunkResponse.text();
      throw new Error(`Failed to upload chunk ${chunkIndex + 1}: ${error}`);
    }

    startOffset = endOffset;
  }

  // Step 3: Get upload status and publish
  // Note: TikTok doesn't support direct scheduling, so we'll need to handle this differently
  // For now, we'll return the publish_id
  // In production, you might want to store this and publish at the scheduled time

  return {
    videoId: publishId,
    thumbnailUrl: null, // TikTok doesn't provide thumbnail URL in upload response
  };
}

export interface TikTokUpdateMetadataOptions {
  title: string;
  description: string;
}

/**
 * Update metadata (title, description) for an existing TikTok video
 * Note: TikTok API has limited support for updating published content
 * This may only work for videos that haven't been published yet
 */
export async function updateTikTokVideoMetadata(
  userId: string,
  videoId: string,
  options: TikTokUpdateMetadataOptions
): Promise<void> {
  const accessToken = await getValidTikTokAccessToken(userId);

  // TikTok API v2 doesn't have a direct update endpoint for published videos
  // The metadata is set during upload and cannot be changed after publishing
  // This function is a placeholder for future API support
  throw new Error('TikTok API does not currently support updating metadata for published videos. Metadata can only be set during upload.');
}

