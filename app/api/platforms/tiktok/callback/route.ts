import { createClient } from '@/lib/supabase/server';
import {
  exchangeTikTokCodeForTokens,
  saveTikTokConnection,
} from '@/lib/platforms/tiktok';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=unauthorized`
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=${error}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=no_code`
    );
  }

  try {
    const tokens = await exchangeTikTokCodeForTokens(code);
    await saveTikTokConnection(
      user.id,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=tiktok_connected`
    );
  } catch (err) {
    console.error('TikTok OAuth error:', err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=tiktok_oauth_failed`
    );
  }
}

