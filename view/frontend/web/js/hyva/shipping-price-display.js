/**
 * Magento tax/cart shipping display for Fastcheckout rate labels.
 * Mirrors Magento_Tax/js/view/checkout/shipping_method/price flags from checkoutConfig.
 */
define([], function () {
    'use strict';

    /**
     * @param {Object} method Rate from shippingService (amount, price_excl_tax, price_incl_tax)
     * @param {Object} [config] window.checkoutConfig (or subset)
     * @returns {{primary: number, secondary: number|null, showSecondary: boolean, primaryIsExcl: boolean}}
     */
    function getShippingDisplayPrices(method, config) {
        var cfg = config || {},
            amount = method && method.amount != null ? Number(method.amount) : 0,
            excl = method && method.price_excl_tax != null ? Number(method.price_excl_tax) : amount,
            incl = method && method.price_incl_tax != null ? Number(method.price_incl_tax) : amount,
            showExclPrimary = !!cfg.isDisplayShippingPriceExclTax,
            both = !!cfg.isDisplayShippingBothPrices && excl !== incl;

        return {
            primary: showExclPrimary ? excl : incl,
            secondary: both ? excl : null,
            showSecondary: both,
            primaryIsExcl: showExclPrimary
        };
    }

    return {
        getShippingDisplayPrices: getShippingDisplayPrices
    };
});
