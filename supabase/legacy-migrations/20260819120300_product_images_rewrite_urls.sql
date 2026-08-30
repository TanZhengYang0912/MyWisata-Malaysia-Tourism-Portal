BEGIN;

UPDATE products
SET cover_url = regexp_replace(cover_url, '^/assets/customer/products/', '')
WHERE cover_url LIKE '/assets/customer/products/%';

UPDATE products
SET cover_url = regexp_replace(cover_url, '^/assets/customer/', '')
WHERE cover_url LIKE '/assets/customer/%';

COMMIT;
