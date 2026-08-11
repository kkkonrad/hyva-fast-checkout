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
    let fail;
    const events = [];
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
        }
    };

    vm.runInNewContext(source, {
        document: {
            dispatchEvent(event) {
                events.push(event.type);
            },
            getElementById(id) {
                return id === 'fastcheckout-comment'
                    ? {value: '  Leave at reception  '}
                    : null;
            },
            querySelector() {
                return {checked: true};
            }
        },
        Event: class Event {
            constructor(type) {
                this.type = type;
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
                () => true
            );
        }
    });

    const action = mixin((paymentData) => {
        calls += 1;
        captured = paymentData;
        return {
            fail(callback) {
                fail = callback;
                return this;
            }
        };
    });
    const paymentData = {method: 'stripe', additional_data: {token: 'preserved'}};

    const result = action(paymentData, {});

    assert.equal(typeof result.fail, 'function');
    assert.equal(calls, 1);
    assert.equal(shippingCalls, 1);
    assert.equal(captured.additional_data.token, 'preserved');
    assert.equal(captured.additional_data.fastcheckout_comment, 'Leave at reception');
    assert.equal(captured.additional_data.fastcheckout_subscribe, '1');
    assert.equal(captured.extension_attributes.comment, 'Leave at reception');
    assert.equal(captured.extension_attributes.subscribe, true);
    assert.deepEqual(events, ['fastcheckout:order-submit-started']);
    fail();
    assert.deepEqual(events, [
        'fastcheckout:order-submit-started',
        'fastcheckout:order-submit-failed'
    ]);

});
