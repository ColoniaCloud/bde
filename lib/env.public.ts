import { z } from 'zod';

/**
 * Configuración pública, incrustada en el bundle del navegador durante el build.
 *
 * Estas dos son obligatorias: sin ellas `createClient()` falla al cargar el
 * módulo y la tienda queda en blanco. Es preferible que rompa el build, con un
 * mensaje que diga qué falta, a que rompa en producción.
 *
 * Next.js reemplaza `process.env.NEXT_PUBLIC_*` literalmente al compilar, así
 * que hay que nombrarlas una por una — un `process.env` dinámico no se sustituye.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: 'falta NEXT_PUBLIC_SUPABASE_URL (la URL del proyecto de Supabase)',
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, {
    error: 'falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (la clave publicable de Supabase)',
  }),
});

const result = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!result.success) {
  const detail = result.error.issues.map((issue) => `  ${issue.message}`).join('\n');
  throw new Error(`Configuración pública inválida:\n${detail}\n\nRevisá .env.example.`);
}

export const publicEnv = result.data;
