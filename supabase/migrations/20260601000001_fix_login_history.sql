CREATE OR REPLACE FUNCTION public.handle_login_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

BEGIN

    -- 1. Insert the brand new login session
    INSERT INTO public.login_history (user_id, ip_address, user_agent, login_at)
    VALUES (
        NEW.user_id,
        COALESCE(NEW.ip::text, 'Unknown'),
        COALESCE(NEW.user_agent, 'Unknown'),
        NEW.created_at
    );

    -- 2. Automatically delete everything except the 5 most recent entries for this user
    DELETE FROM public.login_history
    WHERE user_id = NEW.user_id
      AND id NOT IN (
          SELECT id 
          FROM public.login_history 
          WHERE user_id = NEW.user_id
          ORDER BY login_at DESC
          LIMIT 5
      );

    RETURN NEW;

END;

$$;