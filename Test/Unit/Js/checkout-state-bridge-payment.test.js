/**
 * Payment methods source-of-truth: Magento method-list / config, never DOM→service.
 *
 * Run: node Test/Unit/Js/checkout-state-bridge-payment.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

function loadFactory(methodListFn) {
    let factory;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/checkout-state-bridge.js'),
        'utf8'
    );
    const win = {
        setTimeout: function (fn) {
            if (typeof fn === 'function') {
                fn();
            }
            return 0;
        },
        checkoutConfig: {}
    };

    vm.runInNewContext(source, {
        define: function (deps, factoryFn) {
            // deps: ['Magento_Checkout/js/model/payment/method-list']
            factory = factoryFn(methodListFn);
        },
        window: win,
        require: function () {}
    });

    return factory;
}

// --- method-list is source of truth; DOM is ignored for setPaymentMethods ---
(function () {
    let methodListData = [
        { method: 'payu_gateway_card', title: 'PayU Card' },
        { method: 'checkmo', title: 'Check' }
    ];
    const methodList = function () {
        return methodListData;
    };
    methodList.subscribe = function () {};

    const setCalls = [];
    const domSyncCalls = [];
    let quoteMethod = { method: 'checkmo' };

    const bridge = loadFactory(methodList)({
        config: {
            paymentMethods: [{ method: 'stale_dom_only', title: 'Should not win' }]
        },
        paymentService: {
            setPaymentMethods: function (methods) {
                setCalls.push(methods);
            }
        },
        methodConverter: function (raw) {
            return raw;
        },
        quote: {
            paymentMethod: function () {
                return quoteMethod;
            }
        },
        shippingService: {
            setShippingRates: function () {},
            getShippingRates: function () {
                return function () {
                    return [];
                };
            }
        },
        callbacks: {
            syncQuoteCustomerData: function () {},
            getDomPaymentMethods: function () {
                // Poison: if state-bridge still trusted DOM, this would win.
                return [{ method: 'dom_only', title: 'DOM', disabled: false }];
            },
            syncDomPaymentMethodsFromService: function (methods) {
                domSyncCalls.push(methods.map(function (m) {
                    return m.method;
                }));
            },
            syncKoPaymentRenderers: function () {},
            setQuotePaymentMethodFromBridge: function (v) {
                quoteMethod = v;
            },
            persistPaymentMethodToCheckoutData: function () {},
            getAllowedPaymentCodes: function () {
                return null;
            }
        }
    });

    const result = bridge.syncPaymentMethods();

    assert(
        setCalls.length === 0,
        'Must not call setPaymentMethods when method-list already has REST methods'
    );
    assert(result.length === 2, 'Canonical list has two Magento methods');
    assert(result[0].method === 'payu_gateway_card', 'First method is PayU');
    assert(
        domSyncCalls.length >= 1 &&
            domSyncCalls[0].indexOf('payu_gateway_card') !== -1 &&
            domSyncCalls[0].indexOf('dom_only') === -1,
        'DOM sync receives Magento methods, not DOM-only codes'
    );
})();

// --- seed from config when method-list empty ---
(function () {
    const methodListData = [];
    const methodList = function () {
        return methodListData.slice();
    };
    methodList.subscribe = function () {};

    const setCalls = [];
    const bridge = loadFactory(methodList)({
        config: {
            paymentMethods: [
                { code: 'checkmo', title: 'Check / Money order' },
                { method: 'banktransfer', title: 'Bank' }
            ]
        },
        paymentService: {
            setPaymentMethods: function (methods) {
                setCalls.push(methods);
                methodListData.length = 0;
                methods.forEach(function (m) {
                    methodListData.push(m);
                });
            }
        },
        methodConverter: function (raw) {
            return raw.map(function (item) {
                return {
                    method: item.method || item.code,
                    title: item.title
                };
            });
        },
        quote: {
            paymentMethod: function () {
                return null;
            }
        },
        shippingService: {
            setShippingRates: function () {},
            getShippingRates: function () {
                return function () {
                    return [];
                };
            }
        },
        callbacks: {
            syncQuoteCustomerData: function () {},
            syncDomPaymentMethodsFromService: function () {},
            syncKoPaymentRenderers: function () {},
            getAllowedPaymentCodes: function () {
                return null;
            }
        }
    });

    const seeded = bridge.seedFromConfigIfEmpty();
    assert(setCalls.length === 1, 'Empty list seeds paymentService once from config');
    assert(seeded.some(function (m) {
        return m.method === 'checkmo';
    }), 'Seed includes checkmo');

    bridge.seedFromConfigIfEmpty();
    assert(setCalls.length === 1, 'Config seed is not repeated while list stays non-empty path');
})();

// --- mapping clears disallowed quote method ---
(function () {
    let methodListData = [
        { method: 'checkmo', title: 'Check' },
        { method: 'payu_gateway_card', title: 'PayU' }
    ];
    const methodList = function () {
        return methodListData;
    };
    methodList.subscribe = function () {};

    let quoteMethod = { method: 'checkmo' };
    let cleared = false;

    const bridge = loadFactory(methodList)({
        config: {},
        paymentService: { setPaymentMethods: function () {} },
        methodConverter: function (r) {
            return r;
        },
        quote: {
            paymentMethod: function () {
                return quoteMethod;
            }
        },
        shippingService: {
            setShippingRates: function () {},
            getShippingRates: function () {
                return function () {
                    return [];
                };
            }
        },
        callbacks: {
            syncQuoteCustomerData: function () {},
            syncDomPaymentMethodsFromService: function () {},
            syncKoPaymentRenderers: function () {},
            setQuotePaymentMethodFromBridge: function (v) {
                quoteMethod = v;
                if (v === null) {
                    cleared = true;
                }
            },
            persistPaymentMethodToCheckoutData: function () {},
            getAllowedPaymentCodes: function () {
                return ['payu_gateway_card'];
            }
        }
    });

    bridge.syncPaymentMethods();
    assert(cleared === true, 'Quote payment cleared when mapping disallows checkmo');
})();

// --- onPaymentMethodsUpdated after REST ---
(function () {
    let methodListData = [];
    const methodList = function () {
        return methodListData;
    };
    methodList.subscribe = function () {};
    const domSync = [];

    const bridge = loadFactory(methodList)({
        config: { paymentMethods: [] },
        paymentService: { setPaymentMethods: function () {} },
        methodConverter: function (r) {
            return r;
        },
        quote: { paymentMethod: function () { return null; } },
        shippingService: {
            setShippingRates: function () {},
            getShippingRates: function () {
                return function () {
                    return [];
                };
            }
        },
        callbacks: {
            syncQuoteCustomerData: function () {},
            syncDomPaymentMethodsFromService: function (methods) {
                domSync.push(methods);
            },
            syncKoPaymentRenderers: function () {},
            getAllowedPaymentCodes: function () {
                return null;
            }
        }
    });

    // Simulate Magento get-payment-information filling method-list
    methodListData = [{ method: 'tpay', title: 'Tpay' }];
    bridge.onPaymentMethodsUpdated();
    assert(
        domSync.length >= 1 &&
            domSync[domSync.length - 1].some(function (m) {
                return m.method === 'tpay';
            }),
        'REST update notifies DOM sync with tpay'
    );
})();

console.log('checkout-state-bridge-payment: OK');
