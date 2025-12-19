import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { uploadVideoToYouTube } from '@/lib/platforms/youtube';
import { uploadVideoToFacebook } from '@/lib/platforms/facebook';
import { uploadReelToInstagram } from '@/lib/platforms/instagram';
import { uploadVideoToTikTok } from '@/lib/platforms/tiktok';
import type { Platform } from '@/types/database';

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
    const { postId, platform, filePath: newFilePath } = body;

    if (!postId || !platform) {
      return NextResponse.json(
        { error: 'Missing required fields: postId and platform' },
        { status: 400 }
      );
    }

    // Get the post and verify ownership
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', user.id)
      .single();

    if (postError || !post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Get the post platform record
    const { data: postPlatform, error: platformError } = await supabase
      .from('post_platforms')
      .select('*')
      .eq('post_id', postId)
      .eq('platform', platform)
      .single();

    if (platformError || !postPlatform) {
      return NextResponse.json(
        { error: 'Platform record not found' },
        { status: 404 }
      );
    }

    // Check if video exists in storage or if user provided a new file path
    let videoBuffer: ArrayBuffer;
    let videoFilePath: string | null = null;

    // Use new file path if provided, otherwise try existing path
    const filePathToUse = newFilePath || post.video_file_path;

    if (filePathToUse) {
      // Try to download from storage
      const { data: videoData, error: downloadError } = await supabase.storage
        .from('videos')
        .download(filePathToUse);

      if (downloadError || !videoData) {
        return NextResponse.json(
          { 
            error: 'Video file not found in storage. Please provide a new video file.',
            requiresVideo: true 
          },
          { status: 404 }
        );
      }

      videoBuffer = await videoData.arrayBuffer();
      videoFilePath = filePathToUse;
      
      // If a new file path was provided, update the post's video_file_path in the database
      if (newFilePath && newFilePath !== post.video_file_path) {
        await supabase
          .from('scheduled_posts')
          .update({ video_file_path: newFilePath })
          .eq('id', postId);
      }
    } else {
      return NextResponse.json(
        { 
          error: 'No video file available. Please provide a video file.',
          requiresVideo: true 
        },
        { status: 400 }
      );
    }

    // Update status to uploading
    await supabase
      .from('post_platforms')
      .update({ status: 'pending', error_message: null })
      .eq('id', postPlatform.id);

    // Get platform-specific options
    const tagArray = post.tags ? (Array.isArray(post.tags) ? post.tags : []) : [];
    const scheduledDate = new Date(post.scheduled_at);

    // Upload to the specific platform
    let result;
    try {
      switch (platform as Platform) {
        case 'youtube':
          result = await uploadVideoToYouTube(user.id, {
            videoFile: videoBuffer,
            title: post.title,
            description: post.description,
            tags: tagArray,
            scheduledAt: scheduledDate,
            privacyStatus: 'private',
            categoryId: post.youtube_category_id || undefined,
          });
          break;

        case 'facebook':
          // Get Facebook-specific options from post_platforms if stored
          // For now, use defaults - could be enhanced to store these
          result = await uploadVideoToFacebook(user.id, {
            videoFile: videoBuffer,
            title: post.title,
            description: post.description,
            scheduledAt: scheduledDate,
            videoType: 'VIDEO', // Default, could be stored in post_platforms
          });
          break;

        case 'instagram':
          result = await uploadReelToInstagram(user.id, {
            videoFile: videoBuffer,
            title: post.title,
            description: post.description,
            scheduledAt: scheduledDate,
          });
          break;

        case 'tiktok':
          result = await uploadVideoToTikTok(user.id, {
            videoFile: videoBuffer,
            title: post.title,
            description: post.description,
            scheduledAt: scheduledDate,
          });
          break;

        default:
          throw new Error(`Unknown platform: ${platform}`);
      }

      // Update post_platforms record with success
      await supabase
        .from('post_platforms')
        .update({
          platform_video_id: result.videoId,
          thumbnail_url: result.thumbnailUrl,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', postPlatform.id);

      // Check if all platforms are now successful
      const { data: allPlatforms } = await supabase
        .from('post_platforms')
        .select('status')
        .eq('post_id', postId);

      const allUploaded = allPlatforms?.every(pp => 
        pp.status === 'uploaded' || pp.status === 'published'
      );

      if (allUploaded) {
        // Update post status to pending
        await supabase
          .from('scheduled_posts')
          .update({ status: 'pending' })
          .eq('id', postId);

        // Delete video from storage if it was stored there
        if (videoFilePath) {
          try {
            await supabase.storage
              .from('videos')
              .remove([videoFilePath]);
            
            // Clear the file path from database
            await supabase
              .from('scheduled_posts')
              .update({ video_file_path: null })
              .eq('id', postId);
          } catch (deleteErr) {
            console.error('Error deleting video from storage:', deleteErr);
            // Don't fail the request if deletion fails
          }
        }
      }

      return NextResponse.json({
        success: true,
        platform,
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error(`Error retrying upload to ${platform}:`, error);

      // Update post_platforms record with error
      await supabase
        .from('post_platforms')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', postPlatform.id);

      return NextResponse.json(
        { error: errorMessage, platform },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to retry upload';
    console.error('Retry upload error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

