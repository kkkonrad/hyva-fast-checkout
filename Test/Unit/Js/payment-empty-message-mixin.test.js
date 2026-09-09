'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

test('only asks for shipping when filtered physical checkout has no shipping selection', () => {
    for (const filtering of [false, true]) {
        for (const virtual of [false, true]) {
            let shipping = null;
            const mixin = loadAmd('mixin/payment-empty-message-mixin.js', {
                'Magento_Checkout/js/model/quote': {
                    isVirtual: () => virtual,
                    shippingMethod: () => shipping
                },
                'mage/translate': text => text
            }, {
                window: {checkoutConfig: {fastcheckoutSettings: {paymentFilteringEnabled: filtering}}}
            });
            const component = mixin({extend: methods => methods});
            assert.equal(component.getEmptyPaymentMessage(), filtering && !virtual
                ? 'Select a shipping method to see the available payment methods.'
                : 'No Payment method available.');
            shipping = {carrier_code: 'flatrate', method_code: 'flatrate'};
            assert.equal(component.getEmptyPaymentMessage(), 'No Payment method available.');
        }
    }
});
