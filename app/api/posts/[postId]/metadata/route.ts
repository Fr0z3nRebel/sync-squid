import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { updateYouTubeVideoMetadata } from '@/lib/platforms/youtube';
import { updateFacebookVideoMetadata } from '@/lib/platforms/facebook';
import { updateInstagramReelMetadata } from '@/lib/platforms/instagram';
import { updateTikTokVideoMetadata } from '@/lib/platforms/tiktok';
import type { Platform } from '@/types/database';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, tags, youtubeCategoryId, platforms, skipYouTubeTags } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Missing title or description' },
        { status: 400 }
      );
    }

    // Verify the post belongs to the user
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .select('id, status, youtube_category_id')
      .eq('id', postId)
      .eq('user_id', user.id)
      .single();

    if (postError || !post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Only prevent editing for failed posts
    // Allow editing for pending, uploading, and published posts
    if (post.status === 'failed') {
      return NextResponse.json(
        { error: 'Cannot edit metadata for failed posts' },
        { status: 400 }
      );
    }

    // Get all platform connections for this post
    const { data: postPlatforms, error: platformsError } = await supabase
      .from('post_platforms')
      .select('platform, platform_video_id, status')
      .eq('post_id', postId);

    if (platformsError) {
      console.error('Error fetching post platforms:', platformsError);
    }

    // Prepare tags array
    const tagsArray = tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)) : [];

    // Update metadata in database
    const updateData: {
      title: string;
      description: string;
      tags: string[];
      youtube_category_id?: string;
    } = {
      title,
      description,
      tags: tagsArray,
    };

    if (youtubeCategoryId) {
      updateData.youtube_category_id = youtubeCategoryId;
    }

    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update(updateData)
      .eq('id', postId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating metadata:', updateError);
      return NextResponse.json(
        { error: 'Failed to update metadata' },
        { status: 500 }
      );
    }

    // Update metadata on platforms where videos are already uploaded
    // If platforms array is provided, only update those platforms
    const selectedPlatforms: Platform[] = platforms || [];
    const platformUpdateErrors: string[] = [];
    if (postPlatforms) {
      const updatePromises = postPlatforms
        .filter((pp) => {
          // Must have video ID and be uploaded/published
          if (!pp.platform_video_id || (pp.status !== 'uploaded' && pp.status !== 'published')) {
            return false;
          }
          // If platforms array is provided, only update selected platforms
          if (selectedPlatforms.length > 0) {
            return selectedPlatforms.includes(pp.platform as Platform);
          }
          // If no platforms specified, update all (backward compatibility)
          return true;
        })
        .map(async (pp) => {
          try {
            switch (pp.platform as Platform) {
              case 'youtube':
                await updateYouTubeVideoMetadata(
                  user.id,
                  pp.platform_video_id,
                  {
                    title,
                    description,
                    tags: skipYouTubeTags ? undefined : tagsArray,
                    categoryId: youtubeCategoryId || post.youtube_category_id || undefined,
                    skipTags: skipYouTubeTags || false,
                  }
                );
                break;
              case 'facebook':
                await updateFacebookVideoMetadata(
                  user.id,
                  pp.platform_video_id,
                  {
                    title,
                    description,
                  }
                );
                break;
              case 'instagram':
                await updateInstagramReelMetadata(
                  user.id,
                  pp.platform_video_id,
                  {
                    description,
                  }
                );
                break;
              case 'tiktok':
                await updateTikTokVideoMetadata(
                  user.id,
                  pp.platform_video_id,
                  {
                    title,
                    description,
                  }
                );
                break;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error updating metadata for ${pp.platform}:`, error);
            
            // Check if it's a scope/permission error
            if (errorMessage.includes('insufficient authentication scopes') || 
                errorMessage.includes('insufficientPermissions') ||
                errorMessage.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
              platformUpdateErrors.push(
                `${pp.platform}: Permission error - please disconnect and reconnect your ${pp.platform} account to get updated permissions`
              );
            } else if (errorMessage.includes('does not currently support updating')) {
              // For platforms that don't support updates (like TikTok), just warn
              platformUpdateErrors.push(
                `${pp.platform}: ${errorMessage}`
              );
            } else {
              platformUpdateErrors.push(`${pp.platform}: ${errorMessage}`);
            }
            // Don't fail the entire request if one platform fails
          }
        });

      await Promise.allSettled(updatePromises);
    }

    // Return success even if platform updates failed (database was updated)
    // Include any errors in the response so the frontend can show them
    if (platformUpdateErrors.length > 0) {
      return NextResponse.json({
        success: true,
        warning: 'Metadata updated in database, but some platforms could not be updated',
        errors: platformUpdateErrors,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update metadata';
    console.error('Update metadata error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

