ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.send_welcome_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_welcome_message TEXT;
  v_welcome_enabled BOOLEAN;
BEGIN
  SELECT v.owner_id, o.welcome_message, o.welcome_enabled
    INTO v_owner_id, v_welcome_message, v_welcome_enabled
  FROM public.outlets o
  JOIN public.vendors v ON v.id = o.vendor_id
  WHERE o.id = NEW.outlet_id;

  IF v_owner_id IS NOT NULL AND v_welcome_enabled THEN
    INSERT INTO public.chat_messages (thread_id, sender_id, body)
    VALUES (
      NEW.id,
      v_owner_id,
      COALESCE(NULLIF(TRIM(v_welcome_message), ''), 'Welcome! Thanks for your interest. Any questions?')
    );

    UPDATE public.chat_threads
       SET last_message_at = NOW()
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;;
