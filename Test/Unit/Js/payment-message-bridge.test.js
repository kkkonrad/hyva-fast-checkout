'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const message = 'Pusty numer karty Pusta data ważności karty Pusty CVV';
let createBridge;
const inlineNodes = [{
    innerText: 'Błąd karty:\nPusty numer karty\nPusta data ważności karty\nPusty CVV',
    textContent: 'Błąd karty:\nPusty numer karty\nPusta data ważności karty\nPusty CVV',
    nodeType: 1,
    classList: { contains: () => false },
    offsetParent: {},
    closest: () => null
}];
let targetHidden = false;
let added = 0;

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-message-bridge.js'),
        'utf8'
    ),
    {
        window: {
            getComputedStyle: () => ({
                display: 'block',
                visibility: 'visible',
                opacity: '1',
                position: 'static'
            })
        },
        document: {
            querySelector: () => (targetHidden ? {
                style: {display: 'none'},
                classList: {contains: () => true},
                querySelectorAll: () => inlineNodes
            } : {
                style: {display: 'block'},
                classList: {contains: () => false},
                querySelectorAll: () => inlineNodes
            })
        },
        define: (deps, factory) => { createBridge = factory(); },
        Array,
        String
    }
);

const bridge = createBridge({});
const container = {
    addErrorMessage: () => { added += 1; }
};

assert.strictEqual(
    bridge.handleError(new Error(message), container, 'payu_gateway_card'),
    true,
    'an error already rendered in payment content must not be duplicated'
);
assert.strictEqual(added, 0);
assert.ok(
    bridge.getInlineErrorText('payu_gateway_card').indexOf('Pusty numer karty') !== -1,
    'getInlineErrorText must surface PayU .payu-msg content'
);
assert.strictEqual(
    bridge.hasInlineError('payu_gateway_card', ''),
    true,
    'any visible payment error counts as inline when no specific message is provided'
);

targetHidden = true;
assert.strictEqual(
    bridge.handleError(new Error(message), container, 'payu_gateway_card'),
    false,
    'the external message must remain as fallback when inline content is hidden'
);
assert.strictEqual(added, 1);
assert.strictEqual(
    bridge.getInlineErrorText('payu_gateway_card'),
    '',
    'hidden payment targets must not report inline errors'
);

let errorListener;
let observedError = '';
const errorMessages = function () { return []; };
errorMessages.subscribe = (listener) => {
    errorListener = listener;
    return {dispose: () => { errorListener = null; }};
};
const errorSubscription = bridge.watchErrors(
    {errorMessages},
    (error) => { observedError = bridge.getText(error); }
);
errorListener([{message: 'Błąd z messageContainer'}]);
assert.strictEqual(observedError, 'Błąd z messageContainer');
errorSubscription.dispose();
assert.strictEqual(errorListener, null);

let deferredFailure;
let promiseFailure;
bridge.observeFailure(
    {fail: (listener) => { deferredFailure = listener; }},
    (error) => { observedError = bridge.getText(error); }
);
deferredFailure({responseJSON: {message: 'Błąd Deferred'}});
assert.strictEqual(observedError, 'Błąd Deferred');

bridge.observeFailure(
    {catch: (listener) => { promiseFailure = listener; }},
    (error) => { observedError = bridge.getText(error); }
);
promiseFailure(new Error('Błąd Promise'));
assert.strictEqual(observedError, 'Błąd Promise');

console.log('payment message bridge: OK');
