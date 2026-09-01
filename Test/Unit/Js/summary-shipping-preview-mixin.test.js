'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function loadPreview({processed = false, tax = false, twoStep = true} = {}) {
    let nativeCalls = 0;
    let totalsCalls = 0;
    const Component = function () {};

    Component.prototype.getValue = function () {
        nativeCalls += 1;

        return 'native';
    };
    if (tax) {
        Component.prototype.getIncludingValue = Component.prototype.getValue;
        Component.prototype.getExcludingValue = Component.prototype.getValue;
    }
    Component.extend = (methods) => Object.fromEntries(Object.entries(methods).map(([name, method]) => [
        name,
        /\b_super\b/.test(method) ? function (...args) {
            const previous = this._super;

            this._super = (...superArgs) => Component.prototype[name].apply(
                this,
                superArgs.length ? superArgs : args
            );
            try {
                return method.apply(this, args);
            } finally {
                this._super = previous;
            }
        } : method
    ]));

    const mixin = loadAmd('mixin/summary-shipping-preview-mixin.js', {
        'Magento_Checkout/js/model/quote': {
            shippingMethod: () => ({amount: 5, price_excl_tax: 5, price_incl_tax: 6})
        },
        'Magento_Checkout/js/model/step-navigator': {isProcessed: () => processed},
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => true
    }, {
        window: {checkoutConfig: {fastcheckoutSettings: {twoStep}}},
    });

    const extension = mixin(Component);
    const context = {
        totals() {
            totalsCalls += 1;

            return {shipping_amount: 0};
        },
        getFormattedPrice: (value) => `price:${value}`
    };

    return {context, extension, nativeCalls: () => nativeCalls, totalsCalls: () => totalsCalls};
}

test('previews the selected native rate only on the two-step shipping step', () => {
    const core = loadPreview();
    const tax = loadPreview({tax: true});
    const payment = loadPreview({processed: true});
    const oneStep = loadPreview({twoStep: false});
    const oneStepTax = loadPreview({tax: true, twoStep: false});

    assert.equal(core.extension.getValue.call(core.context), 'price:5');
    assert.equal(tax.extension.getIncludingValue.call(tax.context), 'price:6');
    assert.equal(tax.extension.getExcludingValue.call(tax.context), 'price:5');
    assert.equal(payment.extension.getValue.call(payment.context), 'native');
    assert.equal(oneStep.extension.getValue.call(oneStep.context), 'native');
    assert.equal(oneStepTax.extension.getExcludingValue.call(oneStepTax.context), 'native');
    assert.equal(core.nativeCalls(), 0);
    assert.equal(payment.nativeCalls(), 1);
    assert.equal(oneStep.nativeCalls(), 1);
    assert.equal(oneStepTax.nativeCalls(), 1);
    assert.equal(core.totalsCalls(), 1);
});
