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

        splitMethodCode: function (value) {
            var parts = String(value || '').split('_'),
                carrier = parts.shift() || '';

            return {
                carrier_code: carrier,
                method_code: parts.length ? parts.join('_') : carrier
            };
        },

        initObservable: function () {
            var self = this;
            this._super().observe({
                errorMethodCode: '',
                errorValidationMessage: ''
            });

            this.selectedMethodCode = ko.pureComputed({
                read: function () {
                    var active = quote.shippingMethod();
                    if (!active) {
                        var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked');
                        return checkedDomRadio ? checkedDomRadio.value : null;
                    }
                    return active.carrier_code + '_' + active.method_code;
                },
                write: function (value) {
                    if (!value) {
                        return;
                    }
                    if (self && typeof self.clearError === 'function') {
                        self.clearError();
                    }
                    var rates = shippingService.getShippingRates()();
                    var found = null;
                    rates.some(function (rate) {
                        var c1 = rate.carrier_code + '_' + rate.method_code;
                        var c2 = rate.method_code + '_' + rate.carrier_code;
                        if (c1 === value || c2 === value || rate.carrier_code === value || rate.method_code === value) {
                            found = rate;
                            return true;
                        }
                        return false;
                    });

                    if (!found) {
                        var parsed = self.splitMethodCode(value);
                        found = {
                            carrier_code: parsed.carrier_code,
                            method_code: parsed.method_code,
                            carrier_title: '',
                            method_title: '',
                            amount: 0
                        };
                    }

                    selectShippingMethodAction(found);

                    if (
                        window.fastcheckoutHyvaShipping &&
                        typeof window.fastcheckoutHyvaShipping.syncShippingMethodToMagewire === 'function'
                    ) {
                        window.fastcheckoutHyvaShipping.syncShippingMethodToMagewire(value);
                        return;
                    }

                    // Sync the selected shipping method back to Magewire
                    var magewireEl = document.querySelector('[wire\\:id]');
                    if (magewireEl && magewireEl.__livewire) {
                        var wire = magewireEl.__livewire;
                        var currentMethod = wire.shippingMethod || (typeof wire.get === 'function' ? wire.get('shippingMethod') : (wire.data ? wire.data.shippingMethod : ''));
                        if (currentMethod !== value) {
                            
                            wire.call('selectShippingMethod', value);
                        }
                    }
                }
            }, this);

            return this;
        },

        initialize: function () {
            this._super();
            window.fastcheckoutHyvaShippingListInstance = this;

            // Re-render InPost widget when shipping rates change (e.g. on payment method switch)
            shippingService.getShippingRates().subscribe(function () {
                require(['inPostPaczkomaty'], function (inPostPaczkomaty) {
                    if (inPostPaczkomaty && typeof inPostPaczkomaty.renderInPostData === 'function') {
                        setTimeout(function () {
                            inPostPaczkomaty.renderInPostData().then(function() {
                                inPostPaczkomaty.insertLogoInPost();
                            });
                        }, 100);
                    }
                });
            });

            // Re-render InPost widget when shipping method changes
            quote.shippingMethod.subscribe(function () {
                require(['inPostPaczkomaty'], function (inPostPaczkomaty) {
                    if (inPostPaczkomaty && typeof inPostPaczkomaty.renderInPostData === 'function') {
                        setTimeout(function () {
                            inPostPaczkomaty.renderInPostData().then(function() {
                                inPostPaczkomaty.insertLogoInPost();
                            });
                        }, 100);
                    }
                });
            });
            
            return this;
        },

        setError: function (methodCode, message) {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (self._errorTimer) {
                clearTimeout(self._errorTimer);
                self._errorTimer = null;
            }
            if (typeof self.errorMethodCode === 'function') {
                self.errorMethodCode(methodCode);
                self.errorValidationMessage(message);
            }

            self._errorTimer = setTimeout(function () {
                self.clearError();
            }, 4000);
        },

        clearError: function () {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (self._errorTimer) {
                clearTimeout(self._errorTimer);
                self._errorTimer = null;
            }
            if (typeof self.errorMethodCode === 'function') {
                self.errorMethodCode('');
                self.errorValidationMessage('');
            }
        },

        hasError: function (method) {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            var fullCode = method.carrier_code + '_' + method.method_code;
            var altCode = method.method_code + '_' + method.carrier_code;
            var err = (typeof self.errorMethodCode === 'function') ? self.errorMethodCode() : '';
            return err && (err === fullCode || err === altCode);
        },

        getMethodCss: function (method) {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            var fullCode = method.carrier_code + '_' + method.method_code;
            var altCode = method.method_code + '_' + method.carrier_code;

            var currentSelected = (typeof self.selectedMethodCode === 'function') ? self.selectedMethodCode() : null;
            var active = quote.shippingMethod();
            var activeFull = active ? active.carrier_code + '_' + active.method_code : null;
            var activeAlt = active ? active.method_code + '_' + active.carrier_code : null;

            var isSelected = (currentSelected === fullCode || currentSelected === altCode) ||
                             (activeFull === fullCode || activeFull === altCode) ||
                             (activeAlt === fullCode || activeAlt === altCode);

            var hasErr = self.hasError ? self.hasError(method) : false;

            if (hasErr) {
                return 'border-2 border-red-400 bg-red-50/10';
            }
            if (isSelected) {
                return 'border-2 border-blue-500 bg-blue-50/10 shadow-sm';
            }
            return 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50/50';
        },

        isSelectedVal: function (method) {
            var active = quote.shippingMethod();
            if (!active) {
                return false;
            }
            var fullCode = method.carrier_code + '_' + method.method_code;
            var altCode = method.method_code + '_' + method.carrier_code;
            var activeFull = active.carrier_code + '_' + active.method_code;
            var activeAlt = active.method_code + '_' + active.carrier_code;
            return activeFull === fullCode || activeFull === altCode || activeAlt === fullCode || activeAlt === altCode;
        },

        selectShippingMethod: function (method) {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (method && typeof self.selectedMethodCode === 'function') {
                self.selectedMethodCode(method.carrier_code + '_' + method.method_code);
            }
            return true;
        },

        formatPrice: function (price) {
            return priceUtils.formatPrice(price, quote.getPriceFormat());
        }
    });
});
