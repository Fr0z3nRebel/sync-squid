import { createClient } from '@/lib/supabase/server';
import type { PlatformConnection } from '@/types/database';
import { getValidFacebookAccessToken } from './facebook';

// Instagram uses Facebook OAuth, so we'll reuse Facebook tokens
// Instagram requires a Facebook Page and Instagram Business Account

export async function getInstagramConnection(
  userId: string
): Promise<PlatformConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'instagram')
    .single();

  if (error || !data) {
    return null;
  }

  return data as PlatformConnection;
}

export async function saveInstagramConnection(
  userId: string,
  accessToken: string,
  expiresIn: number,
  platformUserId?: string
): Promise<void> {
  const supabase = await createClient();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error } = await supabase.from('platform_connections').upsert(
    {
      user_id: userId,
      platform: 'instagram',
      access_token: accessToken,
      refresh_token: null,
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

export async function getValidInstagramAccessToken(
  userId: string
): Promise<string> {
  // Instagram can use Facebook token if connected via Facebook
  // Or use dedicated Instagram connection
  const connection = await getInstagramConnection(userId);

  if (connection) {
    const expiresAt = connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : 0;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt - now > fiveMinutes) {
      return connection.access_token;
    }
  }

  // Fallback to Facebook token if Instagram connection doesn't exist
  try {
    return await getValidFacebookAccessToken(userId);
  } catch {
    throw new Error('Instagram account not connected');
  }
}

export interface InstagramUploadOptions {
  videoFile: File | ArrayBuffer;
  title: string;
  description: string;
  scheduledAt: Date;
  instagramAccountId?: string; // Instagram Business Account ID
  pageId?: string; // Facebook Page ID
}

export interface InstagramUploadResult {
  videoId: string;
  thumbnailUrl: string | null;
}

export async function uploadReelToInstagram(
  userId: string,
  options: InstagramUploadOptions
): Promise<InstagramUploadResult> {
  const accessToken = await getValidInstagramAccessToken(userId);

  // Get Facebook Page and Instagram Account
  let pageId = options.pageId;
  let instagramAccountId = options.instagramAccountId;

  if (!pageId || !instagramAccountId) {
    // Get user's pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    if (!pagesResponse.ok) {
      throw new Error('Failed to get Facebook pages');
    }

    const pagesData = await pagesResponse.json();
    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('No Facebook Page found. Please create a page and connect it to Instagram.');
    }

    pageId = pageId || pagesData.data[0].id;

    // Get Instagram Business Account ID from page
    const pageInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
    );

    if (!pageInfoResponse.ok) {
      throw new Error('Failed to get Instagram account from page');
    }

    const pageInfo = await pageInfoResponse.json();
    instagramAccountId = instagramAccountId || pageInfo.instagram_business_account?.id;

    if (!instagramAccountId) {
      throw new Error('No Instagram Business Account found. Please connect your Instagram account to your Facebook Page.');
    }
  }

  // Step 1: Create video container
  const videoBuffer: ArrayBuffer = options.videoFile instanceof File
    ? await options.videoFile.arrayBuffer()
    : options.videoFile;

  // Actually, Instagram Reels API requires a different approach
  // We need to upload the video file directly
  const formData = new FormData();
  formData.append('video_file', new Blob([videoBuffer]), 'video.mp4');
  formData.append('caption', options.description);
  formData.append('access_token', accessToken);

  const uploadResponse = await fetch(
    `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload Instagram Reel: ${error}`);
  }

  const uploadData = await uploadResponse.json();
  const creationId = uploadData.id;

  if (!creationId) {
    throw new Error('No creation ID received from Instagram');
  }

  // Step 2: Publish the Reel (or schedule it)
  // Note: Instagram API doesn't support direct scheduling like YouTube
  // We'll publish it immediately but the video will be set to scheduled status
  // For true scheduling, you'd need to use a different approach or publish at the scheduled time

  // For now, we'll just return the creation ID
  // In production, you might want to store this and publish it at the scheduled time
  return {
    videoId: creationId,
    thumbnailUrl: null,
  };
}

