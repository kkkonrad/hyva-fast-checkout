define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    var checkoutStateRefreshPromise = null,
        checkoutStateLastPayload = null,
        checkoutStateLastPayloadAt = 0;

    function getEmailFromDomOrQuote() {
        var emailEl = document.getElementById('co-shipping-email') ||
                      document.querySelector('input[name="email"]') ||
                      document.querySelector('input[type="email"]') ||
                      document.querySelector('[data-wire-field="email"]');

        if (emailEl && emailEl.value) {
            return emailEl.value;
        }

        if (window.checkoutConfig && window.checkoutConfig.customerData && window.checkoutConfig.customerData.email) {
            return window.checkoutConfig.customerData.email;
        }

        if (window.checkoutConfig && window.checkoutConfig.quoteData && window.checkoutConfig.quoteData.customer_email) {
            return window.checkoutConfig.quoteData.customer_email;
        }

        return '';
    }

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
        if (url.indexOf('/billing-address') !== -1) {
            return 'billingAddress';
        }
        if (url.indexOf('/set-payment-information') !== -1) {
            return 'setPaymentInformation';
        }
        if (url.indexOf('/payment-information') !== -1) {
            return 'paymentInformation';
        }
        if (/\/order(?:[?#/]|$)/.test(url)) {
            return 'placeOrder';
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

    function shouldPassThroughMagento(url, type) {
        var endpoint,
            method = (type || 'GET').toUpperCase();

        if (!getCheckoutRoot() || !url || typeof url !== 'string') {
            return false;
        }

        endpoint = getEndpoint(url);

        return (endpoint === 'shippingInformation' || endpoint === 'billingAddress') && method === 'POST';
    }

    function refreshCheckoutState(wire, force) {
        if (!wire || typeof wire.call !== 'function') {
            return Promise.reject(new Error('Magewire not available'));
        }

        if (!force && checkoutStateLastPayload && Date.now() - checkoutStateLastPayloadAt < 750) {
            return Promise.resolve(checkoutStateLastPayload);
        }

        if (checkoutStateRefreshPromise) {
            if (force) {
                return checkoutStateRefreshPromise.catch(function () {
                    return true;
                }).then(function () {
                    return refreshCheckoutState(wire, true);
                });
            }

            return checkoutStateRefreshPromise;
        }

        checkoutStateRefreshPromise = Promise.resolve(wire.call('refreshCheckoutState'))
            .then(function (payload) {
                if (payload && typeof payload === 'object' && payload.totals) {
                    return payload;
                }

                return fetchCheckoutState(wire);
            })
            .catch(function () {
                return fetchCheckoutState(wire);
            })
            .then(function (payload) {
                checkoutStateLastPayload = payload;
                checkoutStateLastPayloadAt = Date.now();

                return payload;
            })
            .then(function (payload) {
                checkoutStateRefreshPromise = null;
                return payload;
            }, function (error) {
                checkoutStateRefreshPromise = null;
                throw error;
            });

        return checkoutStateRefreshPromise;
    }

    function parsePayload(data) {
        if (!data) {
            return {};
        }

        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch (e) {
                return {};
            }
        }

        return typeof data === 'object' ? data : {};
    }

    function getAddressValue(address, camelKey, snakeKey) {
        var value;

        if (!address) {
            return undefined;
        }

        value = address[camelKey];
        if (typeof value === 'undefined' && snakeKey) {
            value = address[snakeKey];
        }
        if (typeof value === 'function') {
            value = value();
        }

        return value;
    }

    function mergeObjectValues() {
        var result = {};

        Array.prototype.slice.call(arguments).forEach(function (value) {
            if (value && typeof value === 'object') {
                $.extend(true, result, value);
            }
        });

        return result;
    }

    function getAddressObjectValue(address, camelKey, snakeKey) {
        if (!address) {
            return {};
        }

        return mergeObjectValues(
            getAddressValue(address, snakeKey),
            getAddressValue(address, camelKey)
        );
    }

    function getPaymentObjectValue(paymentMethod, snakeKey, camelKey) {
        var value = {};

        if (!paymentMethod) {
            return value;
        }

        if (paymentMethod[snakeKey] && typeof paymentMethod[snakeKey] === 'object') {
            $.extend(true, value, paymentMethod[snakeKey]);
        }

        if (paymentMethod[camelKey] && typeof paymentMethod[camelKey] === 'object') {
            $.extend(true, value, paymentMethod[camelKey]);
        }

        return value;
    }

    function setWireValue(wire, key, value) {
        if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined') {
            return Promise.resolve();
        }

        return Promise.resolve(wire.set(key, value === null ? '' : value));
    }

    function getWireValue(wire, key) {
        if (!wire) {
            return '';
        }
        if (typeof wire.get === 'function') {
            return wire.get(key);
        }
        if (typeof wire[key] !== 'undefined') {
            return wire[key];
        }
        if (wire.data && typeof wire.data[key] !== 'undefined') {
            return wire.data[key];
        }

        return '';
    }

    function getStateUrl(wire) {
        var baseUrl = window.BASE_URL || '/',
            paymentMethod = getWireValue(wire, 'paymentMethod');

        if (baseUrl.charAt(baseUrl.length - 1) !== '/') {
            baseUrl += '/';
        }

        return baseUrl + 'fast-checkout/index/state' + (paymentMethod ? '?payment_method=' + encodeURIComponent(paymentMethod) : '');
    }

    function fetchCheckoutState(wire) {
        return $.ajax({
            url: getStateUrl(wire),
            type: 'GET',
            dataType: 'json',
            cache: false
        });
    }

    function ratesChanged(currentRates, nextRates) {
        var i,
            current,
            next;

        currentRates = Array.isArray(currentRates) ? currentRates : [];
        nextRates = Array.isArray(nextRates) ? nextRates : [];

        if (currentRates.length !== nextRates.length) {
            return true;
        }

        for (i = 0; i < currentRates.length; i++) {
            current = currentRates[i] || {};
            next = nextRates[i] || {};

            if (
                current.carrier_code !== next.carrier_code ||
                current.method_code !== next.method_code ||
                current.amount !== next.amount ||
                current.available !== next.available
            ) {
                return true;
            }
        }

        return false;
    }

    function applyCheckoutStateToKnockout(state) {
        return new Promise(function (resolve) {
            if (!state || typeof state !== 'object' || typeof require !== 'function') {
                resolve(state);
                return;
            }

            require([
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/model/payment-service',
                'Magento_Checkout/js/model/shipping-service'
            ], function (quote, paymentService, shippingService) {
                try {
                    if (state.totals && quote && typeof quote.setTotals === 'function') {
                        quote.setTotals(state.totals);
                        if (window.checkoutConfig) {
                            window.checkoutConfig.totalsData = state.totals;
                        }
                    }

                    if (
                        Array.isArray(state.payment_methods) &&
                        paymentService &&
                        typeof paymentService.setPaymentMethods === 'function'
                    ) {
                        paymentService.setPaymentMethods(state.payment_methods);
                    }

                    if (
                        Array.isArray(state.shipping_rates) &&
                        shippingService &&
                        typeof shippingService.setShippingRates === 'function' &&
                        ratesChanged(
                            typeof shippingService.getShippingRates === 'function'
                                ? shippingService.getShippingRates()()
                                : [],
                            state.shipping_rates
                        )
                    ) {
                        shippingService.setShippingRates(state.shipping_rates);
                    }
                } catch (e) {
                    // Do not break native Magento storage consumers if KO state hydration fails.
                }

                resolve(state);
            }, function () {
                resolve(state);
            });
        });
    }

    function syncAddressToWire(wire, address, isBilling) {
        var prefix = isBilling ? 'billing' : '',
            street = getAddressValue(address, 'street'),
            customAttributes = getAddressObjectValue(address, 'customAttributes', 'custom_attributes'),
            extensionAttributes = getAddressObjectValue(address, 'extensionAttributes', 'extension_attributes'),
            sequence = Promise.resolve();

        if (!address) {
            return sequence;
        }

        [
            ['firstname', prefix ? 'billingFirstname' : 'firstname'],
            ['lastname', prefix ? 'billingLastname' : 'lastname'],
            ['company', prefix ? 'billingCompany' : 'company'],
            ['city', prefix ? 'billingCity' : 'city'],
            ['postcode', prefix ? 'billingPostcode' : 'postcode'],
            ['countryId', prefix ? 'billingCountryId' : 'countryId', 'country_id'],
            ['regionId', prefix ? 'billingRegionId' : 'regionId', 'region_id'],
            ['region', prefix ? 'billingRegion' : 'region'],
            ['telephone', prefix ? 'billingTelephone' : 'telephone'],
            ['prefix', prefix ? 'billingPrefix' : 'prefix'],
            ['middlename', prefix ? 'billingMiddlename' : 'middlename'],
            ['suffix', prefix ? 'billingSuffix' : 'suffix'],
            ['fax', prefix ? 'billingFax' : 'fax'],
            ['vatId', prefix ? 'billingVatId' : 'vatId', 'vat_id']
        ].forEach(function (field) {
            sequence = sequence.then(function () {
                return setWireValue(wire, field[1], getAddressValue(address, field[0], field[2]));
            });
        });

        if (!Array.isArray(street)) {
            street = typeof street === 'string' && street.length ? [street] : [];
        }

        [0, 1, 2, 3].forEach(function (index) {
            sequence = sequence.then(function () {
                return setWireValue(wire, (prefix ? 'billingStreet' : 'street') + (index + 1), street[index] || '');
            });
        });

        sequence = sequence.then(function () {
            return setWireValue(
                wire,
                prefix ? 'billingCustomAttributes' : 'shippingCustomAttributes',
                customAttributes || {}
            );
        }).then(function () {
            return setWireValue(
                wire,
                prefix ? 'billingExtensionAttributes' : 'shippingExtensionAttributes',
                extensionAttributes || {}
            );
        });

        return sequence;
    }

    function syncPaymentToWire(wire, paymentMethod) {
        if (!paymentMethod || !paymentMethod.method) {
            return Promise.resolve();
        }

        return setWireValue(wire, 'paymentMethod', paymentMethod.method)
            .then(function () {
                return setWireValue(
                    wire,
                    'paymentAdditionalData',
                    getPaymentObjectValue(paymentMethod, 'additional_data', 'additionalData')
                );
            })
            .then(function () {
                return setWireValue(
                    wire,
                    'paymentExtensionAttributes',
                    getPaymentObjectValue(paymentMethod, 'extension_attributes', 'extensionAttributes')
                );
            })
            .then(function () {
                var poNumber = paymentMethod.po_number ||
                    (paymentMethod.additional_data && paymentMethod.additional_data.po_number) ||
                    (paymentMethod.additionalData && paymentMethod.additionalData.po_number);

                return poNumber ? setWireValue(wire, 'poNumber', poNumber) : true;
            })
            .then(function () {
                if (typeof wire.call === 'function') {
                    return wire.call('selectPaymentMethod', paymentMethod.method);
                }

                return true;
            });
    }

    function syncPayloadToWire(wire, endpoint, data, headers) {
        var payload = parsePayload(data),
            sequence = Promise.resolve(),
            addressInformation = payload.addressInformation || {};

        if (!wire) {
            return sequence;
        }

        if (payload.email) {
            sequence = sequence.then(function () {
                return setWireValue(wire, 'email', payload.email);
            });
        }

        if (endpoint === 'shippingInformation' && addressInformation) {
            sequence = sequence
                .then(function () {
                    return syncAddressToWire(wire, addressInformation.shipping_address, false);
                })
                .then(function () {
                    return syncAddressToWire(wire, addressInformation.billing_address, true);
                })
                .then(function () {
                    var shippingExtensionAttributes = mergeObjectValues(
                        addressInformation.extension_attributes,
                        addressInformation.extensionAttributes
                    );

                    if (Object.keys(shippingExtensionAttributes).length) {
                        return setWireValue(
                            wire,
                            'shippingExtensionAttributes',
                            shippingExtensionAttributes
                        );
                    }

                    return true;
                })
                .then(function () {
                    var carrier = addressInformation.shipping_carrier_code || '',
                        method = addressInformation.shipping_method_code || '',
                        code = carrier && method ? carrier + '_' + method : '';

                    return code && typeof wire.call === 'function'
                        ? wire.call('selectShippingMethod', code)
                        : true;
                });
        }

        if (endpoint === 'estimateShippingMethods') {
            sequence = sequence.then(function () {
                return syncAddressToWire(wire, payload.address || payload, false);
            }).then(function () {
                if (typeof wire.call === 'function') {
                    return wire.call('saveShippingAddress', true, true, true);
                }

                return true;
            });
        }

        if (endpoint === 'billingAddress') {
            sequence = sequence.then(function () {
                return syncAddressToWire(wire, payload.address, true);
            }).then(function () {
                if (typeof wire.call === 'function') {
                    return wire.call('saveBillingAddress', true);
                }

                return true;
            });
        }

        if (endpoint === 'setPaymentInformation') {
            sequence = sequence.then(function () {
                return syncPaymentToWire(wire, payload.paymentMethod);
            });
        }

        if (endpoint === 'placeOrder') {
            sequence = sequence.then(function () {
                return syncPaymentToWire(wire, payload.paymentMethod);
            });
        }

        if (headers || Object.keys(payload).length) {
            sequence = sequence
                .then(function () {
                    return setWireValue(wire, 'placeOrderRequestHeaders', headers || {});
                })
                .then(function () {
                    return setWireValue(wire, 'placeOrderRequestData', payload || {});
                });
        }

        return sequence;
    }

    function handleIntercept(url, data, type, headers) {
        var deferred = $.Deferred();
        var wire = getWire(),
            endpoint = getEndpoint(url);

        if (!wire) {
            deferred.reject(new Error('Magewire not available'));
            return deferred.promise();
        }

        syncPayloadToWire(wire, endpoint, data, headers).then(function () {
            return refreshCheckoutState(wire);
        }).then(function (state) {
            if (!state || typeof state !== 'object') {
                deferred.resolve({});
                return;
            }

            if (endpoint === 'placeOrder') {
                var paymentMethod = parsePayload(data).paymentMethod || {},
                    methodCode = paymentMethod.method || '';

                if (typeof wire.call !== 'function') {
                    deferred.reject(new Error('Magewire placeOrder is not available'));
                    return;
                }

                Promise.resolve(wire.call('placeOrder', methodCode)).then(function (result) {
                    deferred.resolve(result || true);
                }).catch(function (error) {
                    deferred.reject(error);
                });
                return;
            }

            if (endpoint === 'totals') {
                deferred.resolve(state.totals || {});
            } else if (endpoint === 'shippingInformation' || endpoint === 'paymentInformation' || endpoint === 'billingAddress') {
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

    function handleMagentoPassThrough(originalRequest, url, data, type, headers) {
        var deferred = $.Deferred(),
            wire = getWire(),
            endpoint = getEndpoint(url);

        if (!wire) {
            return originalRequest();
        }

        syncPayloadToWire(wire, endpoint, data, headers)
            .then(function () {
                return originalRequest();
            })
            .then(function (response) {
                return refreshCheckoutState(wire, true)
                    .then(applyCheckoutStateToKnockout)
                    .catch(function () {
                        return true;
                    })
                    .then(function () {
                        return response;
                    });
            })
            .then(function (response) {
                deferred.resolve(response);
            })
            .catch(function (error) {
                deferred.reject(error);
            });

        return deferred.promise();
    }

    return function (storage) {
        if (!storage) {
            return storage;
        }

        storage.get = wrapper.wrap(storage.get, function (originalGet, url, global, contentType, headers) {
            if (url && url.indexOf('rest/') === 0) {
                url = '/' + url;
            }
            if (shouldIntercept(url, 'GET') && getWire()) {
                return handleIntercept(url, null, 'GET', headers);
            }
            return originalGet(url, global, contentType, headers);
        });

        storage.post = wrapper.wrap(storage.post, function (originalPost, url, data, global, contentType, headers, async) {
            if (url && url.indexOf('rest/') === 0) {
                url = '/' + url;
            }

            if (url && url.indexOf('/guest-carts/') !== -1 && (url.indexOf('/payment-information') !== -1 || url.indexOf('/set-payment-information') !== -1 || url.indexOf('/order') !== -1)) {
                var payload = parsePayload(data);
                if (payload && typeof payload === 'object') {
                    var email = getEmailFromDomOrQuote();
                    if (email) {
                        if (!payload.email) {
                            payload.email = email;
                        }
                        if (payload.billingAddress && !payload.billingAddress.email) {
                            payload.billingAddress.email = email;
                        }
                        data = JSON.stringify(payload);
                    }
                }
            }

            if (shouldPassThroughMagento(url, 'POST')) {
                return handleMagentoPassThrough(function () {
                    return originalPost(url, data, global, contentType, headers, async);
                }, url, data, 'POST', headers);
            }
            if (shouldIntercept(url, 'POST') && getWire()) {
                return handleIntercept(url, data, 'POST', headers);
            }
            return originalPost(url, data, global, contentType, headers, async);
        });

        storage.put = wrapper.wrap(storage.put, function (originalPut, url, data, global, contentType, headers) {
            if (url && url.indexOf('rest/') === 0) {
                url = '/' + url;
            }
            if (shouldIntercept(url, 'PUT') && getWire()) {
                return handleIntercept(url, data, 'PUT', headers);
            }
            return originalPut(url, data, global, contentType, headers);
        });

        storage.delete = wrapper.wrap(storage.delete, function (originalDelete, url, global, contentType, headers) {
            if (url && url.indexOf('rest/') === 0) {
                url = '/' + url;
            }
            if (shouldIntercept(url, 'DELETE') && getWire()) {
                return handleIntercept(url, null, 'DELETE', headers);
            }
            return originalDelete(url, global, contentType, headers);
        });

        return storage;
    };
});
