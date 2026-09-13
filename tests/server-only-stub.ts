// `server-only` existe para que el bundler falle si un módulo de servidor se
// cuela en el bundle del cliente. Bajo Vitest no hay bundle de cliente, así que
// se reemplaza por este módulo vacío. La protección real sigue activa en el build.
export {};
