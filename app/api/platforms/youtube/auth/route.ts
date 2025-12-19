import { createClient } from '@/lib/supabase/server';
import { getYouTubeAuthUrl } from '@/lib/platforms/youtube';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authUrl = getYouTubeAuthUrl(user.id);
  return NextResponse.redirect(authUrl);
}

