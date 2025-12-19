'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from './ToastProvider';

export default function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success) {
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
      const params = new URLSearchParams(searchParams.toString());
      params.delete('success');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl);
    }

    if (error) {
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
      const params = new URLSearchParams(searchParams.toString());
      params.delete('error');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}

