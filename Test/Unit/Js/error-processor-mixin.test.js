'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function loadMixin(active = true, invalidate = () => {}) {
    const wrapper = {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };

    return loadAmd('mixin/error-processor-mixin.js', {
        'mage/utils/wrapper': wrapper,
        'Magento_Customer/js/customer-data': {invalidate},
        'mage/url': {build: (route) => `https://shop.test/${route}`},
        'mage/translate': (message) => message ===
            'Current customer does not have an active cart.'
            ? 'Aktualny klient nie ma aktywnego koszyka.'
            : message,
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => active
    });
}

test('redirects missing or unauthorized Magento quotes to the native empty cart', () => {
    const invalidations = [];
    const redirects = [];
    let nativeCalls = 0;
    const processor = {
        process() {
            nativeCalls += 1;
        },
        redirectTo(route) {
            redirects.push(route);
        }
    };

    loadMixin(true, (sections) => invalidations.push(Array.from(sections)))(processor);
    processor.process({
        status: 404,
        responseJSON: {
            message: 'No such entity with %fieldName = %fieldValue',
            parameters: {fieldName: 'cartId'}
        }
    });
    processor.process({
        status: 401,
        responseJSON: {
            message: "The consumer isn't authorized to access %resources.",
            parameters: {resources: 'self'}
        }
    });

    assert.equal(nativeCalls, 0);
    assert.deepEqual(invalidations, [
        ['cart', 'checkout-data'],
        ['cart', 'checkout-data']
    ]);
    assert.deepEqual(redirects, [
        'https://shop.test/checkout/cart/',
        'https://shop.test/checkout/cart/'
    ]);
});

test('delegates ordinary checkout errors and recovers even from damaged customer-data storage', () => {
    const redirects = [];
    const delegated = [];
    const processor = {
        process(response, container) {
            delegated.push([response, container]);
            return 'native-result';
        },
        redirectTo(route) {
            redirects.push(route);
        }
    };
    const mixin = loadMixin(true, () => {
        throw new Error('broken storage');
    });

    mixin(processor);
    assert.equal(processor.process({status: 400, responseJSON: {message: 'Invalid card'}}, 'messages'),
        'native-result');
    processor.process({
        status: 404,
        responseJSON: {message: 'Aktualny klient nie ma aktywnego koszyka.'}
    });

    assert.equal(delegated.length, 1);
    assert.deepEqual(redirects, ['https://shop.test/checkout/cart/']);
});
