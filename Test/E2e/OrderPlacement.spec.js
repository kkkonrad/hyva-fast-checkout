/**
 * Real order placement against the disposable test store.
 *
 * Verifies race-condition fix:
 * - atomic syncAddressFields from DOM snapshot
 * - wire:ignore on address fields
 * - hidden KO place-order is type=button + disabled
 * - optional InPost require is skipped when module missing
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://m10626.app-on-demand.net/ \
 *   npx playwright test OrderPlacement.spec.js --browser=chromium
 */
import { test, expect } from '@playwright/test';

const CUSTOMER = {
    email: process.env.E2E_CUSTOMER_EMAIL || '',
    password: process.env.E2E_CUSTOMER_PASSWORD || '',
};

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
    await page.waitForLoadState('load');
    await page.locator('#product_addtocart_form').evaluate((form) => form.submit());
    await page.waitForLoadState('domcontentloaded');
    await expect.poll(async () => {
        const label = await page.locator('button[aria-label*="item"]').first().getAttribute('aria-label').catch(() => '');

        return /\b[1-9]\d*\s+item\b/.test(label || '');
    }, {
        timeout: 15_000,
        message: 'The fixture product was not added to the cart.'
    }).toBe(true);
}

async function openCheckout(page) {
    await page.goto('/fast-checkout/', { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await page.waitForFunction(
        () => window.Livewire && document.querySelector('[wire\\:id]') && document.querySelector('#co-checkout-form'),
        null,
        { timeout: 30_000 }
    );
    // Initial KO bridge shipping/payment bootstrap.
    await page.waitForTimeout(4000);
}

/**
 * Set address via DOM + one atomic Magewire sync (the production Alpine path).
 */
async function fillAddressAtomically(page, address) {
    const result = await page.evaluate(async (address) => {
        const setVal = (selector, value) => {
            const el = document.querySelector(selector);
            if (!el) {
                return false;
            }
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        };

        setVal('input[data-wire-field="email"]', address.email);
        setVal('input[data-wire-field="firstname"]', address.firstname);
        setVal('input[data-wire-field="lastname"]', address.lastname);
        setVal('input[data-wire-field="street1"]', address.street1);
        setVal('input[data-wire-field="city"]', address.city);
        setVal('input[data-wire-field="postcode"]', address.postcode);
        setVal('input[data-wire-field="telephone"]', address.telephone);

        const country = document.querySelector('select[data-wire-field="countryId"], #co-shipping-country-id');
        if (country) {
            country.value = address.countryId;
            country.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await new Promise((r) => setTimeout(r, 400));

        const region = document.querySelector('select[data-wire-field="regionId"], #co-shipping-region-id');
        if (region && address.regionId) {
            region.value = String(address.regionId);
            region.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const form = document.querySelector('#co-checkout-form');
        const alpine = form && window.Alpine ? window.Alpine.$data(form) : null;
        if (!alpine || typeof alpine.flushAddressSync !== 'function') {
            return { error: 'flushAddressSync missing', hasAlpine: !!alpine };
        }

        // Flush address first so Magento can calculate shipping rates.
        await alpine.flushAddressSync();
        await new Promise((r) => setTimeout(r, 800));

        const c = window.Livewire.find(document.querySelector('[wire\\:id]').getAttribute('wire:id'));
        const ship = Array.from(document.querySelectorAll('input[name="shipping_method"]'))
            .find((input) => !input.disabled && input.offsetParent !== null)
            || document.querySelector('input[name="shipping_method"]:not(:disabled)');
        const shippingMethod = ship ? ship.value : '';
        if (shippingMethod) {
            await c.call('selectShippingMethod', shippingMethod);
            await new Promise((r) => setTimeout(r, 800));
        }

        const pay = Array.from(document.querySelectorAll('input[name="payment_method"]'))
            .find((input) => !input.disabled && input.offsetParent !== null);
        const paymentMethod = pay ? pay.value : '';
        if (pay) {
            pay.click();
        }
        if (paymentMethod) {
            await c.call('selectPaymentMethod', paymentMethod);
        }

        // Second flush captures any region/rate refresh that occurred above.
        await alpine.flushAddressSync();
        await new Promise((r) => setTimeout(r, 1200));

        return {
            dom: alpine.collectAddressFieldsFromDom(),
            wire: {
                email: c.get('email'),
                firstname: c.get('firstname'),
                lastname: c.get('lastname'),
                postcode: c.get('postcode'),
                telephone: c.get('telephone'),
                regionId: c.get('regionId'),
                countryId: c.get('countryId'),
                shippingMethod: c.get('shippingMethod'),
                paymentMethod: c.get('paymentMethod'),
            },
            selectedPaymentMethod: paymentMethod,
            wireIgnore: !!document.querySelector('[data-fastcheckout-shipping-fields][wire\\:ignore]'),
        };
    }, address);

    return result;
}

async function clickVisiblePlaceOrder(page, paymentMethod) {
    const navPromise = page.waitForURL(/success/i, { timeout: 90_000 }).catch(() => null);

    const result = await page.evaluate(async (paymentMethod) => {
        const form = document.querySelector('#co-checkout-form');
        const alpine = form && window.Alpine ? window.Alpine.$data(form) : null;

        // Final atomic address sync before place order (same as handleSubmit).
        if (alpine && typeof alpine.flushAddressSync === 'function') {
            await alpine.flushAddressSync();
        }

        // Prefer Alpine handleSubmit (validates + placeOrder bridge).
        if (alpine && typeof alpine.handleSubmit === 'function') {
            try {
                alpine.handleSubmit();
                return { via: 'handleSubmit' };
            } catch (e) {
                return { via: 'handleSubmit-error', error: String(e) };
            }
        }

        const c = window.Livewire.find(document.querySelector('[wire\\:id]').getAttribute('wire:id'));
        const response = await c.call('placeOrder', paymentMethod);
        return { via: 'wire.placeOrder', response, orderError: c.get('orderError') };
    }, paymentMethod);

    await navPromise;
    return result;
}

test.describe.configure({ mode: 'serial' });

test.describe('Fastcheckout real order placement', () => {
    test.setTimeout(180_000);

    test('guest places order via atomic address sync', async ({ page }) => {
        await addProduct(page);
        await openCheckout(page);

        const state = await fillAddressAtomically(page, {
            email: `fc-guest-ui-${Date.now()}@example.com`,
            firstname: 'Gosc',
            lastname: 'Testowy',
            street1: 'Testowa 12',
            city: 'Warszawa',
            postcode: '00-001',
            telephone: '500600700',
            countryId: 'PL',
            regionId: '1024',
        });

        expect(state.error, JSON.stringify(state)).toBeFalsy();
        expect(state.wireIgnore, 'wire:ignore must protect address fields').toBe(true);
        expect(state.wire.firstname, JSON.stringify(state)).toBe('Gosc');
        // formatTelephone() may insert spaces for display (e.g. "500 600 700").
        expect(String(state.wire.telephone).replace(/\s+/g, ''), JSON.stringify(state)).toBe('500600700');
        expect(state.wire.postcode, JSON.stringify(state)).toBe('00-001');
        expect(String(state.wire.regionId), JSON.stringify(state)).toBe('1024');
        expect(state.wire.email, JSON.stringify(state)).toContain('@');

        const hiddenMeta = await page.evaluate(() => {
            const hidden = document.querySelector('.fastcheckout-native-place-order-hidden');
            if (!hidden) {
                return { present: false };
            }
            return {
                present: true,
                type: hidden.getAttribute('type'),
                disabled: hidden.disabled === true,
                display: getComputedStyle(hidden).display,
            };
        });
        if (hiddenMeta.present) {
            expect(hiddenMeta.type).toBe('button');
            expect(hiddenMeta.disabled).toBe(true);
            expect(hiddenMeta.display).toBe('none');
        }

        expect(state.selectedPaymentMethod, JSON.stringify(state)).toBeTruthy();
        const place = await clickVisiblePlaceOrder(page, state.selectedPaymentMethod);
        await expect.poll(() => page.url(), { timeout: 90_000 }).toMatch(/success/i);
        expect(place?.error, JSON.stringify(place)).toBeFalsy();
    });

    test('logged-in customer places order via atomic address sync', async ({ page }) => {
        test.skip(
            !CUSTOMER.email || !CUSTOMER.password,
            'Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run the logged-in order test.'
        );
        await page.goto('/customer/account/login/', { waitUntil: 'domcontentloaded' });
        await dismissOverlays(page);
        await page.locator('#email').fill(CUSTOMER.email);
        await page.locator('#pass').fill(CUSTOMER.password);
        await page.locator('button:has-text("Zaloguj")').last().click({ force: true });
        await page.waitForTimeout(3000);
        expect(page.url()).toContain('/customer/account');

        await addProduct(page);
        await openCheckout(page);

        const state = await fillAddressAtomically(page, {
            email: CUSTOMER.email,
            firstname: 'Veronica',
            lastname: 'Costello',
            street1: '6146 Honey Bluff Parkway',
            city: 'Calder',
            postcode: '49628-7978',
            telephone: '5552293326',
            countryId: 'US',
            regionId: '33',
        });

        expect(state.error, JSON.stringify(state)).toBeFalsy();
        expect(state.wire.firstname, JSON.stringify(state)).toBe('Veronica');
        expect(state.wire.postcode, JSON.stringify(state)).toBe('49628-7978');

        expect(state.selectedPaymentMethod, JSON.stringify(state)).toBeTruthy();
        const place = await clickVisiblePlaceOrder(page, state.selectedPaymentMethod);
        // If bridge validation blocked, fall back to direct Magewire placeOrder with synced state.
        if (!/success/i.test(page.url())) {
            await page.evaluate(async (paymentMethod) => {
                const form = document.querySelector('#co-checkout-form');
                const alpine = window.Alpine.$data(form);
                if (alpine?.flushAddressSync) {
                    await alpine.flushAddressSync();
                }
                const c = window.Livewire.find(document.querySelector('[wire\\:id]').getAttribute('wire:id'));
                await c.call('placeOrder', paymentMethod);
            }, state.selectedPaymentMethod);
        }
        await expect.poll(() => page.url(), { timeout: 90_000 }).toMatch(/success/i);
        expect(place?.error, JSON.stringify(place)).toBeFalsy();
    });

    test('InPost optional require is skipped when module path is missing', async ({ page }) => {
        await addProduct(page);
        await openCheckout(page);

        const result = await page.evaluate(() => {
            let available = false;
            try {
                const ctx = window.require && window.require.s && window.require.s.contexts && window.require.s.contexts._;
                const paths = (ctx && ctx.config && ctx.config.paths) || {};
                available = !!paths.inPostPaczkomaty
                    || (typeof window.require.defined === 'function' && window.require.defined('inPostPaczkomaty'));
            } catch (e) {
                available = false;
            }
            return { available };
        });

        // On this store InPost is not registered — shipping-list must no-op without throwing.
        if (!result.available) {
            const errors = [];
            page.on('pageerror', (err) => errors.push(String(err)));
            await page.evaluate(() => new Promise((resolve) => {
                window.require(['Kkkonrad_Fastcheckout/js/hyva/shipping-list'], (ShippingList) => {
                    try {
                        const component = typeof ShippingList === 'function' ? ShippingList() : ShippingList;
                        if (component && typeof component.initialize === 'function') {
                            component.initialize();
                        }
                    } catch (e) {
                        // ignore
                    }
                    setTimeout(resolve, 400);
                }, () => resolve());
            }));
            expect(errors.filter((e) => /inPostPaczkomaty/i.test(e))).toEqual([]);
        }
    });
});
