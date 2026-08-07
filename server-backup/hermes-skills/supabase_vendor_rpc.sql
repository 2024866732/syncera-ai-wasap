-- Supabase RPC function for vendor alias search
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION find_vendor_by_alias(search_term TEXT)
RETURNS TABLE(id UUID, canonical_name TEXT, default_category TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.canonical_name, v.default_category
    FROM public.vendors v
    WHERE v.is_active = true
      AND (
          lower(v.canonical_name) = lower(search_term)
          OR lower(search_term) = ANY(SELECT lower(unnest(v.aliases)))
          OR EXISTS (
              SELECT 1 FROM unnest(v.aliases) alias
              WHERE lower(alias) LIKE '%' || lower(search_term) || '%'
          )
          OR lower(v.canonical_name) LIKE '%' || lower(search_term) || '%'
      )
    ORDER BY 
      CASE WHEN lower(v.canonical_name) = lower(search_term) THEN 0
           WHEN lower(search_term) = ANY(SELECT lower(unnest(v.aliases))) THEN 1
           ELSE 2 END
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;