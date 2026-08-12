'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function observable(initial) {
    let value = initial;
    const subscribers = [];
    const result = function (next) {
        if (!arguments.length) {
            return value;
        }
        value = next;
        subscribers.slice().forEach((callback) => callback(value));
    };

    result.subscribe = (callback) => {
        subscribers.push(callback);
        return {
            dispose() {
                const index = subscribers.indexOf(callback);

                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
            }
        };
    };

    return result;
}

test('waits on native email and the shared shipping save without replacing payment calls', async () => {
    let mixin,
        active = true,
        calls = 0,
        shippingCalls = 0;
    const email = observable('');
    const shippingMethod = observable(null);
    const quote = {
        guestEmail: null,
        shippingMethod,
        isVirtual: () => false
    };
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
            const api = {
                resolve() {
                    resolve.apply(null, arguments);
                    return api;
                },
                reject() {
                    reject.apply(null, arguments);
                    return api;
                },
                promise: () => promise
            };

            return api;
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
    const registry = {
        async(name) {
            return (callback) => {
                if (name.endsWith('customer-email')) {
                    callback({email});
                }
            };
        }
    };

    vm.runInNewContext(source, {
        window: {
            setTimeout(callback, delay) {
                if (!delay) {
                    callback();
                    return 0;
                }

                return 1;
            },
            clearTimeout() {}
        },
        define(dependencies, factory) {
            mixin = factory(
                jquery,
                wrapper,
                quote,
                {isLoggedIn: () => false},
                {
                    ensureSaved() {
                        shippingCalls += 1;
                        return Promise.resolve();
                    }
                },
                () => active,
                registry
            );
        }
    });

    const action = mixin((...args) => {
        calls += 1;
        return Promise.resolve(args[1].method);
    });
    const pending = action({scope: 'discount'}, {method: 'purchaseorder'}, true);

    assert.equal(calls, 0);
    quote.guestEmail = 'guest@example.com';
    email('guest@example.com');
    await Promise.resolve();
    assert.equal(calls, 0);

    shippingMethod({carrier_code: 'flatrate', method_code: 'flatrate'});
    assert.equal(await pending, 'purchaseorder');
    assert.equal(shippingCalls, 1);
    assert.equal(calls, 1);

    active = false;
    assert.equal(await action({}, {method: 'checkmo'}, true), 'checkmo');
    assert.equal(calls, 2);
});

test('does not hang set-payment-information when shipping method never arrives', async () => {
    let mixin,
        delayed;
    const email = observable('guest@example.com');
    const shippingMethod = observable(null);
    const quote = {
        guestEmail: 'guest@example.com',
        shippingMethod,
        isVirtual: () => false
    };
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
            const api = {
                resolve() {
                    resolve.apply(null, arguments);
                    return api;
                },
                reject() {
                    reject.apply(null, arguments);
                    return api;
                },
                promise: () => promise
            };

            return api;
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
        window: {
            setTimeout(callback, delay) {
                if (!delay) {
                    callback();
                    return 0;
                }
                delayed = callback;
                return 1;
            },
            clearTimeout() {}
        },
        define(dependencies, factory) {
            mixin = factory(
                jquery,
                wrapper,
                quote,
                {isLoggedIn: () => false},
                {
                    ensureSaved() {
                        throw new Error('shipping must not be saved without a method');
                    }
                },
                () => true,
                {
                    async() {
                        return (callback) => callback({email});
                    }
                }
            );
        }
    });

    const pending = mixin(() => Promise.resolve('continued'))({}, {method: 'stripe'}, true);

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(typeof delayed, 'function');
    delayed();
    assert.equal(await pending, 'continued');
});
