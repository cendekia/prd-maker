// No-op stand-in for `server-only` / `client-only` in the test environment.
// Those packages throw when imported outside their intended runtime; the
// modules under test import them only as a build-time guard.
export {};
