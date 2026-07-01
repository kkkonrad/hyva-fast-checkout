define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, isFastcheckoutActive) {
    'use strict';

    return function (checkoutData) {
        if (!checkoutData) {
            return checkoutData;
        }

        var cacheKey = 'checkout-data',
            storeCode = window.checkoutConfig && window.checkoutConfig.storeCode
                ? window.checkoutConfig.storeCode
                : 'default',
            fallbackWarningShown = false;

        var getData = function () {
            var cache;

            try {
                cache = window.localStorage ? JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}') : {};
                return cache[cacheKey] || {};
            } catch (e) {
                return {};
            }
        };

        var saveData = function (data) {
            var cache;

            try {
                if (window.localStorage) {
                    cache = JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}');
                    cache[cacheKey] = data;
                    window.localStorage.setItem('mage-cache-storage', JSON.stringify(cache));
                }
            } catch (e) {}
        };

        var setAddressByStore = function (currentValue, value) {
            currentValue = currentValue || {};
            currentValue[storeCode] = value;

            return currentValue;
        };

        var saveSetterFallback = function (method, value) {
            var data = getData();

            switch (method) {
                case 'setSelectedShippingAddress':
                    data.selectedShippingAddress = value;
                    break;
                case 'setShippingAddressFromData':
                    data.shippingAddressFromData = setAddressByStore(data.shippingAddressFromData, value);
                    break;
                case 'setNewCustomerShippingAddress':
                    data.newCustomerShippingAddress = setAddressByStore(data.newCustomerShippingAddress, value);
                    break;
                case 'setSelectedShippingRate':
                    data.selectedShippingRate = value;
                    break;
                case 'setSelectedPaymentMethod':
                    data.selectedPaymentMethod = value;
                    break;
                case 'setSelectedBillingAddress':
                    data.selectedBillingAddress = value;
                    break;
                case 'setBillingAddressFromData':
                    data.billingAddressFromData = value;
                    break;
                case 'setNewCustomerBillingAddress':
                    data.newCustomerBillingAddress = value;
                    break;
                case 'setValidatedEmailValue':
                    data.validatedEmailValue = value;
                    break;
                case 'setInputFieldEmailValue':
                    data.inputFieldEmailValue = value;
                    break;
                case 'setCheckedEmailValue':
                    data.checkedEmailValue = value;
                    break;
            }

            saveData(data);
        };

        var dispatchCheckoutDataUpdate = function (method, value) {
            if (
                !isFastcheckoutActive() ||
                window.fastcheckoutSuppressCheckoutDataBridge ||
                !window.fastcheckoutCheckoutDataBufferReady
            ) {
                return;
            }

            window.dispatchEvent(new CustomEvent('fastcheckout:checkout-data-set', {
                detail: {
                    method: method,
                    value: value
                }
            }));
        };

        var wrapSetter = function (method) {
            var originalMethod;

            if (typeof checkoutData[method] !== 'function') {
                return;
            }

            originalMethod = checkoutData[method];
            checkoutData[method] = function (value) {
                var result;

                try {
                    result = originalMethod.apply(checkoutData, arguments);
                } catch (e) {
                    saveSetterFallback(method, value);
                    if (!fallbackWarningShown && window.console && typeof window.console.warn === 'function') {
                        fallbackWarningShown = true;
                        window.console.warn(
                            'Kkkonrad Fastcheckout: checkout-data storage is not ready, using local fallback.',
                            e
                        );
                    }
                }

                dispatchCheckoutDataUpdate(method, value);

                return result;
            };
        };

        [
            'setSelectedShippingAddress',
            'setShippingAddressFromData',
            'setNewCustomerShippingAddress',
            'setSelectedShippingRate',
            'setSelectedPaymentMethod',
            'setSelectedBillingAddress',
            'setBillingAddressFromData',
            'setNewCustomerBillingAddress',
            'setValidatedEmailValue',
            'setInputFieldEmailValue',
            'setCheckedEmailValue'
        ].forEach(wrapSetter);

        if (typeof checkoutData.setShippingInPostPoint !== 'function') {
            checkoutData.setShippingInPostPoint = function (data) {
                var obj = getData();
                obj.shippingInPostPointData = data;
                saveData(obj);
                dispatchCheckoutDataUpdate('setShippingInPostPoint', data);
            };
        }

        if (typeof checkoutData.getShippingInPostPoint !== 'function') {
            checkoutData.getShippingInPostPoint = function () {
                var obj = getData();
                return obj.shippingInPostPointData || null;
            };
        }

        if (typeof checkoutData.setShippingInPostMode !== 'function') {
            checkoutData.setShippingInPostMode = function (data) {
                var obj = getData();
                obj.shippingInPostModeData = data;
                saveData(obj);
                dispatchCheckoutDataUpdate('setShippingInPostMode', data);
            };
        }

        if (typeof checkoutData.getShippingInPostMode !== 'function') {
            checkoutData.getShippingInPostMode = function () {
                var obj = getData();
                return obj.shippingInPostModeData || null;
            };
        }

        return checkoutData;
    };
});
