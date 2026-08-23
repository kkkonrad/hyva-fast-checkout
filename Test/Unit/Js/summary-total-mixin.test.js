'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function isFullMode(active, twoStep, nativeResult) {
    let mixin;
    let nativeCalls = 0;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/summary-total-mixin.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        window: {checkoutConfig: {fastcheckoutSettings: {twoStep}}},
        define(dependencies, factory) {
            mixin = factory(() => active);
        }
    });

    const extension = mixin({
        extend(methods) {
            return methods;
        }
    });

    return {
        result: extension.isFullMode.call({
            getTotals: () => ({grand_total: 10}),
            _super() {
                nativeCalls += 1;

                return nativeResult;
            }
        }),
        nativeCalls: () => nativeCalls
    };
}

test('uses Magento step state in two-step mode and only forces one-step totals', () => {
    const twoStep = isFullMode(true, true, false);
    const oneStep = isFullMode(true, false, false);

    assert.equal(twoStep.result, false);
    assert.equal(twoStep.nativeCalls(), 1);
    assert.equal(oneStep.result, true);
    assert.equal(oneStep.nativeCalls(), 0);
});
