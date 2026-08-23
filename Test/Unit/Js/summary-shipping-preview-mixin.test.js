'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadPreview({processed = false, tax = false, twoStep = true} = {}) {
    let mixin;
    let nativeCalls = 0;
    let totalsCalls = 0;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/summary-shipping-preview-mixin.js'),
        'utf8'
    );
    const Component = function () {};

    if (tax) {
        Component.prototype.getIncludingValue = function () {};
        Component.prototype.getExcludingValue = function () {};
    }
    Component.extend = (methods) => methods;

    vm.runInNewContext(source, {
        window: {checkoutConfig: {fastcheckoutSettings: {twoStep}}},
        define(dependencies, factory) {
            mixin = factory(
                {shippingMethod: () => ({amount: 5, price_excl_tax: 5, price_incl_tax: 6})},
                {isProcessed: () => processed},
                () => true
            );
        }
    });

    const extension = mixin(Component);
    const context = {
        totals() {
            totalsCalls += 1;

            return {shipping_amount: 0};
        },
        getFormattedPrice: (value) => `price:${value}`,
        _super() {
            nativeCalls += 1;

            return 'native';
        }
    };

    return {context, extension, nativeCalls: () => nativeCalls, totalsCalls: () => totalsCalls};
}

test('previews the selected native rate only on the two-step shipping step', () => {
    const core = loadPreview();
    const tax = loadPreview({tax: true});
    const payment = loadPreview({processed: true});
    const oneStep = loadPreview({twoStep: false});

    assert.equal(core.extension.getValue.call(core.context), 'price:5');
    assert.equal(tax.extension.getIncludingValue.call(tax.context), 'price:6');
    assert.equal(tax.extension.getExcludingValue.call(tax.context), 'price:5');
    assert.equal(payment.extension.getValue.call(payment.context), 'native');
    assert.equal(oneStep.extension.getValue.call(oneStep.context), 'native');
    assert.equal(core.nativeCalls(), 0);
    assert.equal(payment.nativeCalls(), 1);
    assert.equal(oneStep.nativeCalls(), 1);
    assert.equal(core.totalsCalls(), 1);
});
