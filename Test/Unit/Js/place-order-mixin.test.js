'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

test('adds checkout extras and invokes Magento place-order exactly once', () => {
    let calls = 0;
    let shippingCalls = 0;
    let captured;
    let fail;
    const events = [];
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

    const mixin = loadAmd('mixin/place-order-mixin.js', {
        jquery,
        'mage/utils/wrapper': wrapper,
        'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator': {
            ensureSaved() {
                shippingCalls += 1;
                return {};
            }
        },
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => true,
        uiRegistry: {
            get(name) {
                assert.equal(name, 'checkoutProvider');

                return {
                    get(path) {
                        assert.equal(path, 'fastcheckout');

                        return {comment: '  Leave at reception  ', subscribe: true};
                    }
                };
            }
        }
    }, {
        document: {
            dispatchEvent(event) {
                events.push(event.type);
            }
        },
        Event: class Event {
            constructor(type) {
                this.type = type;
            }
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
    assert.equal(captured.additional_data.fastcheckout_comment, undefined);
    assert.equal(captured.additional_data.fastcheckout_subscribe, undefined);
    assert.equal(captured.extension_attributes.comment, 'Leave at reception');
    assert.equal(captured.extension_attributes.subscribe, true);
    assert.deepEqual(events, ['fastcheckout:order-submit-started']);
    fail();
    assert.deepEqual(events, [
        'fastcheckout:order-submit-started',
        'fastcheckout:order-submit-failed'
    ]);

});
