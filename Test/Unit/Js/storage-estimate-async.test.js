/**
 * Regression coverage for persistent-quote rate estimation.
 *
 * Run: node Test/Unit/Js/storage-estimate-async.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/mixin/storage-mixin.js'),
    'utf8'
);
let createStorageMixin;
let fastcheckoutActive = true;

const wrapper = {
    wrap: function (original, callback) {
        return function () {
            return callback.apply(this, [original].concat(Array.prototype.slice.call(arguments)));
        };
    }
};

vm.runInNewContext(source, {
    define: function (dependencies, factory) {
        createStorageMixin = factory(
            function () {},
            wrapper,
            function () {
                return fastcheckoutActive;
            }
        );
    }
});

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

function createRequest() {
    const callbacks = [];

    return {
        always: function (callback) {
            callbacks.push(callback);
            return this;
        },
        settle: function () {
            callbacks.splice(0).forEach((callback) => callback());
        }
    };
}

const calls = [];
const storage = createStorageMixin({
    post: function () {
        const request = createRequest();

        calls.push({ args: Array.prototype.slice.call(arguments), request });

        return request;
    }
});

const firstEstimate = storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    JSON.stringify({
        address: {
            country_id: 'PL',
            region_id: 1024,
            postcode: '00-001',
            city: 'Warszawa',
            street: ['Testowa 1', ''],
            custom_attributes: []
        }
    }),
    false,
    'application/json',
    {},
    false
);
assert(calls[0].args[5] === true, 'Fastcheckout estimate must override synchronous XHR');

const duplicateEstimate = storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    JSON.stringify({
        address: {
            country_id: 'PL',
            region_id: 1024,
            postcode: '00-001',
            city: 'Warszawa',
            street: ['Testowa 1', ''],
            email: 'customer@example.com'
        }
    }),
    false,
    'application/json',
    {},
    false
);
assert(duplicateEstimate === firstEstimate, 'Concurrent estimate for the same destination must reuse its XHR');
assert(calls.length === 1, 'Concurrent duplicate estimate must not make another request');

firstEstimate.settle();
storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    JSON.stringify({
        address: {
            country_id: 'PL',
            region_id: 1024,
            postcode: '00-001',
            city: 'Warszawa',
            street: ['Testowa 1', '']
        }
    }),
    false,
    'application/json',
    {},
    false
);
assert(calls.length === 2, 'Settled estimate must not block a later refresh');

storage.post(
    'rest/default/V1/guest-carts/test/shipping-information',
    '{}',
    false,
    'application/json',
    {},
    false
);
assert(calls[2].args[5] === false, 'Unrelated request mode must stay unchanged');

fastcheckoutActive = false;
storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    '{}',
    false,
    'application/json',
    {},
    false
);
assert(calls[3].args[5] === false, 'Standard checkout behavior must stay unchanged');

console.log('ALL PASS: Fastcheckout estimate requests are asynchronous and deduplicated while pending');
