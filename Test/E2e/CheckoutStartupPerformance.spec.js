import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';

async function addProduct(page) {
    await page.goto(BASE + 'rma-e2e-product.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await page.locator('#product-addtocart-button').click();
    await page.waitForURL(/checkout\/cart|rma-e2e-product/, { timeout: 30_000 });
}

test('measures shipping form startup after a full reload', async ({ page }) => {
    await page.addInitScript(() => {
        const marks = {
            init: performance.now(),
            domContentLoaded: null,
            root: null,
            firstInput: null,
            addressReady: null,
            paymentUiStarted: null,
            requireJs: null,
            checkoutConfig: null,
            longTasks: []
        };

        window.fastcheckoutStartupMarks = marks;

        function inspect() {
            if (
                marks.root === null &&
                document.querySelector('.fastcheckout-native-shipping-address')
            ) {
                marks.root = performance.now();
            }
            if (
                marks.firstInput === null &&
                document.querySelector('.fastcheckout-native-shipping-address input[name="firstname"]')
            ) {
                marks.firstInput = performance.now();
            }
            if (marks.addressReady === null && window.fastcheckoutAddressFieldsReady) {
                marks.addressReady = performance.now();
            }
            if (
                marks.paymentUiStarted === null &&
                window.fastcheckoutDeferredPaymentComponentsStarted
            ) {
                marks.paymentUiStarted = performance.now();
            }
            if (marks.requireJs === null && typeof window.require === 'function') {
                marks.requireJs = performance.now();
            }
            if (marks.checkoutConfig === null && window.checkoutConfig) {
                marks.checkoutConfig = performance.now();
            }
        }

        const observer = new MutationObserver(inspect);
        observer.observe(document, { childList: true, subtree: true });
        const interval = window.setInterval(() => {
            inspect();
            if (marks.addressReady !== null) {
                window.clearInterval(interval);
            }
        }, 10);

        document.addEventListener('DOMContentLoaded', () => {
            marks.domContentLoaded = performance.now();
            inspect();
        });

        if (typeof PerformanceObserver === 'function') {
            try {
                const longTaskObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                        marks.longTasks.push({
                            start: Math.round(entry.startTime),
                            duration: Math.round(entry.duration)
                        });
                    });
                });
                longTaskObserver.observe({ type: 'longtask', buffered: true });
            } catch (error) {
                // Long Task API can be unavailable in some Chromium builds.
            }
        }
    });

    await addProduct(page);
    const initialCheckoutStartedAt = Date.now();
    await page.goto(BASE + 'checkout/?startup-seed=' + Date.now(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    const initialDomContentLoadedElapsed = Date.now() - initialCheckoutStartedAt;
    const startupLoader = page.locator('[data-fastcheckout-startup-loader]');
    const shipping = page.locator('.fastcheckout-native-shipping-address');
    await expect(startupLoader).toBeVisible();
    await expect(startupLoader).toContainText('Ładowanie procesu zamówienia...');
    await expect(shipping.getByLabel('Nazwisko')).toBeVisible({ timeout: 30_000 });
    await expect(startupLoader).toBeHidden();
    const initialFirstInputElapsed = Date.now() - initialCheckoutStartedAt;
    const initialBrowser = await page.evaluate(() => ({
        marks: window.fastcheckoutStartupMarks,
        navigation: performance.getEntriesByType('navigation')[0]
            ? performance.getEntriesByType('navigation')[0].toJSON()
            : null
    }));
    await shipping.locator('input[name="email"]').fill(
        'startup-' + Date.now() + '@example.com'
    );
    await shipping.locator('input[name="firstname"]').fill('Startup');
    await shipping.locator('input[name="lastname"]').fill('Timing');
    await shipping.locator('input[name="street[0]"]').fill('Testowa 1');
    await shipping.locator('input[name="city"]').fill('Warszawa');
    await shipping.locator('input[name="postcode"]').fill('00-001');
    await shipping.locator('input[name="telephone"]').fill('500600700');
    await shipping.locator('select[name="country_id"]').selectOption('PL');
    await shipping.locator('select[name="region_id"]').selectOption({ index: 1 });

    await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
        window.require(['Magento_Checkout/js/checkout-data'], (checkoutData) => {
            const address = checkoutData.getShippingAddressFromData() || {};

            resolve(address.lastname || '');
        }, () => resolve(''));
    }))).toBe('Timing');

    const network = [];
    let reloadStartedAt = 0;
    page.on('request', (request) => {
        if (!reloadStartedAt) {
            return;
        }
        const url = request.url();
        if (
            request.resourceType() === 'document' ||
            url.includes('/estimate-shipping-methods') ||
            url.includes('/static/')
        ) {
            network.push({
                event: 'request',
                at: Date.now() - reloadStartedAt,
                type: request.resourceType(),
                url: url.replace(BASE, '')
            });
        }
    });
    page.on('response', (response) => {
        if (!reloadStartedAt) {
            return;
        }
        const url = response.url();
        if (
            response.request().resourceType() === 'document' ||
            url.includes('/estimate-shipping-methods') ||
            url.includes('/static/')
        ) {
            network.push({
                event: 'response',
                at: Date.now() - reloadStartedAt,
                status: response.status(),
                type: response.request().resourceType(),
                url: url.replace(BASE, '')
            });
        }
    });

    reloadStartedAt = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    const domContentLoadedElapsed = Date.now() - reloadStartedAt;
    await expect(startupLoader).toBeVisible();
    await expect(startupLoader).toContainText('Ładowanie procesu zamówienia...');
    await expect(shipping.getByLabel('Nazwisko')).toBeVisible({ timeout: 30_000 });
    await expect(startupLoader).toBeHidden();
    const firstInputElapsed = Date.now() - reloadStartedAt;
    await expect(shipping.getByLabel('Nazwisko')).toHaveValue('Timing');

    await expect.poll(() => page.evaluate(
        () => Boolean(window.fastcheckoutAddressFieldsReady)
    )).toBe(true);
    await expect.poll(() => page.evaluate(
        () => Boolean(window.fastcheckoutDeferredPaymentComponentsStarted)
    )).toBe(true);

    const browser = await page.evaluate(() => {
        const marks = window.fastcheckoutStartupMarks;
        const resources = performance.getEntriesByType('resource');
        const startupResources = resources.filter((entry) => (
            marks.requireJs !== null &&
            marks.firstInput !== null &&
            entry.startTime >= marks.requireJs &&
            entry.startTime <= marks.firstInput &&
            entry.responseEnd <= marks.firstInput
        ));

        return {
            marks,
            navigation: performance.getEntriesByType('navigation')[0]
                ? performance.getEntriesByType('navigation')[0].toJSON()
                : null,
            resourceSummary: startupResources.reduce((summary, entry) => {
                const type = entry.initiatorType || 'other';

                summary.total += 1;
                summary.byType[type] = (summary.byType[type] || 0) + 1;

                return summary;
            }, { total: 0, byType: {} }),
            resources: resources
            .filter((entry) => (
                entry.name.includes('checkout-bridge') ||
                entry.name.includes('estimate-shipping-methods') ||
                entry.duration > 250
            ))
            .map((entry) => ({
                name: entry.name.replace(location.origin + '/', ''),
                startTime: Math.round(entry.startTime),
                responseEnd: Math.round(entry.responseEnd),
                duration: Math.round(entry.duration),
                initiatorType: entry.initiatorType
            }))
            .sort((left, right) => right.duration - left.duration)
            .slice(0, 20)
        };
    });

    console.log(JSON.stringify({
        initialDomContentLoadedElapsed,
        initialFirstInputElapsed,
        initialBrowser,
        domContentLoadedElapsed,
        firstInputElapsed,
        browser,
        lastResponsesBeforeInput: network
            .filter((entry) => (
                entry.event === 'response' &&
                entry.at <= browser.marks.firstInput
            ))
            .sort((left, right) => right.at - left.at)
            .slice(0, 20)
    }, null, 2));

    expect(browser.marks.firstInput).not.toBeNull();
    expect(browser.marks.paymentUiStarted).not.toBeNull();
    expect(browser.marks.paymentUiStarted).toBeGreaterThanOrEqual(
        browser.marks.firstInput
    );
});
