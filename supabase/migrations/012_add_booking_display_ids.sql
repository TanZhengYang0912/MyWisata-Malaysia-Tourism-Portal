-- 1. Add display_id column to bookings table
ALTER TABLE bookings ADD COLUMN display_id VARCHAR(20) UNIQUE;

-- 2. Create sequences starting at 1000
CREATE SEQUENCE IF NOT EXISTS bookings_display_seq START 1000;

-- 3. Trigger Function: Generate Booking Display ID (e.g. BK-1000)
CREATE OR REPLACE FUNCTION generate_booking_display_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.display_id := 'BK-' || nextval('bookings_display_seq')::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger
CREATE TRIGGER set_booking_display_id
    BEFORE INSERT ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION generate_booking_display_id();

-- 5. Backfill existing records with IDs
UPDATE bookings SET display_id = 'BK-' || nextval('bookings_display_seq')::TEXT WHERE display_id IS NULL;

-- 6. Enforce NOT NULL constraint safely after backfill
ALTER TABLE bookings ALTER COLUMN display_id SET NOT NULL;
