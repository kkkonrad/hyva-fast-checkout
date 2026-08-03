/**
 * Magento tax shipping display helper (shipped shipping-price-display.js).
 *
 * Run: node Test/Unit/Js/shipping-price-display.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

let api;
vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/shipping-price-display.js'),
        'utf8'
    ),
    {
        define: function (deps, factory) {
            api = factory();
        }
    }
);

const method = {
    amount: 10,
    price_excl_tax: 10,
    price_incl_tax: 12.3
};

let d = api.getShippingDisplayPrices(method, {
    isDisplayShippingPriceExclTax: true,
    isDisplayShippingBothPrices: false
});
assert.strictEqual(d.primary, 10, 'excl-only primary is excl');
assert.strictEqual(d.showSecondary, false, 'excl-only has no secondary');

d = api.getShippingDisplayPrices(method, {
    isDisplayShippingPriceExclTax: false,
    isDisplayShippingBothPrices: false
});
assert.strictEqual(d.primary, 12.3, 'incl-only primary is incl');
assert.strictEqual(d.showSecondary, false);

d = api.getShippingDisplayPrices(method, {
    isDisplayShippingPriceExclTax: false,
    isDisplayShippingBothPrices: true
});
assert.strictEqual(d.primary, 12.3, 'both: primary is incl (Magento price.html)');
assert.strictEqual(d.showSecondary, true, 'both shows excl secondary');
assert.strictEqual(d.secondary, 10);

// Hard-coded amount-only must not win when Magento flags request incl.
d = api.getShippingDisplayPrices(
    { amount: 10, price_excl_tax: 10, price_incl_tax: 12.3 },
    { isDisplayShippingPriceExclTax: false, isDisplayShippingBothPrices: false }
);
assert.notStrictEqual(d.primary, 10, 'must not always use amount when incl is configured');
assert.strictEqual(d.primary, 12.3);

// Missing tax fields fall back to amount.
d = api.getShippingDisplayPrices(
    { amount: 7 },
    { isDisplayShippingPriceExclTax: true, isDisplayShippingBothPrices: false }
);
assert.strictEqual(d.primary, 7);

console.log('shipping price display: OK');
