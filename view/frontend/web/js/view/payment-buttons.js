define([
    'Magento_Checkout/js/view/minicart',
    'jquery',
    'ko',
    'underscore',
], function (Minicart, $, ko, _) {
    'use strict';

    return Minicart.extend({
        /**
         * @override
         */
        update: function (updatedCart) {
            _.each(updatedCart, function (value, key) {
                this.cart[key] = ko.observable();
                this.cart[key](value);
            }, this);
        },

        /**
         * Trigger Content Update after rendering payment buttons
         */
        paymentButtonsUpdate: function (event) {
            $(event).find('div[data-mage-init]').each(function (i, el) {
                $(el).trigger('contentUpdated');
            });
        }
    });
});
