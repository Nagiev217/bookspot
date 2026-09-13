// ╔════════════════════════════════════════════════════════════════╗
// ║  КАК НАСТРОИТЬ SUPABASE (одноразово)                            ║
// ║  1. https://supabase.com/dashboard → New project                ║
// ║  2. Region — ближайший к Баку (Frankfurt / eu-central-1)        ║
// ║  3. Project Settings → API → скопируй Project URL и anon key    ║
// ║     в apps/mobile/.env (см. .env.example)                       ║
// ║  4. Authentication → Providers → Email — включён по умолчанию   ║
// ║  5. npx supabase link --project-ref <ref> && npx supabase db push║
// ╚════════════════════════════════════════════════════════════════╝

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const IS_SUPABASE_READY = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = IS_SUPABASE_READY
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (!IS_SUPABASE_READY && __DEV__) {
  console.warn('Supabase не настроен: заполните apps/mobile/.env по образцу .env.example');
}
