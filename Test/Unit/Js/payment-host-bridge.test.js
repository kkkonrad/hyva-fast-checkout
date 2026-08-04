/**
 * PR #2: stable payment hosts — second activate must not reparent.
 *
 * Run: node Test/Unit/Js/payment-host-bridge.test.js
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

const hosts = {};
const paymentNodes = [];

function makeEl(tag, attrs) {
    const el = {
        tagName: tag,
        classList: {
            _c: {},
            add: function (c) { this._c[c] = true; },
            remove: function (c) { delete this._c[c]; },
            contains: function (c) { return !!this._c[c]; }
        },
        style: {},
        attrs: Object.assign({}, attrs || {}),
        children: [],
        parentNode: null,
        id: (attrs && attrs.id) || '',
        getAttribute: function (n) { return this.attrs[n] != null ? this.attrs[n] : null; },
        setAttribute: function (n, v) { this.attrs[n] = String(v); },
        removeAttribute: function (n) { delete this.attrs[n]; },
        querySelector: function (sel) {
            if (sel === '.payment-method') {
                return this.children.find(function (c) {
                    return c.classList && c.classList.contains('payment-method');
                }) || null;
            }
            if (sel === 'input' || sel.indexOf('input') === 0) {
                return this._input || null;
            }
            return null;
        },
        querySelectorAll: function (sel) {
            if (sel === 'input') {
                return this._input ? [this._input] : [];
            }
            return [];
        },
        appendChild: function (child) {
            if (child.parentNode && child.parentNode.children) {
                const idx = child.parentNode.children.indexOf(child);
                if (idx !== -1) {
                    child.parentNode.children.splice(idx, 1);
                }
            }
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        contains: function (node) {
            return this.children.indexOf(node) !== -1;
        }
    };
    if (attrs && attrs['class']) {
        attrs['class'].split(/\s+/).forEach(function (c) {
            if (c) el.classList.add(c);
        });
    }
    return el;
}

const root = makeEl('div', { id: 'fastcheckout-ko-payment-root' });
hosts.checkmo = makeEl('div', { 'data-fastcheckout-payment-method-ko-target': 'checkmo' });
hosts.payu = makeEl('div', { 'data-fastcheckout-payment-method-ko-target': 'payu_gateway_card' });
hosts.checkmo.classList.add('hidden');
hosts.payu.classList.add('hidden');

function makePayment(code) {
    const node = makeEl('div', { class: 'payment-method', id: code });
    node.classList.add('payment-method');
    node._input = {
        id: code,
        value: code,
        getAttribute: function (n) { return n === 'value' ? code : null; }
    };
    paymentNodes.push(node);
    root.appendChild(node);
    return node;
}

const checkmo = makePayment('checkmo');
const payu = makePayment('payu_gateway_card');

const documentMock = {
    querySelector: function (sel) {
        if (sel.indexOf('data-fastcheckout-payment-method-ko-target="checkmo"') !== -1) {
            return hosts.checkmo;
        }
        if (sel.indexOf('data-fastcheckout-payment-method-ko-target="payu_gateway_card"') !== -1) {
            return hosts.payu;
        }
        return null;
    },
    querySelectorAll: function (sel) {
        if (sel === '.payment-method') {
            return paymentNodes.slice();
        }
        if (sel.indexOf('data-fastcheckout-payment-method-ko-target') !== -1) {
            return [hosts.checkmo, hosts.payu];
        }
        return [];
    }
};

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-host-bridge.js'),
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

// First activate checkmo — may move once into host
const first = bridge.activateMethodInHost('checkmo', {
    hasVisibleContent: function () { return true; }
});
assert(first.opened === true, 'first activate opens');
assert(checkmo.parentNode === hosts.checkmo, 'checkmo adopted into permanent host');
assert(bridge.isPermanentlyMounted(checkmo) === true, 'mounted flag set');
assert(first.moved === true, 'first activate may move');

const parentAfterFirst = checkmo.parentNode;

// Activate payu
const second = bridge.activateMethodInHost('payu_gateway_card', {
    hasVisibleContent: function () { return true; }
});
assert(second.opened === true, 'payu opens');
assert(payu.parentNode === hosts.payu, 'payu in its host');

// Re-activate checkmo — parent must be unchanged (no late reparent)
const third = bridge.activateMethodInHost('checkmo', {
    hasVisibleContent: function () { return true; }
});
assert(third.opened === true, 'checkmo re-opens');
assert(checkmo.parentNode === parentAfterFirst, 'parentNode unchanged on second activate');
assert(third.moved === false, 'second activate must not move');
assert(checkmo.parentNode === hosts.checkmo, 'still under checkmo host');

// Explicit adoptRendererOnce on already mounted is no-op for reparent
const adoptAgain = bridge.adoptRendererOnce(checkmo, 'checkmo');
assert(adoptAgain.moved === false, 'adoptRendererOnce does not reparent mounted node');

console.log('payment-host-bridge: OK');
