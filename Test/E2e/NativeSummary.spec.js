/**
 * Headless: native Magento KO order summary on Fastcheckout.
 * Fails if Magento_Tax summary templates do not load (RequireJS baseUrl).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'aim-analog-watch.html';

async function openCheckoutWithProduct(page) {
    await page.goto(new URL('customer/account/login/', BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    const formKey = await page.locator('input[name="form_key"]').first().inputValue().catch(() => '');

    await page.goto(new URL(PRODUCT, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    if (formKey) {
        await page.locator('#product_addtocart_form input[name="form_key"]')
            .evaluate((input, value) => { input.value = value; }, formKey)
            .catch(() => {});
    }

    const addToCart = page.getByRole('button', { name: /Dodaj do koszyka|Add to Cart/i });
    await expect(addToCart).toBeVisible({ timeout: 30_000 });
    await Promise.all([
        page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/checkout/cart/add')
        ), { timeout: 30_000 }).catch(() => null),
        addToCart.click()
    ]);

    await page.goto(new URL('checkout/?ns=' + Date.now(), BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await expect(page.locator('#fastcheckout-checkout')).toBeVisible({ timeout: 45_000 });
}

test.describe('Native Magento summary on Fastcheckout', () => {
    test('loads Tax summary templates without console errors and shows KO summary', async ({ page }) => {
        test.setTimeout(120_000);

        const pageErrors = [];
        const consoleErrors = [];
        const failedTemplateUrls = [];

        page.on('pageerror', (error) => pageErrors.push(String(error)));
        page.on('console', (msg) => {
            if (msg.type() !== 'error') {
                return;
            }
            const text = msg.text();
            consoleErrors.push(text);
        });
        page.on('response', (response) => {
            const url = response.url();
            if (
                response.status() >= 400 &&
                /Magento_Tax.*summary|template\/checkout\/summary/i.test(url)
            ) {
                failedTemplateUrls.push(response.status() + ' ' + url);
            }
        });

        await openCheckoutWithProduct(page);

        // Wait for bridge to mount native summary (or keep SSR if config empty — still no Tax errors).
        await page.waitForFunction(() => (
            window.fastcheckoutNativeSummaryComponentsStarted === true ||
            document.querySelector('[data-fastcheckout-native-summary]:not(.hidden)') ||
            Date.now()
        ), null, { timeout: 5_000 }).catch(() => {});

        // Give RequireJS time to request Magento_Tax templates.
        await page.waitForTimeout(4_000);

        // Prefer native summary visible; SSR alone is acceptable only if native never started.
        const state = await page.evaluate(() => {
            const root = document.getElementById('fastcheckout-ko-summary-root');
            const ssr = document.querySelector('[data-fastcheckout-summary-ssr]');
            const baseUrl = (window.require && window.require.s &&
                window.require.s.contexts._ &&
                window.require.s.contexts._.config &&
                window.require.s.contexts._.config.baseUrl) || '';

            return {
                nativeStarted: !!window.fastcheckoutNativeSummaryComponentsStarted,
                rootHidden: !root || root.classList.contains('hidden') || root.style.display === 'none',
                rootHasContent: !!(root && root.innerHTML && root.innerHTML.trim().length > 40),
                ssrHidden: !ssr || ssr.classList.contains('hidden'),
                hasTableTotals: !!document.querySelector(
                    '#fastcheckout-ko-summary-root .table-totals, ' +
                    '#fastcheckout-ko-summary-root [data-bind*="totals"]'
                ),
                hasNativeSummaryClass: !!document.querySelector('.fastcheckout-native-summary'),
                requireBaseUrl: baseUrl,
                baseUrlLooksValid: /\/frontend\/(?!_view\/)[^/]+\/[^/]+\/[^/]+\/$/.test(baseUrl)
            };
        });

        const taxTemplateFailures = consoleErrors.filter((text) => (
            /Failed to load the "Magento_Tax\/checkout\/summary/i.test(text) ||
            /Magento_Tax\/checkout\/summary\/(subtotal|tax|grand-total|shipping)/i.test(text)
        ));

        // Primary regression: the errors the shopper reported.
        expect(
            taxTemplateFailures,
            'Magento_Tax summary template console errors:\n' + taxTemplateFailures.join('\n')
        ).toEqual([]);
        expect(
            failedTemplateUrls,
            'HTTP failures for Magento_Tax summary templates:\n' + failedTemplateUrls.join('\n')
        ).toEqual([]);

        // baseUrl must be theme/locale with trailing slash (not _view, not missing /).
        if (state.requireBaseUrl) {
            expect(
                state.baseUrlLooksValid,
                'require baseUrl invalid for templates: ' + state.requireBaseUrl
            ).toBe(true);
            expect(state.requireBaseUrl).not.toContain('/_view/');
            expect(state.requireBaseUrl.endsWith('/')).toBe(true);
        }

        // When native summary started, KO content should replace SSR.
        if (state.nativeStarted) {
            expect(state.rootHidden, JSON.stringify(state)).toBe(false);
            expect(
                state.rootHasContent || state.hasNativeSummaryClass || state.hasTableTotals,
                'native summary mounted but empty: ' + JSON.stringify(state)
            ).toBe(true);
        }

        // No hard page errors from the summary path.
        const criticalPageErrors = pageErrors.filter((msg) => (
            /Magento_Tax|template|summary/i.test(msg)
        ));
        expect(criticalPageErrors, criticalPageErrors.join('\n')).toEqual([]);
    });
});
