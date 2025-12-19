import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Cleanup orphaned videos older than 24 hours
// This can be called via a cron job or manually
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all files in the user's video folder
    const { data: files, error: listError } = await supabase.storage
      .from('videos')
      .list(`${user.id}`, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (listError) {
      console.error('Error listing files:', listError);
      return NextResponse.json(
        { error: 'Failed to list files' },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'No files to clean up',
      });
    }

    // Filter files older than 24 hours
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const filesToDelete = files
      .filter((file) => {
        const fileDate = new Date(file.created_at).getTime();
        return fileDate < oneDayAgo;
      })
      .map((file) => `${user.id}/${file.name}`);

    if (filesToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: 'No old files to clean up',
      });
    }

    // Delete old files
    const { error: deleteError } = await supabase.storage
      .from('videos')
      .remove(filesToDelete);

    if (deleteError) {
      console.error('Error deleting files:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete files' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: filesToDelete.length,
      files: filesToDelete,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Cleanup failed';
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

