import { createClient } from '@/lib/supabase/server';
import {
  exchangeFacebookCodeForTokens,
  saveFacebookConnection,
} from '@/lib/platforms/facebook';
import { saveInstagramConnection } from '@/lib/platforms/instagram';
import { NextResponse } from 'next/server';

// Instagram uses Facebook OAuth, so we save both connections
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
    const tokens = await exchangeFacebookCodeForTokens(code);
    // Save both Facebook and Instagram connections
    await saveFacebookConnection(
      user.id,
      tokens.access_token,
      tokens.expires_in
    );
    await saveInstagramConnection(
      user.id,
      tokens.access_token,
      tokens.expires_in
    );

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=instagram_connected`
    );
  } catch (err) {
    console.error('Instagram OAuth error:', err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=instagram_oauth_failed`
    );
  }
}

