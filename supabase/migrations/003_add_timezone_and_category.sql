-- Add timezone and category fields to scheduled_posts
ALTER TABLE scheduled_posts
  ADD COLUMN timezone TEXT DEFAULT 'UTC',
  ADD COLUMN youtube_category_id TEXT,
  ADD COLUMN youtube_category_type TEXT;

-- Add comment for documentation
COMMENT ON COLUMN scheduled_posts.timezone IS 'IANA timezone identifier (e.g., America/New_York)';
COMMENT ON COLUMN scheduled_posts.youtube_category_id IS 'YouTube category ID (e.g., 27 for Education)';
COMMENT ON COLUMN scheduled_posts.youtube_category_type IS 'YouTube category type/subcategory (e.g., Concept Overview)';

