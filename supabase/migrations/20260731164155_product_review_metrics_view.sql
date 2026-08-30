DROP VIEW IF EXISTS product_review_metrics;
CREATE VIEW product_review_metrics AS
SELECT
  product_id,
  ROUND(AVG(rating)::NUMERIC, 1) AS rating,
  COUNT(*)                       AS reviews
FROM reviews
WHERE is_visible = true
GROUP BY product_id;

ALTER VIEW product_review_metrics OWNER TO postgres;

GRANT SELECT ON product_review_metrics TO authenticated, anon;;
