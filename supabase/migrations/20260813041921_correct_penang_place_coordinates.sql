-- Correct places.lat/lng against OpenStreetMap and fix two wrong entry fees.
-- See docs/plans/2026-08-13-1109-penang-real-business-reseed.md Task 2.
--
-- The Phase 3 seed's coordinates were hand-estimated. Nominatim lookups done
-- while sourcing real business addresses (2026-08-13) show drifts up to 3.6 km.
-- Every "nearby business" result is a haversine calculation against these
-- points, so the errors are load-bearing, not cosmetic.
--
-- Addressed by slug, not id, so this reads as data rather than hashes.
-- Not corrected: penang, george-town, batu-ferringhi-beach,
-- batu-ferringhi-night-market, balik-pulau-durian-orchards — no better-sourced
-- value exists. Batu Ferringhi Night Market in particular is a street market
-- along Jalan Batu Feringgi with no OSM node.

UPDATE places SET lat = 5.424576, lng = 100.268983 WHERE slug = 'penang-hill';                 -- Bukit Bendera
UPDATE places SET lat = 5.438148, lng = 100.291010 WHERE slug = 'penang-botanic-gardens';      -- Penang Botanic Gardens
UPDATE places SET lat = 5.452479, lng = 100.185263 WHERE slug = 'meromictic-lake';             -- Meromictic Lake, Pantai Acheh
UPDATE places SET lat = 5.471075, lng = 100.187059 WHERE slug = 'monkey-beach-trail';          -- Monkey Beach, Pantai Acheh
UPDATE places SET lat = 5.417792, lng = 100.341129 WHERE slug = 'pinang-peranakan-mansion';    -- 29 Lebuh Gereja
UPDATE places SET lat = 5.415775, lng = 100.336430 WHERE slug = 'armenian-street-murals';      -- Lebuh Armenian
UPDATE places SET lat = 5.411966, lng = 100.340031 WHERE slug = 'chew-jetty';                  -- Chew Jetty
UPDATE places SET lat = 5.399721, lng = 100.273889 WHERE slug = 'kek-lok-si-temple';           -- Kek Lok Si Temple
UPDATE places SET lat = 5.414265, lng = 100.337592 WHERE slug = 'khoo-kongsi';                 -- Leong San Tong Khoo Kongsi
UPDATE places SET lat = 5.406356, lng = 100.282732 WHERE slug = 'air-itam';                    -- Ayer Itam
UPDATE places SET lat = 5.457815, lng = 100.214746 WHERE slug = 'teluk-bahang';                -- Teluk Bahang
UPDATE places SET lat = 5.351084, lng = 100.235333 WHERE slug = 'balik-pulau';                 -- Balik Pulau
UPDATE places SET lat = 5.470886, lng = 100.248589 WHERE slug = 'batu-ferringhi';              -- Batu Feringgi

-- Entry fees: both were non-Malaysian or simply wrong. MyKad adult rates.
-- Penang Hill: RM16 return (penanghill.gov.my/en/tickets). Seed said 30.
-- Pinang Peranakan Mansion: RM20 adult. Seed said 25.
UPDATE places SET entry_fee = 16.00 WHERE slug = 'penang-hill';
UPDATE places SET entry_fee = 20.00 WHERE slug = 'pinang-peranakan-mansion';

DO $$
DECLARE v_uncorrected integer;
BEGIN
  SELECT count(*) INTO v_uncorrected FROM places
  WHERE (slug = 'penang-hill' AND (lat, lng) IS DISTINCT FROM (5.424576, 100.268983))
     OR (slug = 'penang-botanic-gardens' AND (lat, lng) IS DISTINCT FROM (5.438148, 100.291010))
     OR (slug = 'meromictic-lake' AND (lat, lng) IS DISTINCT FROM (5.452479, 100.185263))
     OR (slug = 'monkey-beach-trail' AND (lat, lng) IS DISTINCT FROM (5.471075, 100.187059));
  IF v_uncorrected > 0 THEN
    RAISE EXCEPTION 'coordinate correction did not apply to % rows', v_uncorrected;
  END IF;
END $$;;
