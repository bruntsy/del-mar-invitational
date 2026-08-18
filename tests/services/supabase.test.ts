import { describe, expect, it } from 'vitest';
import { hasSupabase, supabase } from '@/services/supabase';

describe('supabase client', () => {
  it('hasSupabase() tracks whether the client was constructed', () => {
    expect(hasSupabase()).toBe(supabase !== null);
  });

  it('is configured when VITE_SUPABASE_* env vars are present', () => {
    const configured = Boolean(
      import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
    expect(hasSupabase()).toBe(configured);
  });
});
