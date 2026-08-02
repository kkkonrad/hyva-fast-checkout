/**
 * Regression coverage for slow payment renderer selection.
 *
 * Run: node Test/Unit/Js/payment-method-sync.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-method-sync.js'),
    'utf8'
);
let createSync;
let now = 1000;

vm.runInNewContext(source, {
    define: function (dependencies, factory) {
        createSync = factory();
    },
    Date: { now: () => now }
});

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

const sync = createSync({
    quote: { paymentMethod: () => ({ method: 'payu_gateway_card' }) }
});

sync.rememberUserPaymentSelection('payu_gateway_card');
now += 60_000;
assert(
    sync.shouldAcceptPaymentSelection({ method: 'purchaseorder' }) === false,
    'A late renderer callback must not replace the user-selected PayU method'
);
sync.clearUserPaymentSelection();
assert(
    sync.shouldAcceptPaymentSelection({ method: 'purchaseorder' }) === true,
    'A shipping remap must release the user selection lock'
);

console.log('payment method sync: OK');
