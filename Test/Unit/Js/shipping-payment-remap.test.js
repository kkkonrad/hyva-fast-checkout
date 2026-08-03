/**
 * Sole-payment / multi-payment remap behaviour from shipping-method-sync.js
 * (shipped applyPaymentRemapForShipping + clearInvalidPaymentAfterRemap).
 *
 * Run: node Test/Unit/Js/shipping-payment-remap.test.js
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

function makeInput(value, opts) {
    opts = opts || {};
    return {
        name: 'payment_method',
        value: value,
        disabled: !!opts.disabled,
        checked: !!opts.checked,
        closest: function (sel) {
            if (sel === '[data-fastcheckout-payment-option]') {
                return opts.option || null;
            }
            return null;
        }
    };
}

function makeOption(code, allowed, input) {
    const option = {
        code: code,
        style: { display: '' },
        attrs: {
            'data-fastcheckout-payment-option': code,
            'data-fastcheckout-payment-allowed': allowed
        },
        input: input,
        getAttribute: function (name) {
            return this.attrs[name] || null;
        },
        setAttribute: function (name, value) {
            this.attrs[name] = String(value);
        },
        removeAttribute: function (name) {
            delete this.attrs[name];
        },
        querySelector: function (sel) {
            if (sel === 'input[name="payment_method"]') {
                return this.input;
            }
            return null;
        }
    };
    input.closest = function (sel) {
        if (sel === '[data-fastcheckout-payment-option]') {
            return option;
        }
        return null;
    };
    return option;
}

function buildDocument(options, targets) {
    const paymentOptions = options.slice();
    const inputs = options.map(function (o) { return o.input; });
    const koTargets = targets || [];

    function filterPaymentOptions(sel) {
        if (sel === '[data-fastcheckout-payment-option]') {
            return paymentOptions.slice();
        }
        if (sel === '[data-fastcheckout-payment-option][data-fastcheckout-payment-allowed="1"]') {
            return paymentOptions.filter(function (o) {
                return o.getAttribute('data-fastcheckout-payment-allowed') === '1';
            });
        }
        if (sel === '[data-fastcheckout-payment-option][data-fastcheckout-payment-allowed="0"]') {
            return paymentOptions.filter(function (o) {
                return o.getAttribute('data-fastcheckout-payment-allowed') === '0';
            });
        }
        return null;
    }

    return {
        querySelectorAll: function (sel) {
            const filtered = filterPaymentOptions(sel);
            if (filtered) {
                return filtered;
            }
            if (sel === 'input[name="payment_method"]') {
                return inputs;
            }
            if (sel === '.payment-method._active') {
                return [];
            }
            if (sel === '[data-fastcheckout-payment-method-ko-target]') {
                return koTargets;
            }
            return [];
        },
        querySelector: function (sel) {
            if (sel.indexOf('input[name="payment_method"][value=') === 0) {
                const m = sel.match(/value="([^"]+)"/);
                if (!m) {
                    return null;
                }
                const wantEnabled = sel.indexOf(':not([disabled])') !== -1;
                return inputs.find(function (i) {
                    return i.value === m[1] && (!wantEnabled || !i.disabled);
                }) || null;
            }
            if (sel === '[data-fastcheckout-no-payment-methods]') {
                return null;
            }
            if (sel === '[data-fastcheckout-payment-methods-grid]') {
                return null;
            }
            if (sel.indexOf('[data-fastcheckout-payment-method-ko-target=') === 0) {
                const m = sel.match(/="([^"]+)"/);
                return koTargets.find(function (t) {
                    return t.getAttribute('data-fastcheckout-payment-method-ko-target') === (m && m[1]);
                }) || null;
            }
            const filtered = filterPaymentOptions(sel);
            if (filtered) {
                return filtered[0] || null;
            }
            return null;
        }
    };
}

function loadSync(document, windowObj, quote) {
    let createSync;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/shipping-method-sync.js'),
        'utf8'
    );

    windowObj.setTimeout = windowObj.setTimeout || function (fn) {
        if (typeof fn === 'function') {
            fn();
        }
        return 0;
    };
    windowObj.clearTimeout = windowObj.clearTimeout || function () {};

    vm.runInNewContext(source, {
        define: function (deps, factory) {
            createSync = factory;
        },
        window: windowObj,
        document: document,
        console: console,
        setTimeout: windowObj.setTimeout,
        clearTimeout: windowObj.clearTimeout,
        Date: Date,
        String: String,
        Array: Array,
        Object: Object,
        Promise: Promise
    });

    return createSync(
        function () {}, // $
        quote,
        function () { return Promise.resolve(true); }, // setShippingInformationAction
        {}, // rateRegistry
        { setSelectedShippingRate: function () {} } // checkoutData
    )({
        shippingService: { isLoading: function () { return false; } },
        selectShippingMethodAction: function () {},
        persistShippingMethod: function () {}
    });
}

// --- sole payment: one allowed method auto-activates ---
(function solePaymentActivates() {
    const poInput = makeInput('purchaseorder');
    const codInput = makeInput('cashondelivery', { checked: true });
    const po = makeOption('purchaseorder', '1', poInput);
    const cod = makeOption('cashondelivery', '1', codInput);
    const document = buildDocument([po, cod], []);
    let selected = '';
    const quoteState = { method: 'cashondelivery' };
    const windowObj = {
        checkoutConfig: {
            fastcheckoutSettings: {
                shippingPaymentMapping: [
                    { shipping_method: 'flatrate_flatrate', payment_method: 'purchaseorder' }
                ]
            }
        },
        fastcheckoutHyvaPayment: {
            selectPaymentMethod: function (code) { selected = code; },
            rememberUserPaymentSelection: function (code) { selected = code; },
            clearUserPaymentSelection: function () {},
            applyPaymentOptionVisibility: function () {}
        }
    };
    const sync = loadSync(document, windowObj, {
        paymentMethod: function () {
            return quoteState.method ? { method: quoteState.method } : null;
        },
        shippingMethod: function () { return null; },
        shippingAddress: function () { return null; }
    });

    sync.applyPaymentRemapForShipping('flatrate_flatrate');

    assert(po.getAttribute('data-fastcheckout-payment-allowed') === '1', 'sole payment stays allowed');
    assert(cod.getAttribute('data-fastcheckout-payment-allowed') === '0', 'other payment hidden');
    assert(codInput.disabled === true, 'disallowed payment input disabled');
    assert(selected === 'purchaseorder', 'sole payment must be activated via selectPaymentMethod');
    assert(poInput.checked === true, 'sole payment radio checked');
})();

// --- multi payment after clear: do not auto-restore previous choice ---
(function multiPaymentDoesNotAutoRestore() {
    const poInput = makeInput('purchaseorder');
    const codInput = makeInput('cashondelivery');
    const bankInput = makeInput('banktransfer');
    const po = makeOption('purchaseorder', '1', poInput);
    const cod = makeOption('cashondelivery', '1', codInput);
    const bank = makeOption('banktransfer', '1', bankInput);
    const document = buildDocument([po, cod, bank], []);
    let selectCalls = [];
    const windowObj = {
        checkoutConfig: {
            fastcheckoutSettings: {
                shippingPaymentMapping: [
                    { shipping_method: 'flatrate_flatrate', payment_method: 'purchaseorder' },
                    { shipping_method: 'flatrate_flatrate', payment_method: 'cashondelivery' },
                    { shipping_method: 'tablerate_bestway', payment_method: 'banktransfer' }
                ]
            }
        },
        fastcheckoutHyvaPayment: {
            selectPaymentMethod: function (code) { selectCalls.push(code); },
            rememberUserPaymentSelection: function () {},
            clearUserPaymentSelection: function () {},
            applyPaymentOptionVisibility: function () {}
        }
    };
    const quoteState = { method: 'banktransfer' };
    const sync = loadSync(document, windowObj, {
        paymentMethod: function () {
            return quoteState.method ? { method: quoteState.method } : null;
        },
        shippingMethod: function () { return null; },
        shippingAddress: function () { return null; }
    });

    // banktransfer allowed only for tablerate; switch to flatrate with two payments
    sync.applyPaymentRemapForShipping('flatrate_flatrate');

    assert(po.getAttribute('data-fastcheckout-payment-allowed') === '1', 'PO allowed');
    assert(cod.getAttribute('data-fastcheckout-payment-allowed') === '1', 'COD allowed');
    assert(bank.getAttribute('data-fastcheckout-payment-allowed') === '0', 'bank hidden');
    // Multi-choice: clear previous bank selection; do not auto-pick PO or COD
    assert(
        selectCalls.indexOf('purchaseorder') === -1 && selectCalls.indexOf('cashondelivery') === -1,
        'must not auto-select among multiple allowed payments'
    );
    assert(poInput.checked === false && codInput.checked === false, 'no multi-choice auto-check');
})();

console.log('shipping payment remap: OK');
