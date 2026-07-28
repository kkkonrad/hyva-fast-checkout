/**
 * Regression: shopper can uncheck "billing same as shipping" and the choice sticks.
 * Magento KO may remount / re-resolve billing across payment renderers; Fastcheckout
 * must not force the checkbox back on after an intentional uncheck.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';

async function addProductAndOpenCheckout(page) {
    await page.goto(BASE + 'rma-e2e-product.html', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const f = document.getElementById('product_addtocart_form');
        if (f?.requestSubmit) {
            f.requestSubmit();
        } else {
            f?.submit();
        }
    });
    await page.waitForTimeout(2500);
    await page.goto(BASE + 'checkout/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('#fastcheckout-checkout', { timeout: 45_000 });
    await page.waitForFunction(() => typeof window.require === 'function', null, { timeout: 30_000 });
    await page.waitForTimeout(4000);
}

test('intentional uncheck of same-as-shipping sticks across payment components', async ({ page }) => {
    test.setTimeout(180_000);
    await addProductAndOpenCheckout(page);

    const result = await page.evaluate(async () => {
        const out = { error: null };

        const load = (deps) => new Promise((resolve, reject) => {
            require(deps, (...mods) => resolve(mods), (err) => reject(err || new Error('require fail')));
        });

        try {
            const [
                conv, selectShip, selectBill, quote, checkoutData,
                selectShipMethod, shippingService, setShipInfo, selectPay, registry
            ] = await load([
                'Magento_Checkout/js/model/address-converter',
                'Magento_Checkout/js/action/select-shipping-address',
                'Magento_Checkout/js/action/select-billing-address',
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/checkout-data',
                'Magento_Checkout/js/action/select-shipping-method',
                'Magento_Checkout/js/model/shipping-service',
                'Magento_Checkout/js/action/set-shipping-information',
                'Magento_Checkout/js/action/select-payment-method',
                'uiRegistry'
            ]);

            const shippingData = {
                email: 'same-as-shipping-uncheck@example.com',
                firstname: 'Jan',
                lastname: 'Kowalski',
                street: { 0: 'Testowa 1', 1: '' },
                city: 'Warszawa',
                postcode: '00-001',
                country_id: 'PL',
                region_id: '1024',
                region: 'mazowieckie',
                telephone: '500600700'
            };

            const shipping = conv.formAddressDataToQuoteAddress(shippingData);
            selectShip(shipping);
            selectBill(shipping);
            checkoutData.setShippingAddressFromData(shippingData);
            checkoutData.setBillingAddressFromData(shippingData);
            quote.guestEmail = shippingData.email;

            let rates = shippingService.getShippingRates()() || [];
            if (!rates.length) {
                await new Promise((r) => setTimeout(r, 2500));
                rates = shippingService.getShippingRates()() || [];
            }
            if (rates[0]) {
                selectShipMethod(rates[0]);
            }
            try {
                await setShipInfo();
            } catch (e) {
                // rates may still settle
            }
            await new Promise((r) => setTimeout(r, 1500));

            const radios = Array.from(document.querySelectorAll('input[name="payment_method"]'));
            if (radios[0]) {
                radios[0].click();
                selectPay({ method: radios[0].value });
            }
            await new Promise((r) => setTimeout(r, 1500));

            const comps = (registry.filter(function (c) {
                return c && typeof c.isAddressSameAsShipping === 'function';
            }) || []).filter(function (c) {
                return c.name !== 'fastcheckout.billingAddress';
            });

            const target = comps.find(function (c) {
                return typeof c.useShippingAddress === 'function';
            });
            if (!target) {
                out.error = 'no billing component';
                return out;
            }

            // Regression for a restored/stale quote billing address. A different address in
            // checkout-data is not shopper intent: until the checkbox is explicitly clicked,
            // Fastcheckout must recover the default and use the current shipping address.
            const staleBilling = conv.formAddressDataToQuoteAddress({
                firstname: 'Cached',
                lastname: 'Billing',
                street: { 0: 'Stara 99', 1: '' },
                city: 'Kraków',
                postcode: '30-001',
                country_id: 'PL',
                region_id: '1026',
                region: 'małopolskie',
                telephone: '500111222'
            });
            selectBill(staleBilling);
            target.isAddressSameAsShipping(false);

            if (typeof target._fastcheckoutApplySameAsShippingDefault === 'function') {
                target._fastcheckoutApplySameAsShippingDefault();
            } else {
                target.isAddressSameAsShipping(true);
            }
            await new Promise((r) => setTimeout(r, 100));

            const recoveredBilling = quote.billingAddress && quote.billingAddress();
            out.before = {
                same: !!target.isAddressSameAsShipping(),
                details: !!(target.isAddressDetailsVisible && target.isAddressDetailsVisible()),
                billing: !!recoveredBilling,
                billingFirstname: recoveredBilling && recoveredBilling.firstname,
                billingRegionId: recoveredBilling && (recoveredBilling.regionId || recoveredBilling.region_id)
            };

            // Magento KO: checked binding updates observable first, then click handler.
            target.isAddressSameAsShipping(false);
            target.useShippingAddress();
            await new Promise((r) => setTimeout(r, 500));

            out.afterImmediate = {
                same: !!target.isAddressSameAsShipping(),
                details: !!(target.isAddressDetailsVisible && target.isAddressDetailsVisible()),
                billing: !!(quote.billingAddress && quote.billingAddress())
            };

            // Allow Magento billingAddress / payment re-resolve subscribers to settle.
            await new Promise((r) => setTimeout(r, 1500));

            out.afterSettle = {
                same: !!target.isAddressSameAsShipping(),
                details: !!(target.isAddressDetailsVisible && target.isAddressDetailsVisible()),
                billing: !!(quote.billingAddress && quote.billingAddress()),
                allPaymentSame: comps.map(function (c) {
                    return {
                        name: c.name,
                        same: !!(c.isAddressSameAsShipping && c.isAddressSameAsShipping())
                    };
                })
            };
        } catch (e) {
            out.error = String(e && e.stack ? e.stack : e);
        }

        return out;
    });

    expect(result.error, JSON.stringify(result)).toBeNull();
    expect(result.before.same, JSON.stringify(result)).toBe(true);
    expect(result.before.billingFirstname, JSON.stringify(result)).toBe('Jan');
    expect(String(result.before.billingRegionId), JSON.stringify(result)).toBe('1024');
    expect(result.afterImmediate.same, JSON.stringify(result)).toBe(false);
    expect(result.afterImmediate.details, JSON.stringify(result)).toBe(false);
    expect(result.afterSettle.same, JSON.stringify(result)).toBe(false);
    expect(result.afterSettle.details, JSON.stringify(result)).toBe(false);
    // No payment renderer may re-check same-as-shipping after intentional uncheck.
    const rechecked = (result.afterSettle.allPaymentSame || []).filter((c) => c.same);
    expect(rechecked, JSON.stringify(result)).toEqual([]);
});

test('separate billing address survives checkout reload', async ({ page }) => {
    test.setTimeout(120_000);
    await addProductAndOpenCheckout(page);

    await page.evaluate(() => new Promise((resolve, reject) => {
        require([
            'Magento_Checkout/js/model/address-converter',
            'Magento_Checkout/js/action/select-shipping-address',
            'Magento_Checkout/js/action/select-billing-address',
            'Magento_Checkout/js/checkout-data'
        ], (converter, selectShippingAddress, selectBillingAddress, checkoutData) => {
            const shippingData = {
                firstname: 'Jan',
                lastname: 'Wysyłkowy',
                street: { 0: 'Testowa 1', 1: '' },
                city: 'Warszawa',
                postcode: '00-001',
                country_id: 'PL',
                region_id: '1024',
                region: 'mazowieckie',
                telephone: '500600700'
            };
            const billingData = {
                firstname: 'Anna',
                lastname: 'Zapamiętana',
                street: { 0: 'Rozliczeniowa 9', 1: '' },
                city: 'Kraków',
                postcode: '30-001',
                country_id: 'PL',
                region_id: '1023',
                region: 'małopolskie',
                telephone: '501502503'
            };

            selectShippingAddress(converter.formAddressDataToQuoteAddress(shippingData));
            selectBillingAddress(converter.formAddressDataToQuoteAddress(billingData));
            checkoutData.setSelectedBillingAddress('new-customer-billing-address');
            checkoutData.setBillingAddressFromData(billingData);
            checkoutData.setNewCustomerBillingAddress(billingData);
            resolve();
        }, reject);
    }));

    await page.reload({ waitUntil: 'domcontentloaded' });
    const target = page.locator('[data-fastcheckout-shared-billing-target]');
    await expect(target.locator('.checkout-billing-address')).toBeVisible({ timeout: 60_000 });
    await expect(target.locator('input[name="billing-address-same-as-shipping"]')).not.toBeChecked();

    const restored = await page.evaluate(() => new Promise((resolve, reject) => {
        require([
            'Magento_Checkout/js/checkout-data',
            'Magento_Checkout/js/model/quote'
        ], (checkoutData, quote) => {
            resolve({
                selected: checkoutData.getSelectedBillingAddress(),
                storedFirstname: checkoutData.getBillingAddressFromData()?.firstname,
                quoteFirstname: quote.billingAddress()?.firstname
            });
        }, reject);
    }));

    expect(restored).toEqual({
        selected: 'new-customer-billing-address',
        storedFirstname: 'Anna',
        quoteFirstname: 'Anna'
    });
    await expect(target.locator('.billing-address-details')).toContainText('Anna');
});
