import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { uploadVideoToYouTube } from '@/lib/platforms/youtube';
import { uploadVideoToFacebook } from '@/lib/platforms/facebook';
import { uploadReelToInstagram } from '@/lib/platforms/instagram';
import { uploadVideoToTikTok } from '@/lib/platforms/tiktok';
import type { Platform } from '@/types/database';

// Configure for larger body size (up to 100MB)
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

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const postId = formData.get('postId') as string;
    const platform = formData.get('platform') as Platform;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const tags = formData.get('tags') as string;
    const scheduledAt = formData.get('scheduledAt') as string;

    if (!videoFile || !postId || !platform || !title || !description || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const tagArray = tags ? tags.split(',').map((t) => t.trim()) : [];
    const scheduledDate = new Date(scheduledAt);
    const videoBuffer = await videoFile.arrayBuffer();

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
          });
          break;

        case 'facebook':
          result = await uploadVideoToFacebook(user.id, {
            videoFile: videoBuffer,
            title,
            description,
            scheduledAt: scheduledDate,
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

      return NextResponse.json(
        { error: errorMessage, platform },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

