define([
    'jquery'
], function ($) {
    'use strict';

    return function (checkoutData) {
        if (!checkoutData) {
            return checkoutData;
        }

        var cacheKey = 'checkout-data';

        var getData = function () {
            try {
                var raw = window.localStorage ? window.localStorage.getItem(cacheKey) : null;
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        };

        var saveData = function (data) {
            try {
                if (window.localStorage) {
                    window.localStorage.setItem(cacheKey, JSON.stringify(data));
                }
            } catch (e) {}
        };

        if (typeof checkoutData.setShippingInPostPoint !== 'function') {
            checkoutData.setShippingInPostPoint = function (data) {
                var obj = getData();
                obj.shippingInPostPointData = data;
                saveData(obj);
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
