/**
 * Copyright ? Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'jquery',
    'ko',
    'Magento_Checkout/js/view/shipping-address/address-renderer/default',
    'Magento_Checkout/js/model/quote'
], function ($, ko, AddressRendererView, quote) {
    'use strict';

    return AddressRendererView.extend({
        defaults: {
            template: 'Magento_NegotiableQuote/shipping-address/address-renderer/default'
        },
        isQuoteAddressLocked: false,

        /** @inheritdoc */
        initObservable: function () {
            var checkoutConfig = window.checkoutConfig;

            this._super();

            this.isQuoteAddressLocked = !!checkoutConfig.isQuoteAddressLocked;

            this.hasQuoteAddress = checkoutConfig.selectedShippingKey &&
                checkoutConfig.isAddressSelected &&
                checkoutConfig.isNegotiableQuote;

            if (this.hasQuoteAddress && quote.shippingAddress()) {
                this.defaultShippingKey = quote.shippingAddress().getKey();
            }

            this.isSelected = ko.computed(function () {
                var shippingAddress = quote.shippingAddress(),
                    isSelected = false,
                    shippingKey;

                if (shippingAddress) {
                    shippingKey = shippingAddress.getKey();

                    if (this.hasQuoteAddress && this.defaultShippingKey === shippingKey) {
                        this.defaultShippingKey = shippingKey = checkoutConfig.selectedShippingKey;
                    }

                    isSelected = shippingKey === this.address().getKey();
                } else if (this.hasQuoteAddress) {
                    isSelected = checkoutConfig.selectedShippingKey === this.address().getKey();
                }

                if (!$('body').hasClass('onepage-index-index') && isSelected) {
                    this.selectAddress();
                }

                return isSelected;
            }, this);

            return this;
        }
    });
});
