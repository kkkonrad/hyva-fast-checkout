define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    function numericEqual(a, b) {
        var na = Number(a),
            nb = Number(b);

        if (isNaN(na) && isNaN(nb)) {
            return true;
        }

        return Math.abs(na - nb) < 0.00001;
    }

    /**
     * Magento's setShippingRates always calls valueHasMutated(), which forces the
     * Knockout foreach to destroy/rebuild every rate row. Skip when the visible
     * list is unchanged so method selection does not "reload" shipping methods.
     */
    function ratesVisuallyEqual(currentRates, nextRates) {
        var i,
            current,
            next,
            currentMap = {},
            nextMap = {},
            code;

        currentRates = Array.isArray(currentRates) ? currentRates : [];
        nextRates = Array.isArray(nextRates) ? nextRates : [];

        if (currentRates.length !== nextRates.length) {
            return false;
        }

        if (!currentRates.length) {
            return true;
        }

        for (i = 0; i < currentRates.length; i++) {
            current = currentRates[i] || {};
            code = String(current.carrier_code || '') + '_' + String(current.method_code || '');
            currentMap[code] = current;
        }

        for (i = 0; i < nextRates.length; i++) {
            next = nextRates[i] || {};
            code = String(next.carrier_code || '') + '_' + String(next.method_code || '');
            nextMap[code] = next;
            current = currentMap[code];

            if (!current) {
                return false;
            }

            if (
                !numericEqual(current.amount, next.amount) ||
                String(current.method_title || '') !== String(next.method_title || '') ||
                String(current.carrier_title || '') !== String(next.carrier_title || '') ||
                Boolean(current.available) !== Boolean(next.available)
            ) {
                return false;
            }
        }

        for (code in currentMap) {
            if (Object.prototype.hasOwnProperty.call(currentMap, code) && !nextMap[code]) {
                return false;
            }
        }

        return true;
    }

    return function (shippingService) {
        if (!shippingService || typeof shippingService.setShippingRates !== 'function') {
            return shippingService;
        }

        shippingService.setShippingRates = wrapper.wrap(
            shippingService.setShippingRates,
            function (originalSetShippingRates, ratesData) {
                var current;

                if (!isFastcheckoutActive()) {
                    return originalSetShippingRates(ratesData);
                }

                // While the shopper is picking a rate, never rebuild the list — only
                // payment methods / totals should react to selectShippingMethod.
                if (window.fastcheckoutLockShippingRatesList) {
                    return;
                }

                try {
                    current = typeof shippingService.getShippingRates === 'function'
                        ? shippingService.getShippingRates()()
                        : [];
                } catch (e) {
                    current = [];
                }

                if (ratesVisuallyEqual(current, ratesData)) {
                    return;
                }

                return originalSetShippingRates(ratesData);
            }
        );

        return shippingService;
    };
});
