-- Create storage bucket for model images
INSERT INTO storage.buckets (id, name, public)
VALUES ('model-images', 'model-images', true);

-- Create policy for authenticated users to upload images
CREATE POLICY "Authenticated users can upload model images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'model-images' AND 
  auth.role() = 'authenticated'
);

-- Create policy for authenticated users to view images
CREATE POLICY "Authenticated users can view model images" ON storage.objects
FOR SELECT USING (
  bucket_id = 'model-images' AND 
  auth.role() = 'authenticated'
);

-- Create policy for users to delete their own images
CREATE POLICY "Users can delete their own model images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'model-images' AND 
  auth.role() = 'authenticated' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
