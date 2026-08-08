'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadMixin(mapping, shippingMethod) {
    let factoryResult;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/payment-service-mixin.js'),
        'utf8'
    );
    const wrapper = {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };
    const quote = {
        shippingMethod: () => shippingMethod,
        isVirtual: () => false
    };

    vm.runInNewContext(source, {
        window: {
            checkoutConfig: {
                fastcheckoutSettings: {shippingPaymentMapping: mapping}
            }
        },
        document: {body: {classList: {contains: () => true}}},
        define(dependencies, factory) {
            factoryResult = factory(wrapper, quote, () => true);
        }
    });

    return factoryResult;
}

test('filters by shipping mapping and delegates once without cloning method metadata', () => {
    const card = {method: 'stripe', renderer: {token: 'kept'}};
    const transfer = {method: 'banktransfer', extra: 'kept'};
    let calls = 0;
    let received;
    const service = {
        setPaymentMethods(methods) {
            calls += 1;
            received = methods;
            return 'native-result';
        }
    };

    loadMixin([
        {shipping_method: 'flatrate_*', payment_method: 'stripe'}
    ], {carrier_code: 'flatrate', method_code: 'flatrate'})(service);

    assert.equal(service.setPaymentMethods([card, transfer]), 'native-result');
    assert.equal(calls, 1);
    assert.deepEqual(received, [card]);
    assert.equal(received[0], card);
});

test('passes the original list through when no mapping is configured', () => {
    const methods = [{method: 'stripe'}, {method: 'checkmo'}];
    let received;
    const service = {
        setPaymentMethods(value) {
            received = value;
        }
    };

    loadMixin([], {carrier_code: 'flatrate', method_code: 'flatrate'})(service);
    service.setPaymentMethods(methods);

    assert.equal(received, methods);
});
