define(
    ['ko'],
    function (ko) {
        'use strict';
        var billingAddress = ko.observable(null);
        var shippingAddress = ko.observable(null);
        var shippingMethod = ko.observable(null);
        var paymentMethod = ko.observable(null);
        var quoteData = window.checkoutConfig.quoteData;
        var basePriceFormat = window.checkoutConfig.basePriceFormat;
        var priceFormat = window.checkoutConfig.priceFormat;
        var storeCode = window.checkoutConfig.storeCode;
        var totalsData = window.checkoutConfig.totalsData;
        var totals = ko.observable(totalsData);
        var collectedTotals = ko.observable({});
        var opcConfig = window.checkoutConfig.iwdOpcSettings;
        return {
            totals: totals,
            shippingAddress: shippingAddress,
            shippingMethod: shippingMethod,
            billingAddress: billingAddress,
            paymentMethod: paymentMethod,
            guestEmail: null,
            isCustomerLoggedIn: function () {
                return window.checkoutConfig.isCustomerLoggedIn;
            },
            getCustomerGroupId: function () {
                return quoteData.customer_group_id;
            },
            getPaymentTitleType: function () {
                return opcConfig ? opcConfig.paymentTitleType : undefined;
            },
            getPaymentImagePath: function (type) {
                return opcConfig ? opcConfig.paymentLogosImages[type] : undefined;
            },
            isRestrictPaymentEnable: function () {
                return opcConfig ? opcConfig.isRestrictPaymentEnable : undefined;
            },
            getRestrictedPaymentMethods: function () {
                return opcConfig ? opcConfig.restrictedPaymentMethods : undefined;
            },
            getDefaultShippingMethod: function () {
                return opcConfig ? opcConfig.defaultShippingMethod : undefined;
            },
            getDefaultPaymentMethod: function () {
                return opcConfig ? opcConfig.defaultPaymentMethod : undefined;
            },
            getSelectedShippingMethod: function () {
                return window.checkoutConfig.selectedShippingMethod;
            },
            setDefaultShippingMethod: function (defaultShippingMethod) {
                if(opcConfig) {
                    opcConfig.defaultShippingMethod = defaultShippingMethod;
                }
            },
            setSelectedShippingMethod: function (selectedShippingMethod) {
                return window.checkoutConfig.selectedShippingMethod = selectedShippingMethod;
            },
            getLogoutUrl: function () {
                return opcConfig ? opcConfig.logoutUrl : undefined;
            },
            getForgotPasswordUrl: function () {
                return opcConfig ? opcConfig.forgotPasswordUrl : undefined;
            },
            isShowLoginButton: function () {
                return opcConfig ? opcConfig.isShowLoginButton : undefined;
            },
            isShowGiftMessage: function () {
                return opcConfig ? opcConfig.isShowGiftMessage : undefined;
            },
            isShowComment: function () {
                return opcConfig ? opcConfig.isShowComment : undefined;
            },
            isShowDiscount: function () {
                return opcConfig ? opcConfig.isShowDiscount : undefined;
            },
            isShowSubscribe: function () {
                return opcConfig ? opcConfig.isShowSubscribe : undefined;
            },
            isReloadShippingOnDiscount: function () {
                return opcConfig ? opcConfig.isReloadShippingOnDiscount : undefined;
            },
            isSubscribeByDefault: function () {
                return opcConfig ? opcConfig.isSubscribeByDefault : undefined;
            },
            getQuoteId: function () {
                return quoteData.entity_id;
            },
            isVirtual: function () {
                return !!Number(quoteData.is_virtual);
            },
            getPriceFormat: function () {
                return priceFormat;
            },
            getBasePriceFormat: function () {
                return basePriceFormat;
            },
            getItems: function () {
                return window.checkoutConfig.quoteItemData;
            },
            getTotals: function () {
                return totals;
            },
            setTotals: function (totalsData) {
                if (_.isObject(totalsData) && _.isObject(totalsData.extension_attributes)) {
                    _.each(totalsData.extension_attributes, function (element, index) {
                        totalsData[index] = element;
                    });
                }
                totals(totalsData);
                this.setCollectedTotals('subtotal_with_discount', parseFloat(totalsData.subtotal_with_discount));
            },
            setPaymentMethod: function (paymentMethodCode) {
                paymentMethod(paymentMethodCode);
            },
            getPaymentMethod: function () {
                return paymentMethod;
            },
            getStoreCode: function () {
                return storeCode;
            },
            setCollectedTotals: function (code, value) {
                var totals = collectedTotals();
                totals[code] = value;
                collectedTotals(totals);
            },
            getCalculatedTotal: function () {
                var total = 0.;
                _.each(collectedTotals(), function (value) {
                    total += value;
                });
                return total;
            }
        };
    }
);
