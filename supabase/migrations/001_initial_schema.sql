-- Create enum types
CREATE TYPE platform_type AS ENUM ('youtube', 'tiktok', 'facebook', 'instagram');
CREATE TYPE post_status_type AS ENUM ('pending', 'uploading', 'published', 'failed');
CREATE TYPE platform_post_status_type AS ENUM ('pending', 'uploaded', 'published', 'failed');

-- Platform connections table
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  platform_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Scheduled posts table
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status post_status_type NOT NULL DEFAULT 'pending'
);

-- Post platforms table (junction table for posts and platforms)
CREATE TABLE post_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  platform_video_id TEXT,
  thumbnail_url TEXT,
  status platform_post_status_type NOT NULL DEFAULT 'pending',
  error_message TEXT,
  uploaded_at TIMESTAMPTZ,
  UNIQUE(post_id, platform)
);

-- Create indexes for better query performance
CREATE INDEX idx_platform_connections_user_id ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON platform_connections(platform);
CREATE INDEX idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
CREATE INDEX idx_post_platforms_post_id ON post_platforms(post_id);
CREATE INDEX idx_post_platforms_platform ON post_platforms(platform);
CREATE INDEX idx_post_platforms_status ON post_platforms(status);

-- Enable Row Level Security
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_platforms ENABLE ROW LEVEL SECURITY;

-- RLS Policies for platform_connections
CREATE POLICY "Users can view their own platform connections"
  ON platform_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own platform connections"
  ON platform_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own platform connections"
  ON platform_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform connections"
  ON platform_connections FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for scheduled_posts
CREATE POLICY "Users can view their own scheduled posts"
  ON scheduled_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled posts"
  ON scheduled_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled posts"
  ON scheduled_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled posts"
  ON scheduled_posts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for post_platforms
CREATE POLICY "Users can view their own post platforms"
  ON post_platforms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_posts
      WHERE scheduled_posts.id = post_platforms.post_id
      AND scheduled_posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own post platforms"
  ON post_platforms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scheduled_posts
      WHERE scheduled_posts.id = post_platforms.post_id
      AND scheduled_posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own post platforms"
  ON post_platforms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_posts
      WHERE scheduled_posts.id = post_platforms.post_id
      AND scheduled_posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own post platforms"
  ON post_platforms FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM scheduled_posts
      WHERE scheduled_posts.id = post_platforms.post_id
      AND scheduled_posts.user_id = auth.uid()
    )
  );

