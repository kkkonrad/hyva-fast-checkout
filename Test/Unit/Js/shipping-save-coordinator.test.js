'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function deferred() {
    let resolve,
        reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });

    promise.done = (callback) => {
        promise.then(callback);
        return promise;
    };
    promise.fail = (callback) => {
        promise.catch(callback);
        return promise;
    };
    promise.then = promise.then.bind(promise);

    return {promise, resolve, reject};
}

test('shares an in-flight native shipping save and saves again only after quote changes', async () => {
    const requests = [];
    const quote = {
        shippingAddress: () => ({firstname: quote.firstname, street: ['Testowa 1']}),
        billingAddress: () => null,
        shippingMethod: () => ({carrier_code: 'flatrate', method_code: 'flatrate'}),
        isVirtual: () => false,
        firstname: 'Jan'
    };
    const jquery = {
        Deferred() {
            const value = deferred();
            const api = {
                resolve() {
                    value.resolve.apply(null, arguments);
                    return api;
                },
                reject() {
                    value.reject.apply(null, arguments);
                    return api;
                },
                promise: () => value.promise
            };

            return api;
        },
        when: (value) => value
    };
    const ko = {
        unwrap: (value) => value,
        toJS: (value) => value
    };

    const coordinator = loadAmd('model/shipping-save-coordinator.js', {
        jquery,
        ko,
        'Magento_Checkout/js/model/quote': quote
    }, {
        require(dependencies, onLoad) {
            assert.deepEqual(Array.from(dependencies), [
                'Magento_Checkout/js/action/set-shipping-information'
            ]);
            onLoad(() => {
                const request = deferred();

                requests.push(request);
                return request.promise;
            });
        }
    });

    const first = coordinator.ensureSaved();
    const shared = coordinator.ensureSaved();

    await Promise.resolve();
    assert.equal(requests.length, 1);
    requests[0].resolve();
    await Promise.all([first, shared]);

    await coordinator.ensureSaved();
    assert.equal(requests.length, 1);

    quote.firstname = 'Anna';
    const changed = coordinator.ensureSaved();

    await Promise.resolve();
    assert.equal(requests.length, 2);
    requests[1].resolve();
    await changed;
});
