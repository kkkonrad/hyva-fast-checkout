'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element(id, children) {
    const node = {
        id: id || '',
        nodeType: 1,
        children: children || [],
        parentNode: null,
        attributes: {},
        listeners: {},
        hasAttribute(name) {
            return Object.hasOwn(this.attributes, name);
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener(name, handler) {
            this.listeners[name] = handler;
        },
        appendChild(child) {
            if (child.parentNode) {
                const siblings = child.parentNode.children;
                const index = siblings.indexOf(child);

                if (index !== -1) {
                    siblings.splice(index, 1);
                }
            }
            child.parentNode = this;
            this.children.push(child);
            return child;
        }
    };

    (children || []).forEach((child) => {
        child.parentNode = node;
    });

    return node;
}

function loadPlacement() {
    let module;
    const fallback = element('onepage-checkout-shipping-method-additional-load');
    const host = element('label_method_paczkomaty_inpost_additional');
    const widget = element('inpost-widget');
    const quote = {
        shippingMethod: Object.assign(() => quote.method, {
            subscribe() {}
        }),
        method: {method_code: 'paczkomaty', carrier_code: 'inpost'}
    };
    const rates = {
        subscribe() {}
    };

    fallback.appendChild(widget);

    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../../view/frontend/web/js/model/shipping-additional-placement.js'
    ), 'utf8');

    vm.runInNewContext(source, {
        window: {setTimeout(callback) { callback(); }},
        document: {
            getElementById(id) {
                if (id === 'onepage-checkout-shipping-method-additional-load') {
                    return fallback;
                }
                if (id === 'label_method_paczkomaty_inpost_additional') {
                    return host;
                }
                if (id === 'fastcheckout-checkout') {
                    return element('fastcheckout-checkout');
                }
                return null;
            },
            querySelectorAll(selector) {
                if (selector.indexOf(fallback.id) !== -1) {
                    return [fallback, host];
                }
                return [];
            }
        },
        define(dependencies, factory) {
            module = factory(
                {tasks: {schedule(callback) { callback(); }}},
                quote,
                {getShippingRates: () => rates}
            );
        }
    });

    return {module, fallback, host, widget, quote};
}

test('moves shippingAdditional content into the selected method host', () => {
    const context = loadPlacement();

    context.module.place();

    assert.equal(context.widget.parentNode, context.host);
    assert.equal(context.host.children[0], context.widget);
    assert.equal(context.fallback.children.length, 0);
    assert.equal(context.widget.attributes['data-fastcheckout-additional-placed'], '1');
});

test('restores shippingAdditional content before rates refresh', () => {
    const context = loadPlacement();

    context.module.place();
    context.module.restore();

    assert.equal(context.widget.parentNode, context.fallback);
    assert.equal(context.host.children.length, 0);
});

test('keeps shippingAdditional in the fallback when no method host exists', () => {
    const context = loadPlacement();

    context.quote.method = {method_code: 'flatrate', carrier_code: 'flatrate'};
    context.module.place();

    assert.equal(context.widget.parentNode, context.fallback);
});
