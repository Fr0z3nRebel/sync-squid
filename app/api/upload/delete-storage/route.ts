import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Delete video from Supabase Storage
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
    const { filePath } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing file path' },
        { status: 400 }
      );
    }

    // Verify the file belongs to the user
    if (!filePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this file' },
        { status: 403 }
      );
    }

    // Delete the file
    const { error: deleteError } = await supabase.storage
      .from('videos')
      .remove([filePath]);

    if (deleteError) {
      console.error('Error deleting video from storage:', deleteError);
      return NextResponse.json(
        { error: `Failed to delete video: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Video deleted from storage',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete video';
    console.error('Delete storage error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

