'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('defers guest payment information until native checkout prerequisites are ready', async () => {
    let mixin,
        loggedIn = false,
        active = true,
        calls = 0,
        captured;
    const listeners = {};
    const quote = {guestEmail: null, isVirtual: () => false};
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../../view/frontend/web/js/mixin/set-payment-information-extended-mixin.js'
    ), 'utf8');
    const jquery = {
        Deferred() {
            let resolve,
                reject;
            const promise = new Promise((onResolve, onReject) => {
                resolve = onResolve;
                reject = onReject;
            });

            return {resolve, reject, promise: () => promise};
        },
        when: (value) => Promise.resolve(value)
    };
    const wrapper = {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };

    vm.runInNewContext(source, {
        window: {setTimeout: (callback) => callback()},
        document: {
            addEventListener(name, callback) {
                listeners[name] = callback;
            }
        },
        define(dependencies, factory) {
            mixin = factory(
                jquery,
                wrapper,
                quote,
                {isLoggedIn: () => loggedIn},
                () => active
            );
        }
    });

    const action = mixin((...args) => {
        calls += 1;
        captured = args;
        return Promise.resolve('saved');
    });
    const pending = action({scope: 'discount'}, {method: 'purchaseorder'}, true);

    assert.equal(calls, 0);
    listeners.input({target: {id: 'another-field'}});
    assert.equal(calls, 0);

    quote.guestEmail = 'guest@example.com';
    listeners.input({target: {id: 'customer-email'}});
    assert.equal(calls, 0);
    listeners['fastcheckout:shipping-information-saved']();

    assert.equal(await pending, 'saved');
    assert.equal(calls, 1);
    assert.equal(captured[1].method, 'purchaseorder');
    assert.equal(captured[2], true);

    quote.guestEmail = null;
    loggedIn = true;
    await action({}, {method: 'checkmo'}, true);
    active = false;
    loggedIn = false;
    await action({}, {method: 'banktransfer'}, true);
    assert.equal(calls, 3);
});
