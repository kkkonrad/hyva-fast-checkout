'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('adds checkout extras and invokes Magento place-order exactly once', () => {
    let mixin;
    let calls = 0;
    let shippingCalls = 0;
    let captured;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/place-order-mixin.js'),
        'utf8'
    );
    const wrapper = {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };
    const jquery = {
        when() {
            return {
                then(callback) {
                    return callback();
                }
            };
        },
        Deferred() {
            return {
                reject() {
                    return this;
                },
                promise() {
                    return this;
                }
            };
        }
    };

    vm.runInNewContext(source, {
        document: {
            getElementById(id) {
                return id === 'fastcheckout-comment'
                    ? {value: '  Leave at reception  '}
                    : {checked: true};
            }
        },
        define(dependencies, factory) {
            mixin = factory(
                jquery,
                wrapper,
                {isVirtual: () => false},
                () => {
                    shippingCalls += 1;
                    return {};
                },
                {get: () => ({validateShippingInformation: () => true})},
                () => true
            );
        }
    });

    const action = mixin((paymentData) => {
        calls += 1;
        captured = paymentData;
        return 'native-result';
    });
    const paymentData = {method: 'stripe', additional_data: {token: 'preserved'}};

    assert.equal(action(paymentData, {}), 'native-result');
    assert.equal(calls, 1);
    assert.equal(shippingCalls, 1);
    assert.equal(captured.additional_data.token, 'preserved');
    assert.equal(captured.additional_data.fastcheckout_comment, 'Leave at reception');
    assert.equal(captured.additional_data.fastcheckout_subscribe, '1');
    assert.equal(captured.extension_attributes.comment, 'Leave at reception');
    assert.equal(captured.extension_attributes.subscribe, true);
});
