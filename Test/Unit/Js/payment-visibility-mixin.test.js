'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadMixin(active) {
    let mixin;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/payment-visibility-mixin.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        define(dependencies, factory) {
            mixin = factory(() => active);
        }
    });

    return mixin({
        extend(extension) {
            return Object.assign({
                _super() {
                    this.isVisible(false);
                    return this;
                }
            }, extension);
        }
    });
}

function visible() {
    let value = false;
    const subscribers = [];
    const result = function (next) {
        if (!arguments.length) {
            return value;
        }
        value = next;
        subscribers.slice().forEach((callback) => callback(value));
        return result;
    };
    result.subscribe = (callback, owner) => {
        subscribers.push(callback.bind(owner || null));
        return {dispose() {}};
    };

    return result;
}

test('makes the payment step visible on Fastcheckout after Magento registers it', () => {
    const Component = loadMixin(true);
    const component = Object.assign({isVisible: visible()}, Component);

    assert.equal(component.initialize(), component);
    assert.equal(component.isVisible(), true);
    component.isVisible(false);
    assert.equal(component.isVisible(), true);
});

test('leaves Magento payment visibility unchanged outside Fastcheckout', () => {
    const Component = loadMixin(false);
    const component = Object.assign({isVisible: visible()}, Component);

    component.initialize();
    assert.equal(component.isVisible(), false);
});
