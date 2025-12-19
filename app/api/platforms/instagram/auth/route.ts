import { createClient } from '@/lib/supabase/server';
import { getFacebookAuthUrl } from '@/lib/platforms/facebook';
import { NextResponse } from 'next/server';

// Instagram uses Facebook OAuth
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authUrl = getFacebookAuthUrl(user.id);
  return NextResponse.redirect(authUrl);
}

