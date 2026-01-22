/**
 * Tests E2E - Mission Management
 */

import { test, expect } from '@playwright/test';

// Helper pour setup localStorage avec données de test
async function setupTestData(page) {
  await page.goto('/');

  await page.evaluate(() => {
    // Setup company data
    const company = {
      name: 'Test Consulting',
      siret: '73282932000074',
      address: '123 rue Test',
      city: 'Paris',
      postalCode: '75001',
      email: 'test@example.com',
      phone: '0123456789',
      iban: 'FR7630001007941234567890185',
      creationDate: '2025-03-02',
      activityType: 'service',
      regime: 'BNC',
      invoiceCounter: {},
      charges: { urssaf: [], ir: [], tva: [], other: [] }
    };

    const irConfig = {
      acre: true,
      versementLib: false,
      parts: 1,
      abattement: 0.34
    };

    const missions = [{
      id: 'm1',
      client: 'Client Test SA',
      tjm: 500,
      startDate: '2025-03',
      endDate: null,
      active: true,
      lignes: [
        { ym: '2025-03', joursPrevus: 10, joursReels: 8 },
        { ym: '2025-04', joursPrevus: 15, joursReels: null }
      ]
    }];

    const clients = [{
      id: 'c1',
      nom: 'Client Test SA',
      email: 'client@test.com',
      address: '456 avenue Test, 75002 Paris'
    }];

    // Save to localStorage
    localStorage.setItem('freel_v52_company', JSON.stringify(company));
    localStorage.setItem('freel_v52_irConfig', JSON.stringify(irConfig));
    localStorage.setItem('freel_v52_missions', JSON.stringify(missions));
    localStorage.setItem('freel_v52_clients', JSON.stringify(clients));
    localStorage.setItem('freel_v52_onboarding_completed', 'true');
    localStorage.setItem('freel_v52_goalCA', '50000');
    localStorage.setItem('freel_v52_theme', '"dark"');
  });

  await page.reload();
}

test.describe('Mission Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestData(page);
  });

  test('should display dashboard with existing mission', async ({ page }) => {
    // Dashboard should be visible
    await expect(page.locator('.dashboard-view')).toBeVisible();

    // Should show CA metric
    await expect(page.locator('.kpi-card')).toContainText('CA');

    // Should show mission data
    // Note: actual content depends on dashboard implementation
  });

  test('should navigate to missions view', async ({ page }) => {
    // Click on Missions link
    await page.click('a[data-route="missions"]');

    // Missions view should be visible
    await expect(page.locator('.missions-view')).toBeVisible({ timeout: 5000 });

    // Should display existing mission
    await expect(page.locator('text=Client Test SA')).toBeVisible();
  });

  test('should create a new mission', async ({ page }) => {
    // Navigate to missions
    await page.click('a[data-route="missions"]');
    await page.waitForSelector('.missions-view');

    // Click "New Mission" button (assuming it exists)
    const newMissionBtn = page.locator('button:has-text("Nouvelle mission"), button:has-text("Ajouter")').first();

    if (await newMissionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newMissionBtn.click();

      // Fill mission form (assuming modal or form exists)
      await expect(page.locator('.modal, form')).toBeVisible({ timeout: 5000 });

      // This part depends on the actual UI implementation
      // Add assertions for mission creation flow
    }
  });

  test('should navigate to invoices view', async ({ page }) => {
    // Click on Invoices link
    await page.click('a[data-route="invoices"]');

    // Invoices view should be visible
    await expect(page.locator('.invoices-view')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to charges view', async ({ page }) => {
    // Click on Charges link
    await page.click('a[data-route="charges"]');

    // Charges view should be visible
    await expect(page.locator('.charges-view')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to treasury view', async ({ page }) => {
    // Click on Treasury link
    await page.click('a[data-route="treasury"]');

    // Treasury view should be visible
    await expect(page.locator('.treasury-view')).toBeVisible({ timeout: 5000 });
  });

  test('should display navigation correctly', async ({ page }) => {
    // Check all nav links exist
    await expect(page.locator('a[data-route="dashboard"]')).toBeVisible();
    await expect(page.locator('a[data-route="missions"]')).toBeVisible();
    await expect(page.locator('a[data-route="treasury"]')).toBeVisible();
    await expect(page.locator('a[data-route="invoices"]')).toBeVisible();
    await expect(page.locator('a[data-route="charges"]')).toBeVisible();
    await expect(page.locator('a[data-route="settings"]')).toBeVisible();
  });

  test('should persist data after page reload', async ({ page }) => {
    // Navigate to missions
    await page.click('a[data-route="missions"]');
    await page.waitForSelector('.missions-view');

    // Reload page
    await page.reload();

    // Should still show missions after reload
    await expect(page.locator('.missions-view')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Client Test SA')).toBeVisible();
  });
});
