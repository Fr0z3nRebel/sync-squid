import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { updateYouTubeVideoSchedule } from '@/lib/platforms/youtube';
import { convertNaiveDateToUTC } from '@/lib/date-utils';

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
    const { scheduledAt, timezone } = body;

    if (!scheduledAt) {
      return NextResponse.json(
        { error: 'Missing scheduledAt' },
        { status: 400 }
      );
    }

    // Verify the post belongs to the user and get timezone
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .select('id, status, timezone')
      .eq('id', postId)
      .eq('user_id', user.id)
      .single();

    if (postError || !post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    // Only allow editing if post is pending or uploading
    if (post.status !== 'pending' && post.status !== 'uploading') {
      return NextResponse.json(
        { error: 'Cannot edit schedule for published or failed posts' },
        { status: 400 }
      );
    }

    // Convert scheduled time from selected timezone to UTC (same logic as create)
    const selectedTimezone = timezone || post.timezone || 'UTC';
    let scheduledDate: Date;
    
    if (selectedTimezone && selectedTimezone !== 'UTC') {
      scheduledDate = convertNaiveDateToUTC(scheduledAt, selectedTimezone);
    } else {
      scheduledDate = new Date(scheduledAt);
    }

    const now = new Date();
    if (scheduledDate <= now) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
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

    // Update the scheduled_at time in database
    const { error: updateError } = await supabase
      .from('scheduled_posts')
      .update({ 
        scheduled_at: scheduledDate.toISOString(),
        timezone: selectedTimezone,
      })
      .eq('id', postId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating schedule:', updateError);
      return NextResponse.json(
        { error: 'Failed to update schedule' },
        { status: 500 }
      );
    }

    // Update scheduled time on platforms where videos are already uploaded
    const platformUpdateErrors: string[] = [];
    if (postPlatforms) {
      const updatePromises = postPlatforms
        .filter((pp) => pp.platform_video_id && pp.status === 'uploaded')
        .map(async (pp) => {
          try {
            switch (pp.platform) {
              case 'youtube':
                await updateYouTubeVideoSchedule(
                  user.id,
                  pp.platform_video_id,
                  scheduledDate
                );
                break;
              // Facebook, Instagram, and TikTok don't support rescheduling via API
              // They would need to be deleted and re-uploaded, which is not ideal
              case 'facebook':
              case 'instagram':
              case 'tiktok':
                console.warn(
                  `Rescheduling not supported for ${pp.platform}. Video will publish at original time.`
                );
                break;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error updating schedule for ${pp.platform}:`, error);
            
            // Check if it's a scope/permission error
            if (errorMessage.includes('insufficient authentication scopes') || 
                errorMessage.includes('insufficientPermissions') ||
                errorMessage.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
              platformUpdateErrors.push(
                `${pp.platform}: Permission error - please disconnect and reconnect your ${pp.platform} account to get updated permissions`
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
        warning: 'Schedule updated in database, but some platforms could not be updated',
        errors: platformUpdateErrors,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update schedule';
    console.error('Update schedule error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

