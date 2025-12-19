-- Create storage bucket for videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  false,
  5368709120, -- 5GB limit
  ARRAY['video/mp4', 'video/mov', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the videos bucket
-- Users can only upload their own videos
CREATE POLICY "Users can upload their own videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own videos
CREATE POLICY "Users can read their own videos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own videos
CREATE POLICY "Users can delete their own videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can manage all videos (for cleanup)
CREATE POLICY "Service role can manage all videos"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'videos')
WITH CHECK (bucket_id = 'videos');

