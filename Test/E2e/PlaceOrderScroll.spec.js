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

    test('scroll freeze blocks scrollIntoView and restores position on unlock', async ({ page }) => {
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

            const frozen = {
                bodyFixed: document.body.style.position === 'fixed',
                lockedClass: document.body.classList.contains('fastcheckout-scroll-locked'),
                bodyTop: document.body.style.top
            };

            // Simulate Magento/KO focusing payment and calling scrollIntoView / scrollTo.
            const payment = document.querySelector('[data-fastcheckout-payment-option], .fc-container-3') || document.body;
            if (typeof payment.scrollIntoView === 'function') {
                payment.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            window.scrollTo(0, 0);
            await new Promise((r) => setTimeout(r, 50));

            const midTop = document.body.style.top;
            const midPosition = document.body.style.position;

            alpine.isProcessing = false;
            alpine.unlockScrollForPlaceOrder();
            document.body.classList.remove('checkout-submitting');
            await new Promise((r) => setTimeout(r, 30));

            const after = window.scrollY || window.pageYOffset || 0;

            return {
                before,
                after,
                frozen,
                midTop,
                midPosition,
                unlockedPosition: document.body.style.position || '',
                error: null
            };
        });

        expect(result.error, JSON.stringify(result)).toBeFalsy();
        expect(result.before, JSON.stringify(result)).toBeGreaterThan(200);
        expect(result.frozen.bodyFixed, JSON.stringify(result)).toBe(true);
        expect(result.frozen.lockedClass, JSON.stringify(result)).toBe(true);
        // Still frozen after attempted scrollTo(0) — no unlock mid-flight.
        expect(result.midPosition, JSON.stringify(result)).toBe('fixed');
        // After unlock, viewport returns near the original CTA position (no stuck jump to top).
        expect(Math.abs(result.after - result.before), JSON.stringify(result)).toBeLessThan(80);
        expect(result.unlockedPosition, JSON.stringify(result)).toBe('');
    });

    test('scrollToSelectedPaymentMethod unlocks freeze before scrolling', async ({ page }) => {
        test.setTimeout(120_000);
        await addProduct(page);
        await openCheckout(page);

        const result = await page.evaluate(() => {
            const form = document.querySelector('#co-checkout-form');
            const alpine = window.Alpine.$data(form);
            if (!alpine || typeof alpine.scrollToSelectedPaymentMethod !== 'function') {
                return { error: 'scrollToSelectedPaymentMethod missing' };
            }

            alpine.isProcessing = true;
            alpine.lockScrollForPlaceOrder();
            const wasFrozen = document.body.style.position === 'fixed';

            // Call unlock path used by validation failure (scroll itself is rAF — not asserted here).
            alpine.scrollToSelectedPaymentMethod();

            return {
                wasFrozen,
                unlocked: document.body.style.position !== 'fixed',
                error: null
            };
        });

        expect(result.error, JSON.stringify(result)).toBeFalsy();
        expect(result.wasFrozen, JSON.stringify(result)).toBe(true);
        expect(result.unlocked, JSON.stringify(result)).toBe(true);
    });
});
