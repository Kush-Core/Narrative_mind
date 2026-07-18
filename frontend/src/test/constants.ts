/**
 * The API origin the test suite runs against.
 *
 * Pinned in `.env.test` (committed, unlike `.env`) so the suite is hermetic: it
 * does not depend on a developer's local configuration, and the MSW handlers
 * and the HTTP client are guaranteed to agree on the origin.
 */
export const TEST_API_BASE_URL = "http://localhost:8000"
