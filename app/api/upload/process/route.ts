import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { uploadVideoToYouTube } from '@/lib/platforms/youtube';
import { uploadVideoToFacebook } from '@/lib/platforms/facebook';
import { uploadReelToInstagram } from '@/lib/platforms/instagram';
import { uploadVideoToTikTok } from '@/lib/platforms/tiktok';

// Process video from Supabase Storage and upload to platforms
export const maxDuration = 300; // 5 minutes
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      postId,
      filePath,
      platform,
      title,
      description,
      tags,
      scheduledAt,
      youtubeCategoryId,
      facebookVideoType,
    } = body;

    if (!postId || !filePath || !platform || !title || !description || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Download video from Supabase Storage
    const { data: videoData, error: downloadError } = await supabase.storage
      .from('videos')
      .download(filePath);

    if (downloadError || !videoData) {
      console.error('Error downloading from storage:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download video from storage' },
        { status: 500 }
      );
    }

    // Convert Blob to ArrayBuffer
    const videoBuffer = await videoData.arrayBuffer();
    const tagArray = tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) : [];
    const scheduledDate = new Date(scheduledAt);

    // Upload to the specific platform
    let result;
    try {
      switch (platform) {
        case 'youtube':
          result = await uploadVideoToYouTube(user.id, {
            videoFile: videoBuffer,
            title,
            description,
            tags: tagArray,
            scheduledAt: scheduledDate,
            privacyStatus: 'private',
            categoryId: youtubeCategoryId || undefined,
          });
          break;

        case 'facebook':
          result = await uploadVideoToFacebook(user.id, {
            videoFile: videoBuffer,
            title,
            description,
            scheduledAt: scheduledDate,
            videoType: facebookVideoType === 'REELS' ? 'REELS' : undefined,
          });
          break;

        case 'instagram':
          result = await uploadReelToInstagram(user.id, {
            videoFile: videoBuffer,
            title,
            description,
            scheduledAt: scheduledDate,
          });
          break;

        case 'tiktok':
          result = await uploadVideoToTikTok(user.id, {
            videoFile: videoBuffer,
            title,
            description,
            scheduledAt: scheduledDate,
          });
          break;

        default:
          throw new Error(`Unknown platform: ${platform}`);
      }

      // Update post_platforms record
      await supabase
        .from('post_platforms')
        .update({
          platform_video_id: result.videoId,
          thumbnail_url: result.thumbnailUrl,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
        })
        .eq('post_id', postId)
        .eq('platform', platform);

      // Note: Video deletion happens after all platforms are processed
      // See upload/page.tsx for cleanup logic

      return NextResponse.json({
        success: true,
        platform,
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error(`Error uploading to ${platform}:`, error);

      // Update post_platforms record with error
      await supabase
        .from('post_platforms')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('post_id', postId)
        .eq('platform', platform);

      // Note: Video deletion happens after all platforms are processed
      // See upload/page.tsx for cleanup logic

      return NextResponse.json(
        { error: errorMessage, platform },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to process upload';
    console.error('Process upload error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

