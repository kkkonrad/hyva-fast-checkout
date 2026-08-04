/**
 * Soft removeRenderer keeps SDK renderers; restore on method re-add.
 *
 * Run: node Test/Unit/Js/payment-list-soft-remove.test.js
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

// Minimal DOM
const paymentNodes = [];
const slots = [];

function makePaymentNode(code) {
    const node = {
        id: code,
        classList: {
            _classes: {},
            add: function (c) {
                this._classes[c] = true;
            },
            remove: function (c) {
                delete this._classes[c];
            },
            contains: function (c) {
                return !!this._classes[c];
            }
        },
        style: { display: '' },
        attrs: {},
        getAttribute: function (n) {
            return this.attrs[n] || null;
        },
        setAttribute: function (n, v) {
            this.attrs[n] = String(v);
        },
        removeAttribute: function (n) {
            delete this.attrs[n];
        },
        querySelector: function (sel) {
            if (sel.indexOf('input') !== -1) {
                return { value: code, name: 'payment[method]' };
            }
            return null;
        }
    };
    paymentNodes.push(node);
    return node;
}

function makeSlot(code) {
    const slot = {
        code: code,
        classList: {
            _classes: { hidden: true },
            add: function (c) {
                this._classes[c] = true;
            },
            remove: function (c) {
                delete this._classes[c];
            },
            contains: function (c) {
                return !!this._classes[c];
            }
        },
        style: { display: 'none' },
        attrs: {
            'data-fastcheckout-payment-method-ko-target': code
        },
        getAttribute: function (n) {
            return this.attrs[n] || null;
        },
        setAttribute: function (n, v) {
            this.attrs[n] = String(v);
        },
        removeAttribute: function (n) {
            delete this.attrs[n];
        }
    };
    slots.push(slot);
    return slot;
}

makePaymentNode('payu_gateway_card');
makeSlot('payu_gateway_card');

const documentMock = {
    querySelectorAll: function (sel) {
        if (sel === '.payment-method') {
            return paymentNodes.slice();
        }
        if (sel.indexOf('data-fastcheckout-payment-method-ko-target') !== -1) {
            const m = sel.match(/="([^"]+)"/);
            return slots.filter(function (s) {
                return s.code === (m && m[1]);
            });
        }
        if (sel.indexOf('soft-removed') !== -1) {
            return paymentNodes.filter(function (n) {
                return n.getAttribute('data-fastcheckout-soft-removed') === '1';
            });
        }
        return [];
    }
};

let methodListData = [{ method: 'payu_gateway_card', title: 'PayU' }];
const methodList = function () {
    return methodListData;
};
methodList.subscribe = function () {
    return { dispose: function () {} };
};

// Stub Magento PaymentList.extend
const PaymentListStub = {
    extend: function (proto) {
        function Component() {
            this.paymentGroupsList = function () {
                return [
                    {
                        displayArea: 'payment-methods-items-default'
                    }
                ];
            };
            this.region = {
                'payment-methods-items-default': function () {
                    return [
                        {
                            item: { method: 'payu_gateway_card' }
                        }
                    ];
                }
            };
            this.getRegion = function (area) {
                return this.region[area] || function () {
                    return [];
                };
            };
            this.pendingRendererCodes = {};
            this.softRemovedMethods = {};
        }
        Object.keys(proto).forEach(function (key) {
            Component.prototype[key] = proto[key];
        });
        Component.prototype._super = function () {
            return this;
        };
        return Component;
    }
};

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/payment-list.js'),
    'utf8'
);

let ListClass;
vm.runInNewContext(source, {
    define: function (deps, factory) {
        ListClass = factory(
            { each: function (list, fn, ctx) {
                (list || []).forEach(function (item, i) {
                    fn.call(ctx, item, i);
                });
            }, map: function () {}, find: function () {} },
            PaymentListStub,
            methodList
        );
    },
    document: documentMock,
    window: { setTimeout: function (fn) { fn(); } },
    console: console
});

const list = new ListClass();
list.initialize();

assert(list.hasRenderer('payu_gateway_card') === true, 'hasRenderer finds PayU');

list.removeRenderer('payu_gateway_card');
assert(list.softRemovedMethods.payu_gateway_card === true, 'softRemoved flag set');
assert(
    paymentNodes[0].getAttribute('data-fastcheckout-soft-removed') === '1',
    'DOM payment node soft-hidden'
);
assert(paymentNodes[0].style.display === 'none', 'payment node display none');
assert(
    slots[0].getAttribute('data-fastcheckout-soft-removed') === '1',
    'FC host slot soft-hidden'
);

// Re-add via syncRenderers
list.syncRenderers();
assert(
    list.softRemovedMethods.payu_gateway_card === undefined,
    'restore clears softRemoved (method still on list)'
);
assert(
    paymentNodes[0].getAttribute('data-fastcheckout-soft-removed') === null,
    'soft-removed attribute cleared on restore'
);

// Method gone from Magento list → soft remove again
methodListData = [];
list.syncRenderers();
assert(
    list.softRemovedMethods.payu_gateway_card === true,
    'sync soft-removes when method leaves Magento list'
);

console.log('payment-list-soft-remove: OK');
