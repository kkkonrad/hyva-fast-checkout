define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    function getCheckoutRoot() {
        return isFastcheckoutActive() ? document.getElementById('fastcheckout-checkout') : null;
    }

    function getWire() {
        var root = getCheckoutRoot(),
            el,
            livewire = window.Livewire || window.Magewire;

        if (!root || !livewire || typeof livewire.find !== 'function') {
            return null;
        }

        el = root.hasAttribute('wire:id') ? root : root.querySelector('[wire\\:id]');

        return el ? livewire.find(el.getAttribute('wire:id')) : null;
    }

    function getEndpoint(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }

        if (url.indexOf('/totals-information') !== -1) {
            return 'totals';
        }
        if (url.indexOf('/shipping-information') !== -1) {
            return 'shippingInformation';
        }
        if (url.indexOf('/set-payment-information') !== -1) {
            return 'setPaymentInformation';
        }
        if (url.indexOf('/payment-information') !== -1) {
            return 'paymentInformation';
        }
        if (url.indexOf('/estimate-shipping-methods') !== -1) {
            return 'estimateShippingMethods';
        }

        return '';
    }

    function shouldIntercept(url, type) {
        var endpoint,
            method = (type || 'GET').toUpperCase();

        if (!getCheckoutRoot()) {
            return false;
        }

        if (!url || typeof url !== 'string') {
            return false;
        }

        endpoint = getEndpoint(url);

        if (!endpoint) {
            return false;
        }

        if (endpoint === 'paymentInformation' && method !== 'GET') {
            return false;
        }

        return true;
    }

    function refreshCheckoutState(wire) {
        if (!wire || typeof wire.call !== 'function') {
            return Promise.reject(new Error('Magewire not available'));
        }

        return Promise.resolve(wire.call('refreshCheckoutState'));
    }

    function handleIntercept(url, data, type) {
        var deferred = $.Deferred();
        var wire = getWire(),
            endpoint = getEndpoint(url),
            paymentSync = Promise.resolve();

        if (!wire) {
            deferred.reject(new Error('Magewire not available'));
            return deferred.promise();
        }

        if (endpoint === 'setPaymentInformation' && data) {
            try {
                var parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (parsed && parsed.paymentMethod && parsed.paymentMethod.method) {
                    paymentSync = Promise.resolve(wire.call('selectPaymentMethod', parsed.paymentMethod.method));
                }
            } catch (e) {}
        }

        paymentSync.then(function () {
            return refreshCheckoutState(wire);
        }).then(function (state) {
            if (!state || typeof state !== 'object') {
                deferred.resolve({});
                return;
            }

            if (endpoint === 'totals') {
                deferred.resolve(state.totals || {});
            } else if (endpoint === 'shippingInformation' || endpoint === 'paymentInformation') {
                deferred.resolve({
                    totals: state.totals || {},
                    payment_methods: state.payment_methods || []
                });
            } else if (endpoint === 'estimateShippingMethods') {
                deferred.resolve(state.shipping_rates || []);
            } else if (endpoint === 'setPaymentInformation') {
                deferred.resolve(true);
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
            if (shouldIntercept(url, 'GET') && getWire()) {
                return handleIntercept(url, null, 'GET');
            }
            return originalGet(url, global, contentType, headers);
        });

        storage.post = wrapper.wrap(storage.post, function (originalPost, url, data, global, contentType, headers, async) {
            if (shouldIntercept(url, 'POST') && getWire()) {
                return handleIntercept(url, data, 'POST');
            }
            return originalPost(url, data, global, contentType, headers, async);
        });

        storage.put = wrapper.wrap(storage.put, function (originalPut, url, data, global, contentType, headers) {
            if (shouldIntercept(url, 'PUT') && getWire()) {
                return handleIntercept(url, data, 'PUT');
            }
            return originalPut(url, data, global, contentType, headers);
        });

        storage.delete = wrapper.wrap(storage.delete, function (originalDelete, url, global, contentType, headers) {
            if (shouldIntercept(url, 'DELETE') && getWire()) {
                return handleIntercept(url, null, 'DELETE');
            }
            return originalDelete(url, global, contentType, headers);
        });

        return storage;
    };
});
