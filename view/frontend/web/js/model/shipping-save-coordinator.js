define([
    'jquery',
    'ko',
    'Magento_Checkout/js/model/quote'
], function ($, ko, quote) {
    'use strict';

    var pending = null,
        savedSignature = null;

    function addressData(address) {
        var fields = [
                'customerAddressId',
                'customerId',
                'email',
                'countryId',
                'regionId',
                'regionCode',
                'region',
                'street',
                'company',
                'telephone',
                'fax',
                'postcode',
                'city',
                'firstname',
                'lastname',
                'middlename',
                'prefix',
                'suffix',
                'vatId',
                'saveInAddressBook',
                'customAttributes',
                'extensionAttributes',
                'extension_attributes'
            ],
            data = {};

        if (!address) {
            return null;
        }

        fields.forEach(function (field) {
            if (typeof address[field] !== 'undefined') {
                data[field] = ko.unwrap(address[field]);
            }
        });

        return ko.toJS(data);
    }

    function currentSignature() {
        var method = quote.shippingMethod && quote.shippingMethod();

        return JSON.stringify({
            shippingAddress: addressData(quote.shippingAddress && quote.shippingAddress()),
            billingAddress: addressData(quote.billingAddress && quote.billingAddress()),
            shippingMethod: method ? {
                carrierCode: method.carrier_code,
                methodCode: method.method_code
            } : null
        });
    }

    function resolvedPromise() {
        return $.Deferred().resolve().promise();
    }

    function loadNativeAction() {
        var deferred = $.Deferred();

        require([
            'Magento_Checkout/js/action/set-shipping-information'
        ], deferred.resolve, deferred.reject);

        return deferred.promise();
    }

    function ensureSaved() {
        var deferred,
            request,
            requestSignature;

        if (quote.isVirtual && quote.isVirtual()) {
            return resolvedPromise();
        }

        if (pending) {
            return pending.then(ensureSaved);
        }

        if (savedSignature !== null && savedSignature === currentSignature()) {
            return resolvedPromise();
        }

        deferred = $.Deferred();
        pending = deferred.promise();

        loadNativeAction().done(function (setShippingInformation) {
            try {
                request = setShippingInformation();
                // The native processor can synchronously resolve billing=shipping.
                requestSignature = currentSignature();
            } catch (error) {
                pending = null;
                deferred.reject(error);

                return;
            }

            $.when(request).done(function () {
                savedSignature = requestSignature;
                pending = null;
                deferred.resolve.apply(deferred, arguments);
            }).fail(function () {
                pending = null;
                deferred.reject.apply(deferred, arguments);
            });
        }).fail(function () {
            pending = null;
            deferred.reject.apply(deferred, arguments);
        });

        return deferred.promise();
    }

    return {
        ensureSaved: ensureSaved,
        isSaved: function () {
            return quote.isVirtual && quote.isVirtual() ||
                savedSignature !== null && savedSignature === currentSignature();
        }
    };
});
