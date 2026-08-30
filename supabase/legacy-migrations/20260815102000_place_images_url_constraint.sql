ALTER TABLE places ADD CONSTRAINT places_image_url_relative
  CHECK (image_url IS NULL OR (image_url NOT LIKE '/%' AND image_url NOT LIKE 'http%'));
