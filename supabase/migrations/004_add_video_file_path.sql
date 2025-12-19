-- Add video_file_path to scheduled_posts to enable retry functionality
ALTER TABLE scheduled_posts
ADD COLUMN video_file_path TEXT;

-- Add index for video_file_path lookups
CREATE INDEX idx_scheduled_posts_video_file_path ON scheduled_posts(video_file_path) WHERE video_file_path IS NOT NULL;

