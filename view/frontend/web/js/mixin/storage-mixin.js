define([
    'jquery',
    'mage/utils/wrapper'
], function ($, wrapper) {
    'use strict';

    function getWire() {
        var el = document.querySelector('[wire\\:id]');
        return el && window.Livewire ? window.Livewire.find(el.getAttribute('wire:id')) : null;
    }

    function shouldIntercept(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }
        var endpoints = [
            '/totals-information',
            '/shipping-information',
            '/payment-information',
            '/set-payment-information',
            '/estimate-shipping-methods'
        ];
        return endpoints.some(function (endpoint) {
            return url.indexOf(endpoint) !== -1;
        });
    }

    function handleIntercept(url, data, type) {
        var deferred = $.Deferred();
        var wire = getWire();

        if (!wire) {
            deferred.reject(new Error('Magewire not available'));
            return deferred.promise();
        }

        // Sync payment method selection if set-payment-information is called
        if (url.indexOf('/set-payment-information') !== -1 && data) {
            try {
                var parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (parsed && parsed.paymentMethod && parsed.paymentMethod.method) {
                    wire.call('selectPaymentMethod', parsed.paymentMethod.method);
                }
            } catch (e) {}
        }

        // Call Magewire to refresh and get the current quote state
        wire.call('refreshCheckoutState').then(function (state) {
            if (!state || typeof state !== 'object') {
                deferred.resolve({});
                return;
            }

            if (url.indexOf('/totals-information') !== -1) {
                deferred.resolve(state.totals || {});
            } else if (url.indexOf('/shipping-information') !== -1 || url.indexOf('/payment-information') !== -1) {
                deferred.resolve({
                    totals: state.totals || {},
                    payment_methods: state.payment_methods || []
                });
            } else if (url.indexOf('/estimate-shipping-methods') !== -1) {
                deferred.resolve(state.shipping_rates || []);
            } else {
                deferred.resolve({});
            }
        }).catch(function (error) {
            deferred.reject(error);
        });

        return deferred.promise();
    }

    return function (storage) {
        if (!storage) {
            return storage;
        }

        storage.get = wrapper.wrap(storage.get, function (originalGet, url, global, contentType, headers) {
            if (shouldIntercept(url)) {
                return handleIntercept(url, null, 'GET');
            }
            return originalGet(url, global, contentType, headers);
        });

        storage.post = wrapper.wrap(storage.post, function (originalPost, url, data, global, contentType, headers, async) {
            if (shouldIntercept(url)) {
                return handleIntercept(url, data, 'POST');
            }
            return originalPost(url, data, global, contentType, headers, async);
        });

        storage.put = wrapper.wrap(storage.put, function (originalPut, url, data, global, contentType, headers) {
            if (shouldIntercept(url)) {
                return handleIntercept(url, data, 'PUT');
            }
            return originalPut(url, data, global, contentType, headers);
        });

        storage.delete = wrapper.wrap(storage.delete, function (originalDelete, url, global, contentType, headers) {
            if (shouldIntercept(url)) {
                return handleIntercept(url, null, 'DELETE');
            }
            return originalDelete(url, global, contentType, headers);
        });

        return storage;
    };
});
