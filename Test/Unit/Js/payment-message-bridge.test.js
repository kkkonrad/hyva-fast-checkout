'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const message = 'Pusty numer karty Pusta data ważności karty Pusty CVV';
let createBridge;
const inlineNodes = [{
    innerText: 'Błąd karty:\nPusty numer karty\nPusta data ważności karty\nPusty CVV'
}];
let targetHidden = false;
let added = 0;

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-message-bridge.js'),
        'utf8'
    ),
    {
        window: {},
        document: {
            querySelector: () => ({
                style: {display: 'block'},
                classList: {contains: () => targetHidden},
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

targetHidden = true;
assert.strictEqual(
    bridge.handleError(new Error(message), container, 'payu_gateway_card'),
    false,
    'the external message must remain as fallback when inline content is hidden'
);
assert.strictEqual(added, 1);

console.log('payment message bridge: OK');
