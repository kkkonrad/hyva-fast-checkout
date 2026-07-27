import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';

async function addProduct(page) {
    await page.goto(BASE + 'rma-e2e-product.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await Promise.all([
        page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/checkout/cart/add/')
        ), { timeout: 30_000 }),
        page.locator('#product-addtocart-button').click()
    ]);
}

test('the whole shipping method card selects its radio', async ({ page }) => {
    const pageErrors = [];
    const failedRequests = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
        failedRequests.push({
            url: request.url(),
            error: request.failure()?.errorText || ''
        });
    });

    await addProduct(page);
    await page.goto(BASE + 'checkout/?shipping-card-click=' + Date.now(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });

    const options = page.locator('.fastcheckout-shipping-method-option');
    await expect(options).toHaveCount(2, { timeout: 30_000 });

    await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
        window.require(
            ['Magento_Checkout/js/model/shipping-service'],
            (shippingService) => resolve(!shippingService.isLoading()),
            () => resolve(false)
        );
    })), { timeout: 30_000 }).toBe(true);

    const checkedIndex = await options.evaluateAll((cards) => (
        cards.findIndex((card) => Boolean(
            card.querySelector('input[name="shipping_method"]:checked')
        ))
    ));
    const targetIndex = checkedIndex === 0 ? 1 : 0;
    const targetOption = options.nth(targetIndex);
    const targetRadio = targetOption.locator('input[name="shipping_method"]');
    const otherRadio = options
        .nth(targetIndex === 0 ? 1 : 0)
        .locator('input[name="shipping_method"]');
    await targetOption.evaluate((element) => {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    const box = await targetOption.boundingBox();

    expect(box).not.toBeNull();

    // Six pixels from the card corner is inside its padding, outside the label.
    // This was the part of the visible method that previously did nothing.
    await page.mouse.click(box.x + 6, box.y + 6);
    await expect(targetRadio).toBeChecked();
    await expect(otherRadio).not.toBeChecked();

    const selectedCode = await page.evaluate(() => new Promise((resolve) => {
        window.require(['Magento_Checkout/js/model/quote'], (quote) => {
            const method = quote.shippingMethod();

            resolve(method ? method.carrier_code + '_' + method.method_code : '');
        }, () => resolve(''));
    }));
    await expect(targetRadio).toHaveValue(selectedCode);

    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
});
