define([
    'ko',
    'uiComponent',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/action/select-shipping-method',
    'Magento_Checkout/js/model/quote',
    'Magento_Catalog/js/price-utils'
], function (ko, Component, shippingService, selectShippingMethodAction, quote, priceUtils) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/shipping-list'
        },

        rates: shippingService.getShippingRates(),
        isLoading: shippingService.isLoading,

        initObservable: function () {
            this._super().observe({
                errorValidationMessage: ''
            });
            return this;
        },

        initialize: function () {
            this._super();
            window.iwdOpcHyvaShippingListInstance = this;
            if (window.console && typeof window.console.log === 'function') {
                window.console.log('Kkkonrad OPC: shipping-list JS component initialized');
            }
            return this;
        },

        isSelectedVal: function (method) {
            var active = quote.shippingMethod();
            if (!active) {
                return false;
            }
            return (active.carrier_code + '_' + active.method_code) === (method.carrier_code + '_' + method.method_code);
        },

        selectedMethodCode: ko.pureComputed({
            read: function () {
                var active = quote.shippingMethod();
                return active ? active.carrier_code + '_' + active.method_code : null;
            },
            write: function (value) {
                if (!value) {
                    return;
                }
                var rates = shippingService.getShippingRates()();
                var found = rates.filter(function (rate) {
                    return (rate.carrier_code + '_' + rate.method_code) === value;
                })[0];
                if (found) {
                    selectShippingMethodAction(found);

                    // Sync the selected shipping method back to Magewire
                    var magewireEl = document.querySelector('[wire\\:id]');
                    if (magewireEl && magewireEl.__livewire) {
                        var wire = magewireEl.__livewire;
                        var currentMethod = wire.shippingMethod || (typeof wire.get === 'function' ? wire.get('shippingMethod') : (wire.data ? wire.data.shippingMethod : ''));
                        if (currentMethod !== value) {
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: KO selected shipping method, syncing to Magewire:', value);
                            }
                            wire.call('selectShippingMethod', value);
                        }
                    }
                }
            }
        }),

        selectShippingMethod: function (method) {
            if (method) {
                this.selectedMethodCode(method.carrier_code + '_' + method.method_code);
                this.errorValidationMessage('');
            }
            return true;
        },

        formatPrice: function (price) {
            return priceUtils.formatPrice(price, quote.getPriceFormat());
        }
    });
});
