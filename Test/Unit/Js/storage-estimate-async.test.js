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

const calls = [];
const storage = createStorageMixin({
    post: function () {
        calls.push(Array.prototype.slice.call(arguments));

        return {};
    }
});

storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    '{}',
    false,
    'application/json',
    {},
    false
);
assert(calls[0][5] === true, 'Fastcheckout estimate must override synchronous XHR');

storage.post(
    'rest/default/V1/guest-carts/test/shipping-information',
    '{}',
    false,
    'application/json',
    {},
    false
);
assert(calls[1][5] === false, 'Unrelated request mode must stay unchanged');

fastcheckoutActive = false;
storage.post(
    'rest/default/V1/guest-carts/test/estimate-shipping-methods',
    '{}',
    false,
    'application/json',
    {},
    false
);
assert(calls[2][5] === false, 'Standard checkout behavior must stay unchanged');

console.log('ALL PASS: Fastcheckout estimate-shipping-methods always uses async XHR');
