import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Upload video to Supabase Storage
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

    if (!videoFile || !postId) {
      return NextResponse.json(
        { error: 'Missing video file or post ID' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExt = videoFile.name.split('.').pop();
    const fileName = `${postId}-${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filePath, videoFile, {
        contentType: videoFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload to storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filePath,
      fileName,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to upload to storage';
    console.error('Storage upload error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

