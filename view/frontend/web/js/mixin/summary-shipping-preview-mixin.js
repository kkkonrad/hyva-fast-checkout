define([
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/step-navigator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (quote, stepNavigator, isFastcheckoutActive) {
    'use strict';

    function isTwoStep() {
        var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

        return Boolean(settings && settings.twoStep);
    }

    function previewValue(component, field) {
        var method,
            value;

        // Keep the binding subscribed so the server value replaces the preview after Next.
        component.totals();
        method = quote.shippingMethod && quote.shippingMethod();

        if (!isFastcheckoutActive() || !isTwoStep() ||
            stepNavigator.isProcessed('shipping') || !method) {
            return null;
        }

        value = typeof method[field] === 'undefined' ? method.amount : method[field];

        return typeof value === 'undefined' ? null : component.getFormattedPrice(value);
    }

    return function (Component) {
        var extension = {
            getValue: function () {
                var preview = previewValue(this, 'price_excl_tax');

                return preview === null ? this._super() : preview;
            }
        };

        if (Component.prototype && typeof Component.prototype.getIncludingValue === 'function') {
            extension.getIncludingValue = function () {
                var preview = previewValue(this, 'price_incl_tax');

                return preview === null ? this._super() : preview;
            };
            extension.getExcludingValue = function () {
                var preview = previewValue(this, 'price_excl_tax');

                return preview === null ? this._super() : preview;
            };
        }

        return Component.extend(extension);
    };
});
