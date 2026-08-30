UPDATE public.products AS p
SET cover_url = CASE p.name
  WHEN 'Craft Beer Taproom' THEN 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=82'
  WHEN 'Heritage Speakeasy' THEN 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=82'
  WHEN 'Late Night Supper Club' THEN 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=82'
  WHEN 'Live Jazz & Whisky Bar' THEN 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=82'
  WHEN 'Waterfront Live Music Bar' THEN 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=82'
END
WHERE p.status = 'active'
  AND p.review_status = 'approved'
  AND p.name IN ('Craft Beer Taproom', 'Heritage Speakeasy', 'Late Night Supper Club', 'Live Jazz & Whisky Bar', 'Waterfront Live Music Bar')
  AND p.cover_url IN (
    'https://images.unsplash.com/photo-1566417713940-fe7c17a63c96?auto=format&fit=crop&w=900&q=82',
    'https://images.unsplash.com/photo-1571266028243-d220c9a3d2cd?auto=format&fit=crop&w=900&q=82'
  );;
