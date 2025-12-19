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

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const tags = formData.get('tags') as string;
    const scheduledAt = formData.get('scheduledAt') as string;
    const platforms = formData.get('platforms') as string;

    if (!videoFile || !title || !description || !scheduledAt || !platforms) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const selectedPlatforms: Platform[] = JSON.parse(platforms);
    const tagArray = tags ? tags.split(',').map((t) => t.trim()) : [];
    const scheduledDate = new Date(scheduledAt);

    // Create scheduled post record
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        title,
        description,
        tags: tagArray,
        scheduled_at: scheduledDate.toISOString(),
        status: 'uploading',
      })
      .select()
      .single();

    if (postError || !post) {
      console.error('Error creating post:', postError);
      return NextResponse.json(
        { error: 'Failed to create scheduled post' },
        { status: 500 }
      );
    }

    // Create post_platforms records
    const platformRecords = selectedPlatforms.map((platform) => ({
      post_id: post.id,
      platform,
      status: 'pending',
    }));

    const { error: platformError } = await supabase
      .from('post_platforms')
      .insert(platformRecords);

    if (platformError) {
      console.error('Error creating platform records:', platformError);
      return NextResponse.json(
        { error: 'Failed to create platform records' },
        { status: 500 }
      );
    }

    // Upload to platforms in parallel
    const uploadPromises = selectedPlatforms.map(async (platform) => {
      try {
        let result;
        const videoBuffer = await videoFile.arrayBuffer();

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
          .eq('post_id', post.id)
          .eq('platform', platform);

        return { platform, success: true, result };
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
          .eq('post_id', post.id)
          .eq('platform', platform);

        return { platform, success: false, error: errorMessage };
      }
    });

    const uploadResults = await Promise.allSettled(uploadPromises);

    // Check if all uploads succeeded
    const allSucceeded = uploadResults.every(
      (result) =>
        result.status === 'fulfilled' && result.value.success === true
    );

    // Update post status
    await supabase
      .from('scheduled_posts')
      .update({
        status: allSucceeded ? 'pending' : 'failed',
      })
      .eq('id', post.id);

    return NextResponse.json({
      success: true,
      postId: post.id,
      uploadResults: uploadResults.map((r) =>
        r.status === 'fulfilled' ? r.value : { success: false, error: 'Unknown error' }
      ),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

