import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rjnfjoctbbfzreygfwgv.supabase.co';
const supabasePublishableKey = 'sb_publishable_dO0MxuqFc6daS2sKCDJOjg_Lpi-8rYy';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
