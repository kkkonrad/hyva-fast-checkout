'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../../view/frontend/web/js/model/shipping-save-coordinator.js'
    ), 'utf8');
    const requests = [];
    const quote = {
        shippingAddress: () => ({firstname: quote.firstname, street: ['Testowa 1']}),
        billingAddress: () => null,
        shippingMethod: () => ({carrier_code: 'flatrate', method_code: 'flatrate'}),
        isVirtual: () => false,
        firstname: 'Jan'
    };
    let coordinator;
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

    vm.runInNewContext(source, {
        require(dependencies, onLoad) {
            onLoad(() => {
                const request = deferred();

                requests.push(request);
                return request.promise;
            });
        },
        define(dependencies, factory) {
            assert.equal(dependencies.includes(
                'Magento_Checkout/js/action/set-shipping-information'
            ), false);
            coordinator = factory(jquery, ko, quote);
        }
    });

    const first = coordinator.ensureSaved();
    const shared = coordinator.ensureSaved();

    await Promise.resolve();
    assert.equal(requests.length, 1);
    requests[0].resolve();
    await Promise.all([first, shared]);
    assert.equal(coordinator.isSaved(), true);

    await coordinator.ensureSaved();
    assert.equal(requests.length, 1);

    quote.firstname = 'Anna';
    const changed = coordinator.ensureSaved();

    await Promise.resolve();
    assert.equal(requests.length, 2);
    requests[1].resolve();
    await changed;
    assert.equal(coordinator.isSaved(), true);
});
