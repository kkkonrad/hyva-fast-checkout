'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function isFullMode(active, twoStep, nativeResult) {
    let nativeCalls = 0;
    const mixin = loadAmd('mixin/summary-total-mixin.js', {
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => active
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

test('keeps the full summary visible in both Fastcheckout layouts', () => {
    const twoStep = isFullMode(true, true, false);
    const oneStep = isFullMode(true, false, false);

    assert.equal(twoStep.result, true);
    assert.equal(twoStep.nativeCalls(), 0);
    assert.equal(oneStep.result, true);
    assert.equal(oneStep.nativeCalls(), 0);
});
