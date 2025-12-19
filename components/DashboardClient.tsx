'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './ToastProvider';

export default function DashboardClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Use window.location.search to avoid enumeration issues with useSearchParams
    const searchParams = new URLSearchParams(window.location.search);
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    // Only process once per mount to avoid re-triggering
    if (hasProcessedRef.current) return;
    
    if (success) {
      hasProcessedRef.current = true;
      if (success === 'youtube_connected') {
        showToast('YouTube account connected successfully!', 'success');
      } else if (success === 'facebook_connected') {
        showToast('Facebook account connected successfully!', 'success');
      } else if (success === 'instagram_connected') {
        showToast('Instagram account connected successfully!', 'success');
      } else if (success === 'tiktok_connected') {
        showToast('TikTok account connected successfully!', 'success');
      } else if (success === 'uploaded') {
        showToast('Video uploaded and scheduled successfully!', 'success');
      }
      
      // Clear the success parameter from URL to prevent re-triggering on re-renders
      const params = new URLSearchParams(searchParams);
      params.delete('success');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl);
    }

    if (error) {
      hasProcessedRef.current = true;
      if (error === 'youtube_oauth_failed') {
        showToast('Failed to connect YouTube account', 'error');
      } else if (error === 'facebook_oauth_failed') {
        showToast('Failed to connect Facebook account', 'error');
      } else if (error === 'instagram_oauth_failed') {
        showToast('Failed to connect Instagram account', 'error');
      } else if (error === 'tiktok_oauth_failed') {
        showToast('Failed to connect TikTok account', 'error');
      } else {
        showToast('An error occurred', 'error');
      }
      
      // Clear the error parameter from URL to prevent re-triggering on re-renders
      const params = new URLSearchParams(searchParams);
      params.delete('error');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl);
    }
  }, [router, showToast]);

  return null;
}

