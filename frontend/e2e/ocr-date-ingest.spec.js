const { test, expect } = require('@playwright/test');

test('camera modal launch and OCR auto-fill flow', async ({ page }) => {
  await page.goto('http://localhost:5173');

  await page.fill('input[placeholder="Email address"]', 'test@example.com');
  await page.fill('input[aria-label="10-digit mobile number"]', '9876543210');
  await page.click('button:has-text("Generate OTP")');
  await page.fill('input[placeholder="6-digit OTP"]', '123456');
  await page.click('button:has-text("Verify & enter")');

  await page.fill('input[placeholder="Product name"]', 'Milk Packet');
  await page.click('button:has-text("Open camera")');
  await expect(page.locator('.camera')).toBeVisible();

  await page.evaluate(() => {
    const payload = { manufacturing: '2024-02-15', expiry: '2026-08-31', confidence: 0.92 };
    window.__OCR_PAYLOAD__ = payload;
    const dateInput = document.querySelectorAll('input[type="date"]')[1];
    if (dateInput) {
      dateInput.value = payload.expiry;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await page.fill('input[type="date"]', '2024-02-15');
  await page.fill('input[type="date"]:nth-of-type(2)', '2026-08-31');
  await page.click('button:has-text("Add to pantry")');

  await expect(page.locator('.status-badge')).toHaveCount(1);
});
