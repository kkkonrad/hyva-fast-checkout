/**
 * Regression coverage for estimate-shipping-methods region_id serialization.
 *
 * Run: node Test/Unit/Js/region-country-guard.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/region-country-guard.js'),
    'utf8'
);
let guard;

const registry = {
    filter: function () {
        return [{
            dataScope: 'shippingAddress.region_id',
            initialOptions: [
                { value: '1024', country_id: 'PL' },
                { value: '12', country_id: 'US' }
            ]
        }];
    }
};

vm.runInNewContext(source, {
    define: function (dependencies, factory) {
        guard = factory(registry);
    }
});

function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}

const emptyRegion = {
    countryId: 'DE',
    regionId: '',
    region_id: ''
};
guard.dropRegionFromOtherCountry(emptyRegion);
assert(emptyRegion.regionId === undefined, 'empty regionId must be omitted');
assert(emptyRegion.region_id === undefined, 'empty region_id must be omitted');
assert(
    JSON.stringify({ address: emptyRegion }).indexOf('"region_id"') === -1,
    'empty region_id must not be serialized'
);

const staleRegion = {
    countryId: 'DE',
    regionId: '1024',
    region_id: '1024',
    region: 'mazowieckie'
};
guard.dropRegionFromOtherCountry(staleRegion);
assert(staleRegion.regionId === undefined, 'foreign regionId must be omitted');
assert(staleRegion.region_id === undefined, 'foreign region_id must be omitted');
assert(staleRegion.region === '', 'foreign region name must be cleared');

const validRegion = {
    countryId: 'PL',
    regionId: '1024',
    region_id: '1024',
    region: 'mazowieckie'
};
guard.dropRegionFromOtherCountry(validRegion);
assert(validRegion.regionId === '1024', 'valid regionId must be preserved');
assert(validRegion.region_id === '1024', 'valid region_id must be preserved');

console.log('ALL PASS: region_id is omitted when empty or assigned to another country');
