/**
 * Drives the SHIPPED shipping-rate-processor-bridge wrap() and shipping-method-sync
 * pushNativeShippingSelection against mock Magento modules — proves native estimate
 * and set-shipping-information are invoked (not Magewire).
 *
 * Run: node Test/Unit/Js/native-estimate-path.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../..');
const scratch = process.env.FC_SCRATCH || '/tmp/grok-goal-2db32d4062a8/implementer';
const logLines = [];

function log(msg) {
    logLines.push(msg);
    console.log(msg);
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error('ASSERT: ' + msg);
    }
}

// Minimal AMD define/require harness
const modules = {};
const pending = {};

function define(deps, factory) {
    if (typeof deps === 'function') {
        factory = deps;
        deps = [];
    }
    const name = define._nextName || 'anonymous_' + Object.keys(modules).length;
    define._nextName = null;
    pending[name] = { deps: deps || [], factory: factory };
}

function requireLocal(deps, cb) {
    const resolved = deps.map(function (d) {
        if (modules[d]) {
            return modules[d];
        }
        if (pending[d]) {
            const p = pending[d];
            const args = p.deps.map(function (dep) {
                if (dep === 'exports') {
                    return {};
                }
                if (modules[dep]) {
                    return modules[dep];
                }
                throw new Error('Missing dep ' + dep + ' for ' + d);
            });
            modules[d] = p.factory.apply(null, args);
            return modules[d];
        }
        throw new Error('Unknown module ' + d);
    });
    if (typeof cb === 'function') {
        cb.apply(null, resolved);
    }
    return resolved;
}

// Magento-like mocks
const rates = { value: [] };
const shippingService = {
    isLoading: function (v) {
        if (arguments.length) {
            shippingService._loading = v;
            return;
        }
        return !!shippingService._loading;
    },
    getShippingRates: function () {
        return function () {
            return rates.value;
        };
    },
    setShippingRates: function (r) {
        rates.value = r;
        shippingService._setCalls = (shippingService._setCalls || 0) + 1;
    }
};

const rateRegistry = {
    _map: {},
    get: function (k) {
        return this._map[k] || false;
    },
    set: function (k, v) {
        this._map[k] = v;
    }
};

const quote = {
    shippingMethod: function (v) {
        if (arguments.length) {
            quote._sm = v;
            return;
        }
        return quote._sm || null;
    },
    shippingAddress: function () {
        return quote._addr || null;
    }
};
quote.shippingMethod.subscribe = function () {
    return { dispose: function () {} };
};

const networkLog = [];
const networkHistory = []; // full run (never cleared) for evidence
function recordNet(entry) {
    networkLog.push(entry);
    networkHistory.push(entry);
}
const storage = {
    post: function (url, payload) {
        const entry = { method: 'POST', url: String(url), payload: String(payload) };
        recordNet(entry);
        const deferred = {
            _done: [],
            _fail: [],
            done: function (fn) {
                this._done.push(fn);
                return this;
            },
            fail: function (fn) {
                this._fail.push(fn);
                return this;
            }
        };
        // Simulate Magento estimate-shipping-methods response
        setTimeout(function () {
            const ratesResult = [
                {
                    carrier_code: 'flatrate',
                    method_code: 'flatrate',
                    carrier_title: 'Flat',
                    method_title: 'Fixed',
                    amount: 10,
                    available: true
                },
                {
                    carrier_code: 'tablerate',
                    method_code: 'bestway',
                    carrier_title: 'Table',
                    method_title: 'Best Way',
                    amount: 15,
                    available: true
                }
            ];
            deferred._done.forEach(function (fn) {
                fn(ratesResult);
            });
        }, 5);
        return deferred;
    }
};

const resourceUrlManager = {
    getUrlForEstimationShippingMethodsForNewAddress: function () {
        return 'rest/V1/guest-carts/abc/estimate-shipping-methods';
    }
};

// wrapper.wrap: (original, wrapperFn) => function that calls wrapperFn(original, ...args)
const wrapper = {
    wrap: function (original, wrapFn) {
        return function () {
            const args = Array.prototype.slice.call(arguments);
            return wrapFn.apply(this, [original].concat(args));
        };
    }
};

const isFastcheckoutActive = function () {
    return true;
};

// Register mock modules
modules['mage/utils/wrapper'] = wrapper;
modules['Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'] = isFastcheckoutActive;
modules['Kkkonrad_Fastcheckout/js/hyva/region-country-guard'] = {
    dropRegionFromOtherCountry: function (address) {
        return address;
    }
};
modules['Magento_Checkout/js/model/shipping-service'] = shippingService;
modules['Magento_Checkout/js/model/shipping-rate-registry'] = rateRegistry;
modules['Magento_Checkout/js/model/error-processor'] = { process: function () {} };
modules['jquery'] = function () {};
modules['mage/storage'] = storage;
modules['mage/url'] = { build: function (u) { return u; } };
modules['Magento_Checkout/js/model/resource-url-manager'] = resourceUrlManager;
modules['Magento_Checkout/js/model/quote'] = quote;
modules['Magento_Checkout/js/action/set-shipping-information'] = function setShippingInformationAction() {
    recordNet({ method: 'POST', url: 'rest/V1/guest-carts/abc/shipping-information', payload: 'shipping-info' });
    return Promise.resolve({ totals: { grand_total: 25 } });
};
modules['Magento_Checkout/js/action/select-shipping-method'] = function (rate) {
    quote.shippingMethod(rate);
};

// Load shipped rate processor bridge
const bridgeSrc = fs.readFileSync(
    path.join(root, 'view/frontend/web/js/mixin/shipping-rate-processor-bridge.js'),
    'utf8'
);
define._nextName = 'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge';
vm.runInNewContext(bridgeSrc, { define: define, console: console });
requireLocal(['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'], function () {});
const processorBridge = modules['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'];

// Native original getRates that records network via storage
let originalGetRatesCalls = 0;
const nativeProcessor = {
    getRates: function (address) {
        originalGetRatesCalls++;
        recordNet({
            method: 'POST',
            url: 'rest/V1/guest-carts/abc/estimate-shipping-methods',
            payload: JSON.stringify({ address: { country_id: address.countryId, postcode: address.postcode } })
        });
        const result = [
            { carrier_code: 'flatrate', method_code: 'flatrate', amount: 10, method_title: 'Fixed', carrier_title: 'Flat', available: true },
            { carrier_code: 'tablerate', method_code: 'bestway', amount: 15, method_title: 'Best Way', carrier_title: 'Table', available: true }
        ];
        shippingService.setShippingRates(result);
        shippingService.isLoading(false);
    }
};

global.window = {
    fastcheckoutLockShippingRatesList: false,
    fastcheckoutSelectingShippingMethod: false,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
};
// re-bind for isFastcheckoutActive / window checks inside wrap
const sandbox = {
    define: define,
    console: console,
    window: global.window
};

// Re-run bridge factory in sandbox with window
delete modules['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'];
delete pending['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'];
define._nextName = 'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge';
vm.runInNewContext(bridgeSrc, {
    define: define,
    console: console,
    window: global.window
});
// re-inject deps into modules map for factory
modules['mage/utils/wrapper'] = wrapper;
modules['Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'] = isFastcheckoutActive;
modules['Kkkonrad_Fastcheckout/js/hyva/region-country-guard'] = {
    dropRegionFromOtherCountry: function (address) {
        return address;
    }
};
modules['Magento_Checkout/js/model/shipping-service'] = shippingService;
requireLocal(['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'], function () {});
const bridge = modules['Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'];

const wrapped = bridge.wrap(nativeProcessor);
assert(typeof wrapped.getRates === 'function', 'wrapped getRates');

// A country-only bootstrap address must wait until KO paints the address form.
wrapped.getRates({
    countryId: 'PL',
    getType: function () { return 'new-customer-address'; },
    getCacheKey: function () { return 'startup-country-only'; }
});
assert(originalGetRatesCalls === 0, 'country-only estimate skipped before address fields are ready');
global.window.fastcheckoutAddressFieldsReady = true;

// Address A estimate
const addressA = {
    countryId: 'PL',
    postcode: '00-001',
    city: 'Warsaw',
    getType: function () { return 'new-customer-address'; },
    getCacheKey: function () { return 'addr-A'; }
};
wrapped.getRates(addressA);
assert(originalGetRatesCalls === 1, 'native originalGetRates called for address A');
assert(
    networkLog.some(function (e) { return e.url.indexOf('estimate-shipping-methods') !== -1; }),
    'estimate-shipping-methods network observed for A'
);
const ratesAfterA = shippingService.getShippingRates()();
assert(ratesAfterA.length === 2, 'two rates after estimate A');
const codesA = ratesAfterA.map(function (r) { return r.carrier_code + '_' + r.method_code; }).sort().join(',');
log('rates after A: ' + codesA);

// Address B estimate (reprice)
networkLog.length = 0;
const addressB = {
    countryId: 'PL',
    postcode: '30-001',
    city: 'Krakow',
    getType: function () { return 'new-customer-address'; },
    getCacheKey: function () { return 'addr-B'; }
};
wrapped.getRates(addressB);
assert(originalGetRatesCalls === 2, 'native originalGetRates called for address B (reprice)');
assert(
    networkLog.some(function (e) { return e.url.indexOf('estimate-shipping-methods') !== -1; }),
    'estimate-shipping-methods network observed for B'
);
log('estimate A→B network posts: ' + networkLog.filter(function (e) {
    return e.url.indexOf('estimate-shipping-methods') !== -1;
}).length);

// Method selection must NOT re-estimate
networkLog.length = 0;
const beforeSelect = originalGetRatesCalls;
global.window.fastcheckoutSelectingShippingMethod = true;
global.window.fastcheckoutLockShippingRatesList = true;
wrapped.getRates(addressB);
assert(originalGetRatesCalls === beforeSelect, 'getRates skipped during method select lock');
assert(networkLog.length === 0, 'no network during locked method select');
global.window.fastcheckoutSelectingShippingMethod = false;
global.window.fastcheckoutLockShippingRatesList = false;
log('method-select lock prevented re-estimate: ok');

// Shipping method sync: select A then B → set-shipping-information, rates list stable
const syncSrc = fs.readFileSync(
    path.join(root, 'view/frontend/web/js/hyva/shipping-method-sync.js'),
    'utf8'
);
delete modules['Kkkonrad_Fastcheckout/js/hyva/shipping-method-sync'];
delete pending['Kkkonrad_Fastcheckout/js/hyva/shipping-method-sync'];
define._nextName = 'Kkkonrad_Fastcheckout/js/hyva/shipping-method-sync';
vm.runInNewContext(syncSrc, {
    define: define,
    console: console,
    window: global.window,
    document: {
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    }
});
// shipping-method-sync is define([], factory) that returns a factory(deps)
// Actually: define([jquery, quote, set-shipping-information, rate-registry], factory)
// Our file uses define([...], function(...) { return function(deps) {...}})
// Wait - current shipping-method-sync.js starts with define([jquery, quote, ...])
const syncFactoryModule = (function () {
    // re-read and execute as AMD with deps
    let result;
    const localDefine = function (deps, factory) {
        const args = deps.map(function (d) {
            if (d === 'jquery') return function () {};
            if (d === 'Magento_Checkout/js/model/quote') return quote;
            if (d === 'Magento_Checkout/js/action/set-shipping-information') {
                return modules['Magento_Checkout/js/action/set-shipping-information'];
            }
            if (d === 'Magento_Checkout/js/model/shipping-rate-registry') return rateRegistry;
            throw new Error('dep ' + d);
        });
        result = factory.apply(null, args);
    };
    vm.runInNewContext(syncSrc, {
        define: localDefine,
        console: console,
        window: global.window,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        document: {
            querySelector: function () { return null; },
            querySelectorAll: function () { return []; }
        }
    });
    return result;
})();

const selectShippingMethodAction = modules['Magento_Checkout/js/action/select-shipping-method'];
const sync = syncFactoryModule({
    quote: quote,
    shippingService: shippingService,
    selectShippingMethodAction: selectShippingMethodAction,
    persistShippingMethod: function () {}
});

quote._addr = addressA;
rates.value = [
    { carrier_code: 'flatrate', method_code: 'flatrate', amount: 10, method_title: 'Fixed', carrier_title: 'Flat', available: true },
    { carrier_code: 'tablerate', method_code: 'bestway', amount: 15, method_title: 'Best Way', carrier_title: 'Table', available: true }
];
const codesBefore = rates.value.map(function (r) { return r.carrier_code + '_' + r.method_code; }).join(',');

networkLog.length = 0;
return Promise.resolve(sync.pushNativeShippingSelection('flatrate_flatrate'))
    .then(function () {
        assert(
            networkLog.some(function (e) { return e.url.indexOf('shipping-information') !== -1; }),
            'set-shipping-information called for method A'
        );
        const codesMid = shippingService.getShippingRates()().map(function (r) {
            return r.carrier_code + '_' + r.method_code;
        }).join(',');
        assert(codesMid === codesBefore, 'shipping list codes stable after select A (no clear/refill)');
        log('select A: shipping-information ok, list stable: ' + codesMid);

        networkLog.length = 0;
        // allow coalesce window to pass
        return new Promise(function (r) { setTimeout(r, 900); });
    })
    .then(function () {
        return sync.pushNativeShippingSelection('tablerate_bestway');
    })
    .then(function () {
        assert(
            networkLog.some(function (e) { return e.url.indexOf('shipping-information') !== -1; }),
            'set-shipping-information called for method B'
        );
        // No estimate burst on method switch
        assert(
            !networkLog.some(function (e) { return e.url.indexOf('estimate-shipping-methods') !== -1; }),
            'method B select must not re-estimate rates'
        );
        const codesAfter = shippingService.getShippingRates()().map(function (r) {
            return r.carrier_code + '_' + r.method_code;
        }).join(',');
        assert(codesAfter === codesBefore, 'shipping list codes stable after select B');
        log('select B: shipping-information ok, list stable, no estimate re-fire');

        const out = path.join(scratch, 'shipping-select-net.log');
        const estimatePosts = networkHistory.filter(function (e) {
            return e.url.indexOf('estimate-shipping-methods') !== -1;
        });
        const shipInfoPosts = networkHistory.filter(function (e) {
            return e.url.indexOf('shipping-information') !== -1;
        });
        fs.writeFileSync(out, logLines.concat([
            '',
            'estimate-shipping-methods count: ' + estimatePosts.length,
            'shipping-information count: ' + shipInfoPosts.length,
            'full networkHistory:',
            JSON.stringify(networkHistory, null, 2)
        ]).join('\n'));
        log('wrote ' + out);
        assert(estimatePosts.length >= 2, 'at least two estimate posts (A and B address)');
        assert(shipInfoPosts.length >= 2, 'at least two shipping-information posts (method A and B)');
        log('ALL PASS');
    })
    .catch(function (err) {
        console.error(err);
        process.exit(1);
    });
