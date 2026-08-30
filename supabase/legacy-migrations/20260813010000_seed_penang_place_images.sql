-- Penang place imagery — see
-- docs/plans/2026-08-13-0006-place-page-listing-filters-and-imagery.md Phase 6.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA, same provisional footing
-- as public/assets/customer/malaysia/ (see lib/customer/malaysia-destinations.ts):
-- an initial real-photo set, to be replaced with approved production assets
-- once photo licensing is confirmed. Attribution per file:
--
--   george-town.webp              Beach Street, George Town 01.jpg — CC0
--   air-itam.webp                 Cmglee Penang Air Itam dam.jpg — CC BY-SA 4.0 — Cmglee
--   batu-ferringhi.webp           Malaysia - 067 - Penang - Rasa Sayang Resorts fantastic grounds (3922991958).jpg — CC BY 2.0
--   teluk-bahang.webp             Teluk Bahang coast in George Town, Penang.jpg — CC BY-SA 4.0
--   balik-pulau.webp              Balik pulau aerial May 2025.jpg — CC BY-SA 4.0
--   armenian-street-murals.webp   Penang - Little Children on a Bicycle.JPG — CC BY-SA 3.0
--   chew-jetty.webp               Chew Jetty, Georgetown, Penang, Malaysia (5257132429).jpg — CC BY 2.0
--   khoo-kongsi.webp              Khoo Kongsi (I).jpg — CC BY 4.0
--   pinang-peranakan-mansion.webp Pinang Peranakan Mansion, George Town, Penang.jpg — CC BY-SA 4.0
--   kek-lok-si-temple.webp        Penang Malaysia Kek-Lok-Si-Temple-01.jpg — CC BY-SA 3.0
--   penang-hill.webp              Penang Hill Funicular Railway - panoramio.jpg — CC BY-SA 3.0
--   batu-ferringhi-beach.webp     33 Batu Ferringhi beach, Penang, Malaysia.jpg — CC BY 3.0
--   monkey-beach-trail.webp       Monkeybeach08.jpg — CC BY-SA 3.0
--   penang-botanic-gardens.webp   Penang Botanic Gardens.jpg — CC BY-SA 4.0
--
-- No usable Commons photo was found for these three — they keep image_url
-- NULL and fall back to the initial-letter colour block in PlaceCard:
--   batu-ferringhi-night-market, meromictic-lake, balik-pulau-durian-orchards

UPDATE places SET image_url = '/assets/customer/penang/george-town.webp' WHERE slug = 'george-town';
UPDATE places SET image_url = '/assets/customer/penang/air-itam.webp' WHERE slug = 'air-itam';
UPDATE places SET image_url = '/assets/customer/penang/batu-ferringhi.webp' WHERE slug = 'batu-ferringhi';
UPDATE places SET image_url = '/assets/customer/penang/teluk-bahang.webp' WHERE slug = 'teluk-bahang';
UPDATE places SET image_url = '/assets/customer/penang/balik-pulau.webp' WHERE slug = 'balik-pulau';

UPDATE places SET image_url = '/assets/customer/penang/armenian-street-murals.webp' WHERE slug = 'armenian-street-murals';
UPDATE places SET image_url = '/assets/customer/penang/chew-jetty.webp' WHERE slug = 'chew-jetty';
UPDATE places SET image_url = '/assets/customer/penang/khoo-kongsi.webp' WHERE slug = 'khoo-kongsi';
UPDATE places SET image_url = '/assets/customer/penang/pinang-peranakan-mansion.webp' WHERE slug = 'pinang-peranakan-mansion';
UPDATE places SET image_url = '/assets/customer/penang/kek-lok-si-temple.webp' WHERE slug = 'kek-lok-si-temple';
UPDATE places SET image_url = '/assets/customer/penang/penang-hill.webp' WHERE slug = 'penang-hill';
UPDATE places SET image_url = '/assets/customer/penang/batu-ferringhi-beach.webp' WHERE slug = 'batu-ferringhi-beach';
UPDATE places SET image_url = '/assets/customer/penang/monkey-beach-trail.webp' WHERE slug = 'monkey-beach-trail';
UPDATE places SET image_url = '/assets/customer/penang/penang-botanic-gardens.webp' WHERE slug = 'penang-botanic-gardens';
