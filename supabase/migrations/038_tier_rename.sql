-- P4: CLAUDE-QUICKWINS.md Item 2, Part A — rename the affiliate commission
-- tiers to match the spec's naming (§10.2.5). Label-only: rates and
-- min_conversions thresholds are untouched. Changing those is a shared
-- config decision flagged separately for the reward-system owner, not done
-- here (see the report note in CLAUDE-QUICKWINS.md).
--
-- Scoped to rule_type='affiliate' AND is_active=true specifically so this
-- never touches the dormant is_active=false 'standard' row left over from
-- the pre-tier flat-rate system (migration 011) — that row already
-- coincidentally shares the new 'standard' name post-rename, which is
-- harmless (getActiveTiers() only ever selects is_active=true rows, and
-- tier_name has no uniqueness constraint), but scoping the UPDATE this
-- tightly avoids any ambiguity about which row is being touched.

UPDATE commission_rules
SET tier_name = 'standard'
WHERE rule_type = 'affiliate' AND is_active = true AND tier_name = 'bronze';

UPDATE commission_rules
SET tier_name = 'active'
WHERE rule_type = 'affiliate' AND is_active = true AND tier_name = 'silver';

UPDATE commission_rules
SET tier_name = 'top'
WHERE rule_type = 'affiliate' AND is_active = true AND tier_name = 'gold';
