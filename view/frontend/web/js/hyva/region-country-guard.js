/**
 * Strip a region that belongs to a different country than the address carries.
 *
 * Stock checkout cannot reach this state: Knockout resets the region_id observable as soon
 * as the country filter removes it from the option list, and the quote address is rebuilt
 * from provider data. Fastcheckout keeps and re-pushes the existing quote address across a
 * country change, so a region_id from the previous country can survive and reach
 * estimate-shipping-methods / shipping-information — e.g. a Polish region_id on a GB address.
 *
 * region_id -> country_id comes from the region component's own initialOptions, i.e. exactly
 * the directory data Magento filters the region select with.
 */
define([
    'uiRegistry'
], function (registry) {
    'use strict';

    function getRegionOptions() {
        var component;

        if (!registry || typeof registry.filter !== 'function') {
            return null;
        }

        component = registry.filter(function (item) {
            return item &&
                item.dataScope === 'shippingAddress.region_id' &&
                item.initialOptions &&
                item.initialOptions.length;
        })[0];

        return component ? component.initialOptions : null;
    }

    return {
        /**
         * Mutates the address in place and returns it.
         *
         * @param {Object} address quote address or plain address data
         * @returns {Object}
         */
        dropRegionFromOtherCountry: function (address) {
            var countryId,
                regionId,
                options,
                match;

            if (!address) {
                return address;
            }

            countryId = String(address.country_id || address.countryId || '').trim();
            regionId = String(address.region_id || address.regionId || '').trim();

            // AddressInterface::setRegionId() accepts an integer. JSON.stringify omits
            // undefined properties, while an empty string reaches the REST input
            // processor and causes a type error before rate estimation can run.
            if (!regionId) {
                address.region_id = undefined;
                address.regionId = undefined;

                return address;
            }

            if (!countryId) {
                return address;
            }

            options = getRegionOptions();
            if (!options) {
                return address;
            }

            match = options.filter(function (option) {
                return option && String(option.value) === regionId;
            })[0];

            // Unknown id: leave it alone rather than guess.
            if (!match || !match.country_id) {
                return address;
            }

            if (String(match.country_id) !== countryId) {
                address.region_id = undefined;
                address.regionId = undefined;
                address.region = '';
            }

            return address;
        }
    };
});
