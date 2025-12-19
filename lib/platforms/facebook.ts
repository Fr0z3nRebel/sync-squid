import { createClient } from '@/lib/supabase/server';
import type { PlatformConnection } from '@/types/database';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/platforms/facebook/callback`;

export function getFacebookAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management,instagram_basic,instagram_content_publish',
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
  
  // Check for Facebook API errors in the response
  if (data.error) {
    throw new Error(`Facebook API error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  
  if (!data.access_token) {
    throw new Error('No access token received from Facebook');
  }
  
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

  // Prepare video buffer
  const videoBuffer: ArrayBuffer = options.videoFile instanceof File
    ? await options.videoFile.arrayBuffer()
    : options.videoFile;

  const fileSize = videoBuffer.byteLength;
  const fileSizeMB = fileSize / (1024 * 1024);
  const maxFileSizeMB = options.videoType === 'REELS' ? 1000 : 4096;
  
  if (fileSizeMB > maxFileSizeMB) {
    throw new Error(`Video file is too large (${fileSizeMB.toFixed(1)}MB). Maximum size is ${maxFileSizeMB}MB for ${options.videoType === 'REELS' ? 'Reels' : 'regular videos'}.`);
  }

  // Retry configuration based on file size
  const maxRetries = fileSizeMB > 100 ? 5 : 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Use Resumable Upload API for reliable uploads
      // Step 1: Start upload session with upload_phase=start
      const startParams = new URLSearchParams({
        upload_phase: 'start',
        access_token: pageAccessToken,
        file_size: fileSize.toString(),
      });

      const startResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/videos?${startParams.toString()}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(60000), // 1 minute timeout for start
        }
      );

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        const errorData = parseErrorResponse(errorText);
        
        if (shouldRetryError(errorData, attempt, maxRetries)) {
          await waitWithBackoff(attempt, fileSizeMB);
          lastError = new Error(getErrorMessage(errorData));
          continue;
        }
        
        throw new Error(getErrorMessage(errorData));
      }

      const startData = await startResponse.json();
      const uploadSessionId = startData.upload_session_id;
      const videoId = startData.video_id;

      if (!uploadSessionId) {
        throw new Error('No upload session ID received from Facebook');
      }

      console.log(`Started Facebook upload session for ${fileSizeMB.toFixed(1)}MB file`);

      // Step 2: Upload chunks with upload_phase=transfer
      const chunkSize = getOptimalChunkSize(fileSizeMB);
      const totalChunks = Math.ceil(fileSize / chunkSize);
      let startOffset = 0;

      console.log(`Uploading ${totalChunks} chunks (${(chunkSize / (1024 * 1024)).toFixed(1)}MB each)`);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const endOffset = Math.min(startOffset + chunkSize, fileSize);
        const chunk = videoBuffer.slice(startOffset, endOffset);

        const chunkUploaded = await uploadChunkWithRetry(
          pageId,
          uploadSessionId,
          pageAccessToken,
          chunk,
          startOffset,
          chunkIndex,
          totalChunks
        );

        if (!chunkUploaded) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}/${totalChunks} after retries`);
        }

        startOffset = endOffset;
        console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks} (${((chunkIndex + 1) / totalChunks * 100).toFixed(1)}%)`);
      }

      // Step 3: Finish upload with upload_phase=finish
      const finishParams = new URLSearchParams({
        upload_phase: 'finish',
        access_token: pageAccessToken,
        upload_session_id: uploadSessionId,
        title: options.title,
        description: options.description,
        scheduled_publish_time: Math.floor(options.scheduledAt.getTime() / 1000).toString(),
        published: 'false',
      });

      // Add video_type for Reels
      if (options.videoType === 'REELS') {
        finishParams.append('video_type', 'REELS');
      }

      const finishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/videos?${finishParams.toString()}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(120000), // 2 minute timeout for finish
        }
      );

      if (!finishResponse.ok) {
        const error = await finishResponse.text();
        throw new Error(`Failed to finalize Facebook upload: ${error}`);
      }

      const finishData = await finishResponse.json();
      const finalVideoId = finishData.video_id || videoId;

      console.log(`Facebook upload completed successfully, video ID: ${finalVideoId}`);

      return {
        videoId: finalVideoId.toString(),
        thumbnailUrl: null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries - 1) {
        console.error(`Facebook upload failed after ${maxRetries} attempts:`, lastError.message);
        throw lastError;
      }
      
      console.log(`Facebook upload attempt ${attempt + 1} failed, retrying...`);
      await waitWithBackoff(attempt, fileSizeMB);
    }
  }

  throw lastError || new Error('Failed to upload video to Facebook after multiple attempts');
}

/**
 * Upload a single chunk with retry logic
 */
async function uploadChunkWithRetry(
  pageId: string,
  uploadSessionId: string,
  accessToken: string,
  chunk: ArrayBuffer,
  startOffset: number,
  chunkIndex: number,
  totalChunks: number
): Promise<boolean> {
  const maxChunkRetries = 3;
  
  for (let retry = 0; retry < maxChunkRetries; retry++) {
    try {
      const formData = new FormData();
      formData.append('upload_phase', 'transfer');
      formData.append('access_token', accessToken);
      formData.append('upload_session_id', uploadSessionId);
      formData.append('start_offset', startOffset.toString());
      formData.append('video_file_chunk', new Blob([chunk]), 'chunk.mp4');

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/videos`,
        {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(300000), // 5 minutes per chunk
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = parseErrorResponse(errorText);
        
        if (errorData.error?.is_transient && retry < maxChunkRetries - 1) {
          const delay = (retry + 1) * 2000;
          console.log(`Chunk ${chunkIndex + 1}/${totalChunks} transient error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(`Chunk upload failed: ${getErrorMessage(errorData)}`);
      }

      return true;
    } catch (error) {
      if (retry === maxChunkRetries - 1) {
        console.error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after ${maxChunkRetries} retries:`, error);
        return false;
      }
      
      const delay = (retry + 1) * 2000;
      console.log(`Chunk ${chunkIndex + 1}/${totalChunks} error, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

/**
 * Parse error response from Facebook API
 */
function parseErrorResponse(errorText: string): { error?: { message?: string; error_user_msg?: string; is_transient?: boolean } } {
  try {
    return JSON.parse(errorText);
  } catch {
    return { error: { message: errorText } };
  }
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(errorData: { error?: { message?: string; error_user_msg?: string } }): string {
  return errorData.error?.error_user_msg || errorData.error?.message || 'Unknown Facebook API error';
}

/**
 * Check if we should retry based on error type
 */
function shouldRetryError(
  errorData: { error?: { is_transient?: boolean } },
  attempt: number,
  maxRetries: number
): boolean {
  return !!errorData.error?.is_transient && attempt < maxRetries - 1;
}

/**
 * Wait with exponential backoff
 */
async function waitWithBackoff(attempt: number, fileSizeMB: number): Promise<void> {
  const baseDelay = fileSizeMB > 100 ? 5000 : 2000;
  const delay = baseDelay * Math.pow(2, attempt);
  console.log(`Waiting ${delay}ms before retry (attempt ${attempt + 1})...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get optimal chunk size based on file size
 */
function getOptimalChunkSize(fileSizeMB: number): number {
  if (fileSizeMB > 500) {
    return 20 * 1024 * 1024; // 20MB for very large files
  } else if (fileSizeMB > 100) {
    return 10 * 1024 * 1024; // 10MB for large files
  } else if (fileSizeMB > 20) {
    return 5 * 1024 * 1024; // 5MB for medium files
  }
  return 2 * 1024 * 1024; // 2MB for small files
}

export interface FacebookUpdateMetadataOptions {
  title: string;
  description: string;
}

/**
 * Update metadata (title, description) for an existing Facebook video
 */
export async function updateFacebookVideoMetadata(
  userId: string,
  videoId: string,
  options: FacebookUpdateMetadataOptions
): Promise<void> {
  const accessToken = await getValidFacebookAccessToken(userId);

  // Get page access token (videos are posted to pages)
  const pagesResponse = await fetch(
    `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
  );
  
  if (!pagesResponse.ok) {
    throw new Error('Failed to get Facebook pages');
  }

  const pagesData = await pagesResponse.json();
  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error('No Facebook Page found');
  }

  const pageId = pagesData.data[0].id;
  const pageTokenResponse = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${accessToken}`
  );
  const pageData = await pageTokenResponse.json();
  const pageAccessToken = pageData.access_token;

  // Update video metadata using Graph API
  const updateParams = new URLSearchParams({
    access_token: pageAccessToken,
    title: options.title,
    description: options.description,
  });

  const updateResponse = await fetch(
    `https://graph.facebook.com/v18.0/${videoId}?${updateParams.toString()}`,
    {
      method: 'POST',
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update Facebook video metadata: ${error}`);
  }
}

