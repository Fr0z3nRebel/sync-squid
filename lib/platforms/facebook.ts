import { createClient } from '@/lib/supabase/server';
import type { PlatformConnection } from '@/types/database';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/facebook/callback`;

export function getFacebookAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
    response_type: 'code',
    ...(state && { state }),
  });

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeFacebookCodeForTokens(
  code: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);

  const tokenResponse = await fetch(tokenUrl.toString());

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await tokenResponse.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000, // Default to 60 days if not provided
  };
}

export async function refreshFacebookToken(
  accessToken: string
): Promise<{
  access_token: string;
  expires_in: number;
}> {
  // Facebook tokens are long-lived, but we can extend them
  const response = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return await response.json();
}

export async function getFacebookConnection(
  userId: string
): Promise<PlatformConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .single();

  if (error || !data) {
    return null;
  }

  return data as PlatformConnection;
}

export async function saveFacebookConnection(
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
      platform: 'facebook',
      access_token: accessToken,
      refresh_token: null, // Facebook uses long-lived tokens
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

export async function getValidFacebookAccessToken(
  userId: string
): Promise<string> {
  const connection = await getFacebookConnection(userId);

  if (!connection) {
    throw new Error('Facebook account not connected');
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    // Try to refresh the token
    try {
      const refreshed = await refreshFacebookToken(connection.access_token);
      const newExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString();

      const supabase = await createClient();
      await supabase
        .from('platform_connections')
        .update({
          access_token: refreshed.access_token,
          expires_at: newExpiresAt,
        })
        .eq('id', connection.id);

      return refreshed.access_token;
    } catch (error) {
      // If refresh fails, return the existing token and let the API call fail
      console.error('Failed to refresh Facebook token:', error);
    }
  }

  return connection.access_token;
}

export interface FacebookUploadOptions {
  videoFile: File | ArrayBuffer;
  title: string;
  description: string;
  scheduledAt: Date;
  pageId?: string; // Facebook Page ID for posting
  videoType?: 'REELS' | 'VIDEO'; // Post as Reels or regular video (default: VIDEO)
}

export interface FacebookUploadResult {
  videoId: string;
  thumbnailUrl: string | null;
}

export async function uploadVideoToFacebook(
  userId: string,
  options: FacebookUploadOptions
): Promise<FacebookUploadResult> {
  const accessToken = await getValidFacebookAccessToken(userId);

  // Get user's pages if pageId not provided
  let pageId = options.pageId;
  if (!pageId) {
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json();
      if (pagesData.data && pagesData.data.length > 0) {
        pageId = pagesData.data[0].id;
      }
    }
  }

  if (!pageId) {
    throw new Error('No Facebook Page found. Please create a page first.');
  }

  // Get page access token
  const pageTokenResponse = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${accessToken}`
  );
  const pageData = await pageTokenResponse.json();
  const pageAccessToken = pageData.access_token;

  // Step 1: Create video container
  const videoBuffer: ArrayBuffer = options.videoFile instanceof File
    ? await options.videoFile.arrayBuffer()
    : options.videoFile;

  const requestBody: Record<string, any> = {
    access_token: pageAccessToken,
    title: options.title,
    description: options.description,
    scheduled_publish_time: Math.floor(options.scheduledAt.getTime() / 1000),
    published: false,
  };

  // Only add video_type parameter if explicitly set to REELS
  if (options.videoType === 'REELS') {
    requestBody.video_type = 'REELS';
  }

  const createVideoResponse = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}/videos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!createVideoResponse.ok) {
    const error = await createVideoResponse.text();
    throw new Error(`Failed to create Facebook video: ${error}`);
  }

  const videoData = await createVideoResponse.json();
  const uploadSessionId = videoData.upload_session_id;

  if (!uploadSessionId) {
    throw new Error('No upload session ID received from Facebook');
  }

  // Step 2: Upload video file in chunks (Facebook requires chunked upload for large files)
  const chunkSize = 2 * 1024 * 1024; // 2MB chunks
  const totalChunks = Math.ceil(videoBuffer.byteLength / chunkSize);
  let startOffset = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const endOffset = Math.min(startOffset + chunkSize, videoBuffer.byteLength);
    const chunk = videoBuffer.slice(startOffset, endOffset);

    const uploadChunkResponse = await fetch(
      `https://graph.facebook.com/v18.0/${uploadSessionId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${pageAccessToken}`,
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${startOffset}-${endOffset - 1}/${videoBuffer.byteLength}`,
        },
        body: chunk,
      }
    );

    if (!uploadChunkResponse.ok) {
      const error = await uploadChunkResponse.text();
      throw new Error(`Failed to upload chunk ${chunkIndex + 1}: ${error}`);
    }

    startOffset = endOffset;
  }

  // Step 3: Finalize upload
  const finalizeResponse = await fetch(
    `https://graph.facebook.com/v18.0/${uploadSessionId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${pageAccessToken}`,
      },
    }
  );

  if (!finalizeResponse.ok) {
    const error = await finalizeResponse.text();
    throw new Error(`Failed to finalize Facebook upload: ${error}`);
  }

  const finalData = await finalizeResponse.json();
  const videoId = finalData.video_id || videoData.id;

  return {
    videoId: videoId.toString(),
    thumbnailUrl: null, // Facebook doesn't provide thumbnail URL immediately
  };
}

