'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadMixin(active, initialHash = '') {
    let mixin;
    const nativeHashes = [];
    const listeners = {};
    const replacements = [];
    const location = {
        hash: initialHash,
        pathname: '/checkout/',
        search: '?test=1'
    };
    const history = {
        state: {quote: 1},
        replaceState(state, title, url) {
            replacements.push({state, title, url});
            location.hash = '';
        }
    };
    const wrapper = {
        wrap(original, interceptor) {
            return function (...args) {
                return interceptor.call(this, original.bind(this), ...args);
            };
        }
    };
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/step-navigator-mixin.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        document: {title: 'Checkout'},
        window: {
            history,
            location,
            addEventListener(type, listener) {
                listeners[type] = listener;
            }
        },
        define(dependencies, factory) {
            mixin = factory(wrapper, () => active);
        }
    });

    const processed = [];
    const registered = [];
    const steps = [];
    const navigator = mixin({
        steps() {
            return steps;
        },
        setHash(hash) {
            nativeHashes.push(hash);
        },
        isProcessed(code) {
            processed.push(code);
            return code === 'payment';
        },
        registerStep(code, alias, title, isVisible) {
            registered.push(code);
            steps.push({
                code,
                isVisible
            });
        }
    });

    return {navigator, location, listeners, nativeHashes, replacements, processed, registered};
}

test('keeps the one-step Fastcheckout URL free of every hash', () => {
    const context = loadMixin(true, '#custom-step');

    assert.deepEqual(context.replacements.map(({title, url}) => ({title, url})), [
        {title: 'Checkout', url: '/checkout/?test=1'}
    ]);

    context.navigator.setHash('shipping');
    context.navigator.setHash('payment');

    assert.deepEqual(context.nativeHashes, []);

    context.location.hash = '#third-party-step';
    context.listeners.hashchange();
    assert.equal(context.location.hash, '');
    assert.equal(context.navigator.isProcessed('shipping'), true);
    assert.equal(context.navigator.isProcessed('payment'), true);
    assert.deepEqual(context.processed, ['payment']);

    const visibility = {};
    const flag = (code, initial) => {
        let value = initial;
        const observable = (next) => {
            if (!arguments.length) {
                return value;
            }
            value = next;
            visibility[code] = next;
        };
        visibility[code] = initial;
        return observable;
    };
    context.navigator.registerStep('payment', null, 'Payment', flag('payment', false));
    context.navigator.registerStep('shipping', '', 'Shipping', flag('shipping', true));
    assert.deepEqual(context.registered, ['payment', 'shipping']);
    assert.equal(visibility.payment, true);
    assert.equal(visibility.shipping, true);
});

test('delegates unchanged outside Fastcheckout', () => {
    const context = loadMixin(false, '#shipping');

    context.navigator.setHash('shipping');

    assert.deepEqual(context.nativeHashes, ['shipping']);
    assert.equal(context.replacements.length, 0);
    assert.equal(context.listeners.hashchange, undefined);
    assert.equal(context.navigator.isProcessed('shipping'), false);
    assert.deepEqual(context.processed, ['shipping']);
});
