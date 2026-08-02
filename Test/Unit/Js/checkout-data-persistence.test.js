/**
 * Regression coverage for separate billing persistence.
 *
 * Run: node Test/Unit/Js/checkout-data-persistence.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/checkout-data-persistence.js'),
    'utf8'
);
let createPersistence;

vm.runInNewContext(source, {
    define: function (dependencies, factory) {
        createPersistence = factory();
    },
    window: {
        checkoutConfig: { storeCode: 'default' },
        fastcheckoutOrderPlaced: false,
        localStorage: null
    }
});

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

const writes = [];
const checkoutData = {
    getSelectedBillingAddress: () => 'new-customer-billing-address',
    getNewCustomerBillingAddress: () => ({ firstname: 'Anna' }),
    setBillingAddressFromData: (value) => writes.push(['form', value.firstname]),
    setNewCustomerBillingAddress: (value) => writes.push(['new', value.firstname])
};
const persistence = createPersistence({
    checkoutData,
    quote: { shippingAddress: () => ({ firstname: 'Jan' }) },
    normalizeAddress: (address) => address,
    addressesMatch: (left, right) => left.firstname === right.firstname
});

assert(
    persistence.persistAddress({ firstname: 'Jan' }, 'billing') === false,
    'Transient shipping-as-billing must not replace a separate billing address'
);
assert(writes.length === 0, 'Transient billing state must not reach checkout-data');
assert(
    persistence.persistAddress({ firstname: 'Ewa' }, 'billing') === true,
    'A genuinely separate billing address must be persisted'
);
assert(JSON.stringify(writes) === JSON.stringify([['form', 'Ewa'], ['new', 'Ewa']]), 'Billing writes mismatch');

console.log('checkout data persistence: OK');
