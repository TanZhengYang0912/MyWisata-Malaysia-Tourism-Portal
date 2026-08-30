-- ============================================================
-- 20260801000000_product_review_metrics_view.sql
--
-- 修复 docs/qa-report-2026-07-31.md 的 M8。
--
-- getActivities() 原本用没有 .range() 的 .in() 把全部可见评价抓进记忆体再平均。
-- PostgREST 对无上限回应静默截断在 1000 笔，而 reviews 表有 2054 笔可见资料 ——
-- 所以全站星等都是用一半资料算的，且不会报错。
--
-- 这个 view 把聚合移到资料库端：每个商品固定一列，不受列数上限影响。
-- rating 的四舍五入刻意与原本 aggregateReviewMetrics()
-- （Math.round(avg * 10) / 10）一致，避免修复本身造成数值位移。
-- ============================================================

DROP VIEW IF EXISTS product_review_metrics;
CREATE VIEW product_review_metrics AS
SELECT
  product_id,
  ROUND(AVG(rating)::NUMERIC, 1) AS rating,
  COUNT(*)                       AS reviews
FROM reviews
WHERE is_visible = true
GROUP BY product_id;

-- 与 030_public_user_view.sql 相同的授权模式。
ALTER VIEW product_review_metrics OWNER TO postgres;

GRANT SELECT ON product_review_metrics TO authenticated, anon;
