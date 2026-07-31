'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const sandbox = {
    window: {Proxy},
    document: {querySelector: () => null},
    Object,
    Proxy
};

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/requirejs-base.js'),
        'utf8'
    ),
    sandbox
);

const initPaymentProxy = sandbox.window.fastcheckoutInitPaymentProxy;
const paymentMethods = [{code: 'checkmo', title: 'Check / Money order'}, {method: 'tpay'}];

// A renderer for an offered method may read a config bag that the server left out.
// (Objects created inside the vm sandbox live in another realm, so compare shape.)
const isEmptyBag = value => value !== null
    && typeof value === 'object'
    && Object.keys(value).length === 0;

const payment = initPaymentProxy({braintree: {clientToken: 'abc'}}, paymentMethods);
assert.ok(isEmptyBag(payment.checkmo), 'known method code must get an empty config bag');
assert.ok(isEmptyBag(payment.tpay), 'method codes may arrive under either key');
assert.strictEqual(payment.braintree.clientToken, 'abc', 'existing config must survive');

// Feature checks against unknown keys must behave like the native checkout.
assert.strictEqual(payment.paypal, undefined, 'unknown key must stay undefined');
assert.ok(!payment.somethingElse, 'unknown key must not be truthy');

// Reading unknown keys must not pollute the object.
JSON.stringify(payment);
payment.anotherUnknownOne;
assert.deepStrictEqual(
    Object.keys(payment.__raw__).sort(),
    ['braintree', 'checkmo', 'tpay'],
    'only whitelisted codes may be written to the target'
);

// Wrapping twice must not stack proxies.
assert.strictEqual(initPaymentProxy(payment, paymentMethods), payment, 'must not re-wrap a proxy');

console.log('payment config proxy: OK');
