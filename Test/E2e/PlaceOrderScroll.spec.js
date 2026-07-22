/**
 * Mobile place-order scroll behaviour (headless).
 *
 * Covers Alpine helpers shipped in script.phtml:
 * - lockScrollForPlaceOrder holds viewport while isProcessing
 * - shouldScrollToPaymentOnError only for validation-like messages
 * - scrollToSelectedPaymentMethod runs on validation failure
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://m10626.app-on-demand.net/ \
 *   npx playwright test PlaceOrderScroll.spec.js --browser=chromium
 */
import { test, expect } from '@playwright/test';

async function dismissOverlays(page) {
    for (const sel of ['button:has-text("Akceptuj")', 'button[aria-label="Zamknij wiadomość"]']) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
        }
    }
}

async function addProduct(page) {
    await page.goto('/joust-duffle-bag.html', { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await page.locator('#product-addtocart-button').click({ force: true });
    await page.waitForTimeout(2500);
}

async function openCheckout(page) {
    await page.goto('/fast-checkout/', { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await page.waitForFunction(
        () =>
            window.Livewire &&
            document.querySelector('[wire\\:id]') &&
            document.querySelector('#co-checkout-form') &&
            window.Alpine,
        null,
        { timeout: 30_000 }
    );
    // Wait for Alpine component + payment bridge bootstrap.
    await page.waitForTimeout(3500);
}

async function getAlpineApi(page) {
    return page.evaluate(() => {
        const form = document.querySelector('#co-checkout-form');
        if (!form || !window.Alpine) {
            return { error: 'form/Alpine missing' };
        }
        const alpine = window.Alpine.$data(form);
        if (!alpine) {
            return { error: 'Alpine data missing' };
        }
        return {
            hasLock: typeof alpine.lockScrollForPlaceOrder === 'function',
            hasUnlock: typeof alpine.unlockScrollForPlaceOrder === 'function',
            hasShouldScroll: typeof alpine.shouldScrollToPaymentOnError === 'function',
            hasScrollPayment: typeof alpine.scrollToSelectedPaymentMethod === 'function',
            hasHandleSubmit: typeof alpine.handleSubmit === 'function',
        };
    });
}

test.describe('Place order scroll (mobile)', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });

    test('helpers are present on checkout Alpine component', async ({ page }) => {
        test.setTimeout(120_000);
        await addProduct(page);
        await openCheckout(page);
        const api = await getAlpineApi(page);
        expect(api.error, JSON.stringify(api)).toBeFalsy();
        expect(api.hasLock).toBe(true);
        expect(api.hasUnlock).toBe(true);
        expect(api.hasShouldScroll).toBe(true);
        expect(api.hasScrollPayment).toBe(true);
        expect(api.hasHandleSubmit).toBe(true);
    });

    test('shouldScrollToPaymentOnError only for validation messages', async ({ page }) => {
        test.setTimeout(120_000);
        await addProduct(page);
        await openCheckout(page);

        const result = await page.evaluate(() => {
            const form = document.querySelector('#co-checkout-form');
            const alpine = window.Alpine.$data(form);
            return {
                validation: alpine.shouldScrollToPaymentOnError({
                    message: 'Please check the selected payment method and try again.',
                }),
                terms: alpine.shouldScrollToPaymentOnError({
                    message:
                        "The order wasn't placed. First, agree to the terms and conditions, then try placing your order again.",
                }),
                plValidation: alpine.shouldScrollToPaymentOnError({
                    message: 'Sprawdź wybraną metodę płatności i spróbuj ponownie.',
                }),
                generic: alpine.shouldScrollToPaymentOnError({
                    message: 'Something went wrong while processing your order. Please try again later.',
                }),
                empty: alpine.shouldScrollToPaymentOnError({ message: '' }),
            };
        });

        expect(result.validation).toBe(true);
        expect(result.terms).toBe(true);
        expect(result.plValidation).toBe(true);
        expect(result.generic).toBe(false);
        expect(result.empty).toBe(false);
    });

    test('scroll lock holds viewport while place-order is processing', async ({ page }) => {
        test.setTimeout(120_000);
        await addProduct(page);
        await openCheckout(page);

        // Ensure page is tall enough that payment section is above sticky CTA.
        await page.evaluate(() => {
            const form = document.querySelector('#co-checkout-form');
            if (form) {
                const spacer = document.createElement('div');
                spacer.style.height = '1200px';
                spacer.setAttribute('data-scroll-test-spacer', '1');
                form.appendChild(spacer);
            }
            window.scrollTo(0, document.documentElement.scrollHeight);
        });
        await page.waitForTimeout(200);

        const result = await page.evaluate(async () => {
            const form = document.querySelector('#co-checkout-form');
            const alpine = window.Alpine.$data(form);
            if (!alpine || typeof alpine.lockScrollForPlaceOrder !== 'function') {
                return { error: 'lockScrollForPlaceOrder missing' };
            }

            const before = window.scrollY || window.pageYOffset || 0;
            alpine.isProcessing = true;
            document.body.classList.add('checkout-submitting');
            alpine.lockScrollForPlaceOrder();

            // Simulate Magewire morph / focus jumping the viewport to payment (top).
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event('scroll'));
            // Give the guard a tick (listener is sync, but layout can lag).
            await new Promise((r) => setTimeout(r, 50));
            window.dispatchEvent(new Event('scroll'));

            const mid = window.scrollY || window.pageYOffset || 0;

            // Intentional validation scroll is allowed.
            alpine._allowPaymentScroll = true;
            window.scrollTo(0, 100);
            window.dispatchEvent(new Event('scroll'));
            const allowed = window.scrollY || window.pageYOffset || 0;

            alpine._allowPaymentScroll = false;
            alpine.isProcessing = false;
            alpine.unlockScrollForPlaceOrder();
            document.body.classList.remove('checkout-submitting');

            return { before, mid, allowed, error: null };
        });

        expect(result.error, JSON.stringify(result)).toBeFalsy();
        expect(result.before, JSON.stringify(result)).toBeGreaterThan(200);
        // Guard should pull viewport back near the locked Y (allow small jitter).
        expect(Math.abs(result.mid - result.before), JSON.stringify(result)).toBeLessThan(80);
        // With allow flag, jump is permitted.
        expect(result.allowed, JSON.stringify(result)).toBeLessThan(result.before - 50);
    });

    test('scrollToSelectedPaymentMethod moves viewport toward payment', async ({ page }) => {
        test.setTimeout(120_000);
        await addProduct(page);
        await openCheckout(page);

        const result = await page.evaluate(async () => {
            const form = document.querySelector('#co-checkout-form');
            const alpine = window.Alpine.$data(form);
            if (!alpine || typeof alpine.scrollToSelectedPaymentMethod !== 'function') {
                return { error: 'scrollToSelectedPaymentMethod missing' };
            }

            // Create a payment target near the top if none exist.
            let target = document.querySelector('[data-fastcheckout-payment-option], .fc-container-3');
            if (!target) {
                target = document.createElement('div');
                target.className = 'fc-container-3';
                target.setAttribute('data-fastcheckout-payment-option', 'checkmo');
                target.style.height = '40px';
                form.insertBefore(target, form.firstChild);
            }

            // Push viewport to bottom.
            const spacer = document.createElement('div');
            spacer.style.height = '1500px';
            form.appendChild(spacer);
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise((r) => setTimeout(r, 100));
            const before = window.scrollY || window.pageYOffset || 0;

            // Headless Chromium often skips smooth scroll animation — force instant for assertion.
            const originalScrollIntoView = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function (opts) {
                const next = opts && typeof opts === 'object' ? Object.assign({}, opts, { behavior: 'auto' }) : opts;
                return originalScrollIntoView.call(this, next);
            };
            try {
                alpine.scrollToSelectedPaymentMethod();
            } finally {
                Element.prototype.scrollIntoView = originalScrollIntoView;
            }

            await new Promise((r) => setTimeout(r, 100));
            const after = window.scrollY || window.pageYOffset || 0;
            const top = target.getBoundingClientRect().top;

            return { before, after, top, error: null };
        });

        expect(result.error, JSON.stringify(result)).toBeFalsy();
        expect(result.before, JSON.stringify(result)).toBeGreaterThan(200);
        // Should move up toward payment / leave payment in viewport.
        expect(
            result.after < result.before - 40 || (result.top > -50 && result.top < 900),
            JSON.stringify(result)
        ).toBeTruthy();
    });
});
