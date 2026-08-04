/**
 * Magento method-list → SSR radio rows (ensureMethodOptions).
 *
 * Run: node Test/Unit/Js/payment-dom-bridge-sync.test.js
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

const options = [];
const grid = {
    classList: {
        _c: {},
        add: function (c) { this._c[c] = true; },
        remove: function (c) { delete this._c[c]; }
    },
    style: { display: '' },
    children: options,
    appendChild: function (el) {
        options.push(el);
        this.children = options;
    }
};

const documentMock = {
    querySelector: function (sel) {
        if (sel === '[data-fastcheckout-payment-methods-grid]') {
            return grid;
        }
        if (sel === '[data-fastcheckout-payment-methods-card]') {
            return { appendChild: function () {} };
        }
        if (sel.indexOf('[data-fastcheckout-payment-option=') === 0) {
            const m = sel.match(/="([^"]+)"/);
            return options.find(function (o) {
                return o.getAttribute('data-fastcheckout-payment-option') === (m && m[1]);
            }) || null;
        }
        return null;
    },
    querySelectorAll: function (sel) {
        if (sel === 'input[name="payment_method"]') {
            return options.map(function (o) {
                return o.querySelector('input[name="payment_method"]');
            }).filter(Boolean);
        }
        if (sel === '.fastcheckout-payment-method-ko-container') {
            return [];
        }
        if (sel.indexOf('.payment-method') === 0) {
            return [];
        }
        return [];
    },
    createElement: function (tag) {
        const el = {
            tagName: tag,
            className: '',
            style: {},
            attrs: {},
            children: [],
            required: false,
            type: '',
            name: '',
            value: '',
            textContent: '',
            setAttribute: function (n, v) {
                this.attrs[n] = String(v);
            },
            getAttribute: function (n) {
                return this.attrs[n] || null;
            },
            appendChild: function (child) {
                this.children.push(child);
            },
            querySelector: function (sel) {
                if (sel === 'input[name="payment_method"]') {
                    return this.children[0] && this.children[0].children
                        ? this.children[0].children.find(function (c) {
                            return c.name === 'payment_method';
                        })
                        : this.children.find(function (c) {
                            return c.name === 'payment_method';
                        }) || null;
                }
                if (sel === 'label span') {
                    const label = this.children[0];
                    return label && label.children
                        ? label.children.find(function (c) {
                            return c.tagName === 'span';
                        })
                        : null;
                }
                return null;
            }
        };
        return el;
    }
};

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-dom-bridge.js'),
    'utf8'
);

let createBridge;
vm.runInNewContext(source, {
    define: function (deps, factory) {
        createBridge = factory();
    },
    document: documentMock
});

const bridge = createBridge({});

// SSR already has checkmo
const ssr = documentMock.createElement('div');
ssr.setAttribute('data-fastcheckout-payment-option', 'checkmo');
const ssrLabel = documentMock.createElement('label');
const ssrInput = documentMock.createElement('input');
ssrInput.name = 'payment_method';
ssrInput.value = 'checkmo';
ssrLabel.appendChild(ssrInput);
ssrLabel.appendChild(documentMock.createElement('span'));
ssr.appendChild(ssrLabel);
options.push(ssr);

const created = bridge.syncFromService([
    { method: 'checkmo', title: 'Check' },
    { method: 'payu_gateway_card', title: 'PayU Card' }
]);

assert(created === 1, 'Creates only missing PayU row');
assert(
    options.some(function (o) {
        return o.getAttribute('data-fastcheckout-payment-option') === 'payu_gateway_card';
    }),
    'PayU option present in grid'
);
assert(
    options.filter(function (o) {
        return o.getAttribute('data-fastcheckout-payment-option') === 'checkmo';
    }).length === 1,
    'Does not duplicate SSR checkmo'
);

const createdAgain = bridge.syncFromService([
    { method: 'checkmo', title: 'Check' },
    { method: 'payu_gateway_card', title: 'PayU Card' }
]);
assert(createdAgain === 0, 'Second sync is idempotent');

console.log('payment-dom-bridge-sync: OK');
