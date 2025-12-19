import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { convertNaiveDateToUTC } from '@/lib/date-utils';
import type { Platform } from '@/types/database';

// This endpoint creates the post record without the video file
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
    const { title, description, tags, scheduledAt, timezone, youtubeCategoryId, platforms } = body;

    if (!title || !description || !scheduledAt || !platforms) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const selectedPlatforms: Platform[] = platforms;
    const tagArray = tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) : [];
    
    // Convert scheduled time from selected timezone to UTC
    // The scheduledAt comes as ISO string (YYYY-MM-DDTHH:mm:ss), we need to interpret it in the selected timezone
    const selectedTimezone = timezone || 'UTC';
    let scheduledDate: Date;
    
    if (selectedTimezone && selectedTimezone !== 'UTC') {
      // Use our utility function to properly convert from the selected timezone to UTC
      scheduledDate = convertNaiveDateToUTC(scheduledAt, selectedTimezone);
    } else {
      // If UTC or no timezone, parse as UTC
      scheduledDate = new Date(scheduledAt);
    }

    // Create scheduled post record
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id: user.id,
        title,
        description,
        tags: tagArray,
        scheduled_at: scheduledDate.toISOString(),
        timezone: timezone || 'UTC',
        youtube_category_id: youtubeCategoryId || null,
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

    return NextResponse.json({
      success: true,
      postId: post.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create post';
    console.error('Create post error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

