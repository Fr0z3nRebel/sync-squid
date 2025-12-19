export type Platform = 'youtube' | 'tiktok' | 'facebook' | 'instagram';

export type PostStatus = 'pending' | 'uploading' | 'published' | 'failed';

export type PlatformPostStatus =
  | 'pending'
  | 'uploaded'
  | 'published'
  | 'failed';

export interface PlatformConnection {
  id: string;
  user_id: string;
  platform: Platform;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  platform_user_id: string | null;
  created_at: string;
}

export interface ScheduledPost {
  id: string;
  user_id: string;
  title: string;
  description: string;
  tags: string[];
  scheduled_at: string;
  created_at: string;
  status: PostStatus;
  timezone?: string | null;
  youtube_category_id?: string | null;
  youtube_category_type?: string | null;
}

export interface PostPlatform {
  id: string;
  post_id: string;
  platform: Platform;
  platform_video_id: string | null;
  thumbnail_url: string | null;
  status: PlatformPostStatus;
  error_message: string | null;
  uploaded_at: string | null;
}

