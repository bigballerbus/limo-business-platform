// Load .env for local runs (CI provides the variables directly). Node 22's
// built-in loader — no dependency required.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (e.g. CI) — variables come from the environment.
}
