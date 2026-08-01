'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

let createBridge;
const mounted = [];
const children = {
    'payu_gateway-form': {component: 'Magento_Checkout/js/view/billing-address'},
    'payu_gateway_card-form': {component: 'Magento_Checkout/js/view/billing-address'},
    'mollie_methods_ideal-form': {component: 'Magento_Checkout/js/view/billing-address'},
    'mollie-save-payment-method': {component: 'Mollie_Payment/js/view/save-payment-method'},
    'braintree-form': {component: 'Magento_Checkout/js/view/billing-address'}
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/checkout-layout-bridge.js'),
        'utf8'
    ),
    {
        define: (deps, factory) => {
            createBridge = factory({extend: (deep, target, value) => clone(value)});
        },
        JSON,
        Object,
        String
    }
);

const bridge = createBridge({
    config: {paymentListChildren: children},
    registry: {get: name => name === 'fastcheckoutHyvaPaymentRenderers.paymentList' ? {} : null},
    layout: selected => mounted.push(selected)
});

bridge.activateDeferredPaymentListChildren(
    'payu_gateway_card',
    'PayU_PaymentGateway/js/view/payment/payu_gateway'
);
assert.deepStrictEqual(
    Object.keys(mounted[0]).sort(),
    ['payu_gateway_card-form'],
    'PayU Cards must not initialize other gateways or the sibling PayU method'
);

bridge.activateDeferredPaymentListChildren(
    'mollie_methods_ideal',
    'Mollie_Payment/js/view/payment/mollie-payment'
);
assert.deepStrictEqual(
    Object.keys(mounted[1]).sort(),
    ['mollie-save-payment-method', 'mollie_methods_ideal-form'],
    'a later gateway must remain deferred and retain its provider helper'
);

bridge.activateDeferredPaymentListChildren('opaque', 'Acme_Payment/js/view/payment');
assert.deepStrictEqual(
    Object.keys(mounted[2]).sort(),
    ['braintree-form', 'payu_gateway-form'],
    'an unknown gateway must retain the compatible load-all fallback'
);

console.log('checkout layout bridge: OK');
