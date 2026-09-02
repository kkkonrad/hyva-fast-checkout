'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function loadMixin(active) {
    return loadAmd('mixin/shipping-rates-validator-mixin.js', {
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => active
    });
}

test('refreshes select fields immediately and debounces typed address fields', () => {
    const calls = [];
    const validator = {
        bindHandler(element, delay) {
            calls.push([element.index, delay]);
        }
    };

    loadMixin(true)(validator);
    validator.bindHandler({index: 'country_id'}, 2000);
    validator.bindHandler({index: 'region_id'}, 2000);
    validator.bindHandler({index: 'region_id_input'});
    validator.bindHandler({index: 'postcode'});
    validator.bindHandler({index: 'city'}, 900);

    assert.deepEqual(calls, [
        ['country_id', 0],
        ['region_id', 0],
        ['region_id_input', 1500],
        ['postcode', 1500],
        ['city', 900]
    ]);
});

test('leaves Magento validator unchanged outside Fastcheckout', () => {
    const bindHandler = () => {};
    const validator = {bindHandler};

    assert.equal(loadMixin(false)(validator).bindHandler, bindHandler);
});
