ALTER TABLE hook_listings ADD COLUMN images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE hook_listings ADD CONSTRAINT hook_images_array CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 3);
