// E2E placeholder — requires Playwright + a running Tauri app or dev server.
// To run locally: npx playwright test e2e/
// In CI: see .github/workflows/ci-e2e.yml (continue-on-error: true during setup phase)
//
// This test will be replaced by a real Tauri E2E test once the test harness is wired up
// (e.g. using tauri-driver or a mocked web build).

import { test, expect } from '@playwright/test';

test('placeholder — always passes', async () => {
  // Replace with: const app = await electron.launch({ args: ['src-tauri/target/...'] })
  expect(true).toBe(true);
});
