/**
 * Tests E2E - Onboarding Wizard
 */

import { test, expect } from '@playwright/test';

test.describe('Onboarding Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Effacer le localStorage avant chaque test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('should display onboarding wizard on first visit', async ({ page }) => {
    await page.goto('/');

    // Vérifier que le wizard s'affiche
    await expect(page.locator('.onboarding-wizard')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Bienvenue sur Freel');
  });

  test('should complete onboarding flow', async ({ page }) => {
    await page.goto('/');

    // Étape 1: Welcome
    await expect(page.locator('h1')).toContainText('Bienvenue sur Freel');
    await page.click('button:has-text("Suivant")');

    // Étape 2: Company info
    await expect(page.locator('h1')).toContainText('Informations de votre société');
    await page.fill('#company-name', 'Test Consulting');
    await page.fill('#siret', '12345678901234');
    await page.fill('#address', '123 rue Test');
    await page.fill('#postal-code', '75001');
    await page.fill('#city', 'Paris');
    await page.fill('#email', 'test@example.com');
    await page.fill('#phone', '0123456789');
    await page.click('button:has-text("Suivant")');

    // Étape 3: Fiscal config
    await expect(page.locator('h1')).toContainText('Configuration fiscale');
    await page.fill('#creation-date', '2025-03-02');
    await page.check('input[value="service"]');
    await page.click('button:has-text("Suivant")');

    // Étape 4: Goals
    await expect(page.locator('h1')).toContainText('Objectifs et facturation');
    await page.fill('#goal-ca', '50000');
    await page.fill('#ape-code', '6201Z');
    await page.click('button:has-text("Suivant")');

    // Étape 5: Bank info
    await expect(page.locator('h1')).toContainText('Informations bancaires');
    await page.fill('#iban', 'FR7630001007941234567890185');
    await page.click('button:has-text("Terminer")');

    // Vérifier que l'app est chargée
    await expect(page.locator('.app-nav')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.dashboard-view')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/');

    // Welcome screen
    await page.click('button:has-text("Suivant")');

    // Try to skip company info without filling
    await page.click('button:has-text("Suivant")');

    // Should show alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('nom de votre société');
      await dialog.accept();
    });
  });

  test('should allow going back to previous steps', async ({ page }) => {
    await page.goto('/');

    // Navigate forward
    await page.click('button:has-text("Suivant")');
    await page.fill('#company-name', 'Test Company');
    await page.fill('#siret', '12345678901234');
    await page.click('button:has-text("Suivant")');

    // Navigate back
    await page.click('button:has-text("Précédent")');

    // Verify we're back to company info and data is preserved
    await expect(page.locator('h1')).toContainText('Informations de votre société');
    await expect(page.locator('#company-name')).toHaveValue('Test Company');
  });
});
