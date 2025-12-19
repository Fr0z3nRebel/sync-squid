import { createClient } from '@/lib/supabase/server';
import { getValidFacebookAccessToken } from '@/lib/platforms/facebook';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let accessToken: string;
    try {
      accessToken = await getValidFacebookAccessToken(user.id);
    } catch (error) {
      console.error('Failed to get Facebook access token:', error);
      return NextResponse.json(
        { error: 'Facebook account not connected. Please reconnect your Facebook account.' },
        { status: 401 }
      );
    }

    // First, verify the token works by checking /me endpoint
    try {
      const meResponse = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${accessToken}&fields=id,name`
      );
      if (!meResponse.ok) {
        const errorText = await meResponse.text();
        console.error('Token validation failed:', errorText);
        return NextResponse.json(
          { error: 'Invalid access token. Please reconnect your Facebook account.' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error('Error validating token:', error);
      return NextResponse.json(
        { error: 'Failed to validate Facebook access token' },
        { status: 500 }
      );
    }

    // Fetch user's Facebook pages with pagination to get all pages
    let allPages: any[] = [];
    
    // First, try the standard /me/accounts endpoint
    let nextUrl: string | null = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,category,picture,tasks,access_token&limit=100`;

    while (nextUrl) {
      const pagesResponse: Response = await fetch(nextUrl);

      if (!pagesResponse.ok) {
        const errorText = await pagesResponse.text();
        
        // If it's a 401, the token might be invalid
        if (pagesResponse.status === 401) {
          return NextResponse.json(
            { error: 'Facebook access token expired. Please reconnect your Facebook account.' },
            { status: 401 }
          );
        }
        
        throw new Error(`Failed to fetch pages: ${errorText}`);
      }

      const pagesData = await pagesResponse.json();
      
      // Check for Facebook API errors in the response
      if (pagesData.error) {
        console.error('Facebook API error:', pagesData.error);
        return NextResponse.json(
          { error: `Facebook API error: ${pagesData.error.message || JSON.stringify(pagesData.error)}` },
          { status: 500 }
        );
      }
      
      if (pagesData.data && Array.isArray(pagesData.data)) {
        allPages = [...allPages, ...pagesData.data];
      }

      // Check for pagination
      if (pagesData.paging && pagesData.paging.next) {
        nextUrl = pagesData.paging.next;
      } else {
        nextUrl = null;
      }
    }

    // Also try to get business accounts (for Business Profiles)
    try {
      const businessResponse: Response = await fetch(
        `https://graph.facebook.com/v18.0/me/businesses?access_token=${accessToken}&fields=id,name`
      );
      
      if (businessResponse.ok) {
        const businessData = await businessResponse.json();
        
        if (!businessData.error && businessData.data && Array.isArray(businessData.data)) {
          // For each business, try to get its pages
          for (const business of businessData.data) {
            try {
              const businessPagesResponse: Response = await fetch(
                `https://graph.facebook.com/v18.0/${business.id}/owned_pages?access_token=${accessToken}&fields=id,name,category,picture`
              );
              
              if (businessPagesResponse.ok) {
                const businessPagesData = await businessPagesResponse.json();
                if (businessPagesData.data && Array.isArray(businessPagesData.data)) {
                  // Merge pages, avoiding duplicates
                  businessPagesData.data.forEach((page: any) => {
                    if (!allPages.some(p => p.id === page.id)) {
                      allPages.push(page);
                    }
                  });
                }
              }
            } catch (err) {
              console.error(`Error fetching pages for business ${business.id}:`, err);
            }
          }
        }
      }
    } catch (businessError) {
      console.error('Error fetching business accounts:', businessError);
      // Continue even if business accounts fail
    }

    // Also try /{user-id}/accounts as an alternative endpoint
    if (allPages.length === 0) {
      try {
        const meResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${accessToken}&fields=id`
        );
        if (meResponse.ok) {
          const meData = await meResponse.json();
          const userId = meData.id;
          
          const userAccountsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${userId}/accounts?access_token=${accessToken}&fields=id,name,category,picture,tasks&limit=100`
          );
          
          if (userAccountsResponse.ok) {
            const userAccountsData = await userAccountsResponse.json();
            
            if (userAccountsData.data && Array.isArray(userAccountsData.data)) {
              allPages = [...allPages, ...userAccountsData.data];
            }
          }
        }
      } catch (err) {
        console.error('Error trying /{user-id}/accounts:', err);
      }
    }

    return NextResponse.json({
      pages: allPages,
      total: allPages.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch pages';
    console.error('Error fetching Facebook pages:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

