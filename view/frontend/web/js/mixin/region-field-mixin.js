/**
 * Magento stock region component does not clear its value when the country changes.
 * That leaves a stale region_id (and free-text region) from the previous country —
 * invalid for estimate/shipping-information and confusing in the UI.
 *
 * Clear region only when the country *actually changes* (not on first paint / re-set
 * of the same country during guest-address restore).
 */
define([
    'uiRegistry',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (registry, isFastcheckoutActive) {
    'use strict';

    return function (Region) {
        return Region.extend({
            /**
             * @param {String} value Selected country ID
             * @returns {*}
             */
            update: function (value) {
                var previousCountry = this._fastcheckoutLastCountryId,
                    countryChanged,
                    result,
                    self = this;

                result = this._super(value);

                if (!isFastcheckoutActive() || !value) {
                    if (value) {
                        this._fastcheckoutLastCountryId = String(value);
                    }
                    return result;
                }

                value = String(value);
                countryChanged = !!(
                    previousCountry &&
                    previousCountry !== value
                );
                this._fastcheckoutLastCountryId = value;

                // First paint / restore re-apply of the same country must keep region.
                if (!countryChanged) {
                    return result;
                }

                this._fastcheckoutClearRegionSelection();

                // Option filter (filterBy → setOptions) may finish just after update;
                // re-assert empty so a stale region_id cannot stick.
                [0, 50].forEach(function (delay) {
                    window.setTimeout(function () {
                        // Abort if country changed again in the meantime.
                        if (self._fastcheckoutLastCountryId !== value) {
                            return;
                        }
                        self._fastcheckoutClearRegionSelection();
                    }, delay);
                });

                return result;
            },

            /**
             * Clear select value, free-text region input, provider scope, validation error.
             */
            _fastcheckoutClearRegionSelection: function () {
                try {
                    if (typeof this.value === 'function') {
                        if (this.value() !== '' && this.value() != null) {
                            this.value('');
                        }
                    }
                } catch (e) {
                    // ignore
                }

                if (typeof this.error === 'function') {
                    try {
                        this.error(false);
                    } catch (e2) {
                        // ignore
                    }
                }

                // Free-text "region" input (countries without a region directory list).
                if (this.customName && registry && typeof registry.get === 'function') {
                    try {
                        registry.get(this.customName, function (input) {
                            if (!input) {
                                return;
                            }
                            if (typeof input.value === 'function' && input.value()) {
                                input.value('');
                            }
                            if (typeof input.error === 'function') {
                                input.error(false);
                            }
                        });
                    } catch (e3) {
                        // ignore
                    }
                }

                // Keep checkoutProvider in sync (avoids stale region_id in estimate payloads).
                try {
                    if (this.source && typeof this.source.set === 'function' && this.dataScope) {
                        this.source.set(this.dataScope, '');
                        if (String(this.dataScope).indexOf('region_id') !== -1) {
                            this.source.set(String(this.dataScope).replace(/region_id$/, 'region'), '');
                        }
                    }
                } catch (e4) {
                    // ignore
                }
            }
        });
    };
});
