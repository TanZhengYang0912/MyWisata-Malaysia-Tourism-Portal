-- 1. Add display_id column to tables
ALTER TABLE products ADD COLUMN display_id VARCHAR(20) UNIQUE;
ALTER TABLE outlets ADD COLUMN display_id VARCHAR(20) UNIQUE;
ALTER TABLE orders ADD COLUMN display_id VARCHAR(20) UNIQUE;

-- 2. Create sequences starting at 1000
CREATE SEQUENCE IF NOT EXISTS products_display_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS outlets_display_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS orders_display_seq START 1000;

-- 3. Trigger Function: Generate Product Display ID (e.g. FD-1001)
CREATE OR REPLACE FUNCTION generate_product_display_id()
RETURNS TRIGGER AS $$
DECLARE
    prefix VARCHAR(5);
BEGIN
    IF NEW.product_type = 'food' THEN prefix := 'FD';
    ELSIF NEW.product_type = 'activity' THEN prefix := 'AC';
    ELSIF NEW.product_type = 'experience' THEN prefix := 'EX';
    ELSIF NEW.product_type = 'product' THEN prefix := 'PR';
    ELSE prefix := 'IT';
    END IF;
    
    NEW.display_id := prefix || '-' || nextval('products_display_seq')::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger Function: Generate Outlet Display ID (e.g. OUT-1001)
CREATE OR REPLACE FUNCTION generate_outlet_display_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.display_id := 'OUT-' || nextval('outlets_display_seq')::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger Function: Generate Order Display ID (e.g. ORD-1001)
CREATE OR REPLACE FUNCTION generate_order_display_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.display_id := 'ORD-' || nextval('orders_display_seq')::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach triggers to tables
CREATE TRIGGER set_product_display_id
    BEFORE INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION generate_product_display_id();

CREATE TRIGGER set_outlet_display_id
    BEFORE INSERT ON outlets
    FOR EACH ROW
    EXECUTE FUNCTION generate_outlet_display_id();

CREATE TRIGGER set_order_display_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_display_id();

-- 7. Backfill existing records with IDs
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, product_type FROM products WHERE display_id IS NULL LOOP
        DECLARE prefix VARCHAR(5);
        BEGIN
            IF rec.product_type = 'food' THEN prefix := 'FD';
            ELSIF rec.product_type = 'activity' THEN prefix := 'AC';
            ELSIF rec.product_type = 'experience' THEN prefix := 'EX';
            ELSIF rec.product_type = 'product' THEN prefix := 'PR';
            ELSE prefix := 'IT';
            END IF;
            UPDATE products SET display_id = prefix || '-' || nextval('products_display_seq')::TEXT WHERE id = rec.id;
        END;
    END LOOP;
END $$;

UPDATE outlets SET display_id = 'OUT-' || nextval('outlets_display_seq')::TEXT WHERE display_id IS NULL;
UPDATE orders SET display_id = 'ORD-' || nextval('orders_display_seq')::TEXT WHERE display_id IS NULL;

-- 8. Enforce NOT NULL constraints safely after backfill
ALTER TABLE products ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE outlets ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN display_id SET NOT NULL;
