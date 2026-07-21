define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            shippingService = deps.shippingService,
            selectShippingMethodAction = deps.selectShippingMethodAction,
            getMagewireComponent = typeof deps.getMagewireComponent === 'function' ? deps.getMagewireComponent : function () { return null; },
            persistShippingMethod = typeof deps.persistShippingMethod === 'function' ? deps.persistShippingMethod : function () {},
            lastMagewireShippingMethodCode = '',
            syncTimer = null;

        function getCode(shippingMethod) {
            if (!shippingMethod) {
                return '';
            }
            if (typeof shippingMethod === 'string') {
                return shippingMethod;
            }
            if (shippingMethod.carrier_code && shippingMethod.method_code) {
                return shippingMethod.carrier_code + '_' + shippingMethod.method_code;
            }
            if (shippingMethod.carrierCode && shippingMethod.methodCode) {
                return shippingMethod.carrierCode + '_' + shippingMethod.methodCode;
            }
            if (shippingMethod.method) {
                return shippingMethod.method;
            }

            return '';
        }

        function splitCode(methodCode) {
            var parts = String(methodCode || '').split('_'),
                carrier = parts.shift() || '';

            return {
                carrier_code: carrier,
                method_code: parts.length ? parts.join('_') : carrier
            };
        }

        function syncSelectedToKnockout(methodCode) {
            var rates,
                found = null,
                active;

            persistShippingMethod(methodCode);

            if (!methodCode) {
                quote.shippingMethod(null);
                return;
            }

            rates = shippingService.getShippingRates()();

            rates.some(function (rate) {
                if ((rate.carrier_code + '_' + rate.method_code) === methodCode) {
                    found = rate;
                    return true;
                }
                return false;
            });

            if (found) {
                active = quote.shippingMethod();
                if (!active || active.carrier_code !== found.carrier_code || active.method_code !== found.method_code) {
                    selectShippingMethodAction(found);
                }
            }
        }

        function syncToMagewireNow(methodCode) {
            var wire,
                current;

            persistShippingMethod(methodCode);

            if (syncTimer) {
                window.clearTimeout(syncTimer);
                syncTimer = null;
            }

            if (!methodCode) {
                return Promise.resolve(false);
            }

            // Skip no-op re-selects that thrash Magewire HTML morphs.
            if (methodCode === lastMagewireShippingMethodCode) {
                return Promise.resolve(false);
            }

            wire = getMagewireComponent();
            if (!wire || typeof wire.call !== 'function') {
                return Promise.resolve(false);
            }

            current = wire.shippingMethod
                || (typeof wire.get === 'function' ? wire.get('shippingMethod') : '')
                || (wire.data ? wire.data.shippingMethod : '');
            if (current === methodCode) {
                lastMagewireShippingMethodCode = methodCode;
                return Promise.resolve(false);
            }

            lastMagewireShippingMethodCode = methodCode;

            return Promise.resolve(wire.call('selectShippingMethod', methodCode));
        }

        function syncToMagewire(methodCode) {
            if (window.fastcheckoutSuppressShippingSync) {
                return;
            }
            persistShippingMethod(methodCode);

            if (!methodCode || methodCode === lastMagewireShippingMethodCode) {
                return;
            }

            lastMagewireShippingMethodCode = methodCode;

            if (syncTimer) {
                window.clearTimeout(syncTimer);
            }

            syncTimer = window.setTimeout(function () {
                var wire = getMagewireComponent();

                syncTimer = null;

                if (!wire || typeof wire.call !== 'function') {
                    return;
                }

                wire.call('selectShippingMethod', methodCode);
            }, 0);
        }

        return {
            getCode: getCode,
            splitCode: splitCode,
            syncSelectedToKnockout: syncSelectedToKnockout,
            syncToMagewireNow: syncToMagewireNow,
            syncToMagewire: syncToMagewire
        };
    };
});
