define([
    'jquery',
    'Magento_Customer/js/customer-data',
    'IWD_Opc/js/model/quote'
], function ($, storage, quote) {
    'use strict';

    var cacheKey = 'checkout-data';

    var getData = function () {
        return storage.get(cacheKey)();
    };

    var saveData = function (checkoutData) {
        storage.set(cacheKey, checkoutData);
    };

    /**
     * @return {*}
     */
    getData = function () {
        var data = storage.get(cacheKey)();

        if ($.isEmptyObject(data)) {
            data = {
                'selectedShippingAddress': null,
                'shippingAddressFromData': null,
                'newCustomerShippingAddress': null,
                'selectedShippingRate': null,
                'selectedPaymentMethod': null,
                'selectedBillingAddress': null,
                'billingAddressFormData': null,
                'newCustomerBillingAddress': null
            };
            saveData(data);
        } else {
            if(typeof window.checkoutData == 'undefined'){
                window.checkoutData = {};
            }
            window.checkoutData.billingAddressFormData = data.billingAddressFormData;
            window.checkoutData.shippingAddressFromData = data.shippingAddressFromData;
        }

        return data;
    };

    return {
        setNeedEstimateShippingRates:function (data) {
            var obj = getData();
            obj.needEstimateShippingRates = data;
            saveData(obj);
        },

        getNeedEstimateShippingRates: function () {
            if(getData().needEstimateShippingRates === null || getData().needEstimateShippingRates === undefined){
                this.setNeedEstimateShippingRates(true);
            }
            return getData().needEstimateShippingRates;
        },

        setSelectedShippingAddress: function (data) {
            var obj = getData();
            obj.selectedShippingAddress = data;
            saveData(obj);
        },

        getSelectedShippingAddress: function () {
            return getData().selectedShippingAddress;
        },

        setShippingAddressFromData: function (data) {
            var obj = getData();
            obj.shippingAddressFromData = data;
            saveData(obj);
        },

        getShippingAddressFromData: function () {
            return getData().shippingAddressFromData;
        },

        setNewCustomerShippingAddress: function (data) {
            var obj = getData();
            obj.newCustomerShippingAddress = data;
            saveData(obj);
        },

        getNewCustomerShippingAddress: function () {
            return getData().newCustomerShippingAddress;
        },

        setSelectedShippingRate: function (data) {
            var obj = getData();
            obj.selectedShippingRate = data;
            saveData(obj);
        },

        getSelectedShippingRate: function () {
            return getData().selectedShippingRate;
        },

        setSelectedPaymentMethod: function (data) {
            var obj = getData();
            obj.selectedPaymentMethod = data;
            saveData(obj);
        },

        getSelectedPaymentMethod: function () {
            return getData().selectedPaymentMethod;
        },

        setComment: function (data) {
            var obj = getData();
            obj.comment = data;
            saveData(obj);
        },

        getComment: function () {
            return getData().comment;
        },

        setIsSubscribe: function (data) {
            var obj = getData();
            obj.isSubscribe = data;
            saveData(obj);
        },

        getIsSubscribe: function () {
            if(getData().isSubscribe === null || getData().isSubscribe === undefined){
                this.setIsSubscribe(quote.isSubscribeByDefault());
            }

            return getData().isSubscribe;
        },

        setSelectedBillingAddress: function (data) {
            var obj = getData();
            obj.selectedBillingAddress = data;
            saveData(obj);
        },

        getSelectedBillingAddress: function () {
            return getData().selectedBillingAddress;
        },

        setBillingAddressFromData: function (data) {
            var obj = getData();
            obj.billingAddressFromData = data;
            saveData(obj);
        },

        getBillingAddressFromData: function () {
            return getData().billingAddressFromData;
        },

        setNewCustomerBillingAddress: function (data) {
            var obj = getData();
            obj.newCustomerBillingAddress = data;
            saveData(obj);
        },

        getNewCustomerBillingAddress: function () {
            return getData().newCustomerBillingAddress;
        },

        getValidatedEmailValue: function () {
            var obj = getData();
            return (obj.validatedEmailValue) ? obj.validatedEmailValue : '';
        },

        setValidatedEmailValue: function (email) {
            var obj = getData();
            obj.validatedEmailValue = email;
            saveData(obj);
        },

        getInputFieldEmailValue: function () {
            var obj = getData();
            return (obj.inputFieldEmailValue) ? obj.inputFieldEmailValue : '';
        },

        setInputFieldEmailValue: function (email) {
            var obj = getData();
            obj.inputFieldEmailValue = email;
            saveData(obj);
        },

        setIsPasswordVisible: function (data) {
            var obj = getData();
            obj.isPasswordVisible = data;
            saveData(obj);
        },

        getIsPasswordVisible: function () {
            return getData().isPasswordVisible;
        },

        /**
         * Pulling the checked email value from persistence storage
         *
         * @return {*}
         */
        getCheckedEmailValue: function () {
            var obj = getData();

            return obj.checkedEmailValue ? obj.checkedEmailValue : '';
        },

        /**
         * Setting the checked email value pulled from persistence storage
         *
         * @param {String} email
         */
        setCheckedEmailValue: function (email) {
            var obj = getData();

            obj.checkedEmailValue = email;
            saveData(obj);
        }
    }
});
