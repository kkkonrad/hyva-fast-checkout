'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function wrapper() {
    return {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };
}

function load({active = true, twoStep = false, email = 'guest@example.com', method = {}} = {}) {
    let nativeCalls = 0;
    let shippingCalls = 0;
    const mixin = loadAmd('mixin/set-payment-information-extended-mixin.js', {
        jquery: {
            Deferred() {
                let reject;
                const promise = new Promise((resolve, onReject) => {
                    reject = onReject;
                });

                return {
                    reject() {
                        reject(new Error('checkout not ready'));
                        return this;
                    },
                    promise: () => promise
                };
            }
        },
        'mage/utils/wrapper': wrapper(),
        'Magento_Checkout/js/model/quote': {
            guestEmail: email,
            isVirtual: () => false,
            shippingMethod: () => method
        },
        'Magento_Customer/js/model/customer': {isLoggedIn: () => false},
        'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator': {
            ensureSaved() {
                shippingCalls += 1;
                return Promise.resolve();
            }
        },
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => active
    }, {
        window: {checkoutConfig: {fastcheckoutSettings: {twoStep}}}
    });
    const action = mixin((...args) => {
        nativeCalls += 1;
        return args;
    });

    return {action, nativeCalls: () => nativeCalls, shippingCalls: () => shippingCalls};
}

test('saves shipping once before delegating a ready one-step payment', async () => {
    const context = load();

    assert.deepEqual(
        await context.action('messages', {method: 'checkmo'}, true),
        ['messages', {method: 'checkmo'}, true]
    );
    assert.equal(context.shippingCalls(), 1);
    assert.equal(context.nativeCalls(), 1);
});

test('rejects immediately while guest email or shipping method is missing', async () => {
    for (const options of [{email: ''}, {method: null}]) {
        const context = load(options);

        await assert.rejects(context.action('messages', {}, false));
        assert.equal(context.shippingCalls(), 0);
        assert.equal(context.nativeCalls(), 0);
    }
});

test('delegates unchanged outside one-step Fastcheckout', async () => {
    for (const options of [{active: false, email: '', method: null}, {twoStep: true}]) {
        const context = load(options);

        assert.deepEqual(await context.action('messages', {}, false), ['messages', {}, false]);
        assert.equal(context.shippingCalls(), 0);
        assert.equal(context.nativeCalls(), 1);
    }
});
