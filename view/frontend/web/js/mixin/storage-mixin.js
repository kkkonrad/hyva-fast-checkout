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

    function hasObjectData(value) {
        return value && typeof value === 'object' && Object.keys(value).length > 0;
    }

    function isEmptyObjectLike(value) {
        return value && typeof value === 'object' && Object.keys(value).length === 0;
    }

    function hasMeaningfulAddressData(address) {
        var street,
            fields = ['firstname', 'lastname', 'city', 'postcode', 'region', 'telephone', 'company'];

        if (!address || typeof address !== 'object') {
            return false;
        }

        street = getAddressValue(address, 'street');
        if (Array.isArray(street) && street.some(function (line) {
            return String(line || '').trim() !== '';
        })) {
            return true;
        }
        if (typeof street === 'string' && street.trim() !== '') {
            return true;
        }

        if (fields.some(function (field) {
            return String(getAddressValue(address, field) || '').trim() !== '';
        })) {
            return true;
        }

        if (parseInt(getAddressValue(address, 'regionId', 'region_id') || 0, 10) > 0) {
            return true;
        }

        return hasObjectData(getAddressObjectValue(address, 'customAttributes', 'custom_attributes')) ||
            hasObjectData(getAddressObjectValue(address, 'extensionAttributes', 'extension_attributes'));
    }

    function hasMeaningfulRequestPayload(payload) {
        var addressInformation,
            address,
            shippingAddress,
            billingAddress,
            paymentMethod;

        payload = payload || {};
        addressInformation = mergeObjectValues(payload.address_information, payload.addressInformation);
        address = mergeObjectValues(payload.address);
        shippingAddress = mergeObjectValues(
            getPayloadShippingAddress(payload),
            addressInformation.shipping_address,
            addressInformation.shippingAddress
        );
        billingAddress = mergeObjectValues(
            getPayloadBillingAddress(payload),
            addressInformation.billing_address,
            addressInformation.billingAddress
        );
        paymentMethod = getPayloadPaymentMethod(payload);

        return hasMeaningfulAddressData(address) ||
            hasMeaningfulAddressData(shippingAddress) ||
            hasMeaningfulAddressData(billingAddress) ||
            Boolean(paymentMethod && paymentMethod.method) ||
            Boolean(getShippingMethodCode(payload)) ||
            Boolean(getShippingMethodCode(addressInformation)) ||
            Boolean(getPayloadEmail(payload));
    }

    function isGuestAddressSnapshotRestorePending() {
        return window.fastcheckoutGuestAddressSnapshotRestorePending === true;
    }

    function resolveEmptyIntercept(deferred, endpoint) {
        if (endpoint === 'estimateShippingMethods') {
            deferred.resolve([]);
            return;
        }

        deferred.resolve((checkoutStateLastPayload || {}).totals || {});
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

    function normalizePaymentMethodPayload(paymentMethod) {
        if (!paymentMethod) {
            return {};
        }

        if (typeof paymentMethod === 'string' || typeof paymentMethod === 'number') {
            return paymentMethod ? { method: String(paymentMethod) } : {};
        }

        return typeof paymentMethod === 'object' ? mergeObjectValues(paymentMethod) : {};
    }

    function getPayloadPaymentMethod(payload) {
        var paymentMethod;

        payload = payload || {};
        paymentMethod = mergeObjectValues(
            normalizePaymentMethodPayload(payload.payment_method),
            normalizePaymentMethodPayload(payload.paymentMethod),
            normalizePaymentMethodPayload(payload.payment)
        );

        if (Object.keys(paymentMethod).length) {
            return paymentMethod;
        }

        if (
            payload.method ||
            payload.additional_data ||
            payload.additionalData ||
            payload.extension_attributes ||
            payload.extensionAttributes ||
            payload.po_number ||
            payload.poNumber
        ) {
            return normalizePaymentMethodPayload(payload);
        }

        return {};
    }

    function getStateSelectedPaymentMethod(state) {
        if (!state || typeof state !== 'object') {
            return '';
        }

        if (state.selected_payment_method) {
            return String(state.selected_payment_method);
        }

        if (state.selectedPaymentMethod) {
            return String(state.selectedPaymentMethod);
        }

        if (state.paymentMethod && typeof state.paymentMethod === 'string') {
            return state.paymentMethod;
        }

        if (state.paymentMethod && typeof state.paymentMethod === 'object' && state.paymentMethod.method) {
            return String(state.paymentMethod.method);
        }

        return '';
    }

    function getStateSelectedShippingMethod(state) {
        if (!state || typeof state !== 'object') {
            return '';
        }

        if (state.selected_shipping_method) {
            return String(state.selected_shipping_method);
        }

        if (state.selectedShippingMethod) {
            return String(state.selectedShippingMethod);
        }

        if (state.selected_shipping_rate) {
            return String(state.selected_shipping_rate);
        }

        if (state.selectedShippingRate) {
            return String(state.selectedShippingRate);
        }

        if (state.shippingMethod && typeof state.shippingMethod === 'string') {
            return state.shippingMethod;
        }

        if (state.shippingMethod && typeof state.shippingMethod === 'object') {
            return getShippingMethodCode(state.shippingMethod);
        }

        return '';
    }

    function applySelectedShippingMethodToQuote(quote, shippingService, methodCode) {
        var rates,
            found = null,
            parts,
            carrier;

        if (!quote || typeof quote.shippingMethod !== 'function' || !methodCode) {
            return;
        }

        rates = shippingService && typeof shippingService.getShippingRates === 'function'
            ? shippingService.getShippingRates()()
            : [];

        if (Array.isArray(rates)) {
            rates.some(function (rate) {
                if (rate && (rate.carrier_code + '_' + rate.method_code) === methodCode) {
                    found = rate;
                    return true;
                }

                return false;
            });
        }

        if (found) {
            quote.shippingMethod(found);
            return;
        }

        parts = String(methodCode || '').split('_');
        carrier = parts.shift() || '';
        if (carrier) {
            quote.shippingMethod({
                carrier_code: carrier,
                method_code: parts.length ? parts.join('_') : carrier
            });
        }
    }

    function getPayloadBillingAddress(payload) {
        payload = payload || {};

        return mergeObjectValues(
            payload.billing_address,
            payload.billingAddress
        );
    }

    function getPayloadShippingAddress(payload) {
        payload = payload || {};

        return mergeObjectValues(
            payload.shipping_address,
            payload.shippingAddress
        );
    }

    function getPayloadEmail(payload) {
        var addressInformation,
            billingAddress,
            shippingAddress,
            candidates,
            i;

        payload = payload || {};
        addressInformation = mergeObjectValues(payload.address_information, payload.addressInformation);
        billingAddress = mergeObjectValues(
            getPayloadBillingAddress(payload),
            addressInformation.billing_address,
            addressInformation.billingAddress
        );
        shippingAddress = mergeObjectValues(
            getPayloadShippingAddress(payload),
            addressInformation.shipping_address,
            addressInformation.shippingAddress
        );

        candidates = [
            payload.email,
            payload.customer_email,
            payload.customerEmail,
            billingAddress.email,
            billingAddress.customer_email,
            billingAddress.customerEmail,
            shippingAddress.email,
            shippingAddress.customer_email,
            shippingAddress.customerEmail,
            addressInformation.email,
            addressInformation.customer_email,
            addressInformation.customerEmail
        ];

        for (i = 0; i < candidates.length; i++) {
            if (candidates[i]) {
                return String(candidates[i]).trim();
            }
        }

        return '';
    }

    function getShippingMethodCode(source) {
        var carrier,
            method,
            nested,
            i,
            nestedKeys = ['shipping_method', 'shippingMethod', 'shipping_method_data', 'shippingMethodData'];

        source = source && typeof source === 'object' ? source : {};
        carrier = source.shipping_carrier_code || source.shippingCarrierCode || source.carrier_code || source.carrierCode || '';
        method = source.shipping_method_code || source.shippingMethodCode || source.method_code || source.methodCode || '';

        if (carrier && method) {
            return carrier + '_' + method;
        }

        if (typeof source.shipping_method === 'string' && source.shipping_method) {
            return source.shipping_method;
        }

        if (typeof source.shippingMethod === 'string' && source.shippingMethod) {
            return source.shippingMethod;
        }

        if (typeof source.method === 'string' && source.method) {
            return source.method;
        }

        for (i = 0; i < nestedKeys.length; i++) {
            nested = source[nestedKeys[i]];
            if (nested && typeof nested === 'object') {
                method = getShippingMethodCode(nested);
                if (method) {
                    return method;
                }
            }
        }

        return '';
    }

    function mergeAddressPayloadAttributes(address, payload) {
        var mergedAddress = mergeObjectValues(address || {}),
            customAttributes = mergeObjectValues(
                getAddressObjectValue(address, 'customAttributes', 'custom_attributes'),
                payload && payload.custom_attributes,
                payload && payload.customAttributes
            ),
            extensionAttributes = mergeObjectValues(
                getAddressObjectValue(address, 'extensionAttributes', 'extension_attributes'),
                payload && payload.extension_attributes,
                payload && payload.extensionAttributes
            );

        if (Object.keys(customAttributes).length) {
            mergedAddress.custom_attributes = customAttributes;
            mergedAddress.customAttributes = customAttributes;
        }

        if (Object.keys(extensionAttributes).length) {
            mergedAddress.extension_attributes = extensionAttributes;
            mergedAddress.extensionAttributes = extensionAttributes;
        }

        return mergedAddress;
    }

    function setWireValue(wire, key, value) {
        var currentValue;

        if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined') {
            return Promise.resolve();
        }

        currentValue = getWireValue(wire, key);
        if (isEmptyObjectLike(currentValue) && isEmptyObjectLike(value)) {
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
                current.base_amount !== next.base_amount ||
                current.price_excl_tax !== next.price_excl_tax ||
                current.price_incl_tax !== next.price_incl_tax ||
                current.available !== next.available ||
                current.error_message !== next.error_message ||
                current.carrier_title !== next.carrier_title ||
                current.method_title !== next.method_title ||
                JSON.stringify(current.extension_attributes || {}) !== JSON.stringify(next.extension_attributes || {}) ||
                JSON.stringify(current.extensionAttributes || {}) !== JSON.stringify(next.extensionAttributes || {})
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

                    if (quote && typeof quote.paymentMethod === 'function' && getStateSelectedPaymentMethod(state)) {
                        quote.paymentMethod({ method: getStateSelectedPaymentMethod(state) });
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

                    applySelectedShippingMethodToQuote(
                        quote,
                        shippingService,
                        getStateSelectedShippingMethod(state)
                    );
                } catch (e) {
                    // Do not break native Magento storage consumers if KO state hydration fails.
                }

                resolve(state);
            }, function () {
                resolve(state);
            });
        });
    }

    function ensureShippingRatesAfterBillingAddress(endpoint, wire) {
        if (endpoint !== 'billingAddress' || typeof require !== 'function') {
            return Promise.resolve(true);
        }

        return new Promise(function (resolve) {
            require([
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/model/shipping-service'
            ], function (quote, shippingService) {
                var currentRates = shippingService && typeof shippingService.getShippingRates === 'function'
                        ? shippingService.getShippingRates()()
                        : [],
                    shippingAddress = quote && typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;

                if (Array.isArray(currentRates) && currentRates.length) {
                    resolve(true);
                    return;
                }

                if (!wire || typeof wire.call !== 'function') {
                    resolve(true);
                    return;
                }

                Promise.resolve(wire.call('saveShippingAddress', true, true, true))
                    .then(function () {
                        return refreshCheckoutState(wire, true);
                    })
                    .then(applyCheckoutStateToKnockout)
                    .then(function () {
                        currentRates = shippingService && typeof shippingService.getShippingRates === 'function'
                            ? shippingService.getShippingRates()()
                            : [];

                        if (Array.isArray(currentRates) && currentRates.length) {
                            return true;
                        }

                        if (
                            shippingAddress &&
                            window.fastcheckoutHyvaShipping &&
                            typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction === 'function'
                        ) {
                            return window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(shippingAddress);
                        }

                        return true;
                    })
                    .then(function (rates) {
                        if (Array.isArray(rates) && rates.length && shippingService && typeof shippingService.setShippingRates === 'function') {
                            shippingService.setShippingRates(rates);
                        }
                    })
                    .catch(function () {
                        return true;
                    })
                    .then(function () {
                        resolve(true);
                    });
            }, function () {
                resolve(true);
            });
        });
    }

    function syncAddressToWire(wire, address, isBilling) {
        var prefix = isBilling ? 'billing' : '',
            street = getAddressValue(address, 'street'),
            customAttributes = getAddressObjectValue(address, 'customAttributes', 'custom_attributes'),
            extensionAttributes = getAddressObjectValue(address, 'extensionAttributes', 'extension_attributes'),
            sequence = Promise.resolve();

        if (!hasMeaningfulAddressData(address)) {
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
        paymentMethod = normalizePaymentMethodPayload(paymentMethod);

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
                    paymentMethod.poNumber ||
                    (paymentMethod.additional_data && (paymentMethod.additional_data.po_number || paymentMethod.additional_data.poNumber)) ||
                    (paymentMethod.additionalData && (paymentMethod.additionalData.po_number || paymentMethod.additionalData.poNumber));

                return poNumber ? setWireValue(wire, 'poNumber', poNumber) : true;
            })
            .then(function () {
                if (typeof wire.call === 'function') {
                    return wire.call('selectPaymentMethod', paymentMethod.method);
                }

                return true;
            });
    }

    function syncBridgeFormDataToWire(wire, endpoint) {
        var sequence = Promise.resolve();

        if (!wire) {
            return sequence;
        }

        if (
            (endpoint === 'shippingInformation' || endpoint === 'estimateShippingMethods' || endpoint === 'placeOrder') &&
            window.fastcheckoutHyvaShipping &&
            typeof window.fastcheckoutHyvaShipping.syncDomAttributes === 'function'
        ) {
            sequence = sequence.then(function () {
                return window.fastcheckoutHyvaShipping.syncDomAttributes(wire);
            });
        }

        if (
            (endpoint === 'setPaymentInformation' || endpoint === 'placeOrder') &&
            window.fastcheckoutHyvaPayment &&
            typeof window.fastcheckoutHyvaPayment.syncActiveFormData === 'function'
        ) {
            sequence = sequence.then(function () {
                return window.fastcheckoutHyvaPayment.syncActiveFormData(wire);
            });
        }

        return sequence.catch(function (error) {
            if (window.console && typeof window.console.warn === 'function') {
                window.console.warn('Kkkonrad Fastcheckout: form data bridge sync failed.', error);
            }
            return true;
        });
    }

    function syncPayloadToWire(wire, endpoint, data, headers) {
        var payload = parsePayload(data),
            sequence = Promise.resolve(),
            addressInformation = mergeObjectValues(payload.address_information, payload.addressInformation);

        if (!wire) {
            return sequence;
        }

        if (getPayloadEmail(payload)) {
            sequence = sequence.then(function () {
                return setWireValue(wire, 'email', getPayloadEmail(payload));
            });
        }

        if (endpoint === 'shippingInformation' && Object.keys(addressInformation).length) {
            sequence = sequence
                .then(function () {
                    var shippingAddress = mergeObjectValues(
                        addressInformation.shipping_address,
                        addressInformation.shippingAddress
                    );

                    return syncAddressToWire(
                        wire,
                        mergeAddressPayloadAttributes(
                            shippingAddress,
                            addressInformation
                        ),
                        false
                    );
                })
                .then(function () {
                    var billingAddress = mergeObjectValues(
                        addressInformation.billing_address,
                        addressInformation.billingAddress
                    );

                    return syncAddressToWire(
                        wire,
                        Object.keys(billingAddress).length
                            ? mergeAddressPayloadAttributes(billingAddress, billingAddress)
                            : null,
                        true
                    );
                })
                .then(function () {
                    var shippingAddress = mergeObjectValues(
                        addressInformation.shipping_address,
                        addressInformation.shippingAddress
                    );
                    var shippingExtensionAttributes = mergeObjectValues(
                        getAddressObjectValue(
                            shippingAddress,
                            'extensionAttributes',
                            'extension_attributes'
                        ),
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
                    var code = getShippingMethodCode(addressInformation);

                    return code && typeof wire.call === 'function'
                        ? wire.call('selectShippingMethod', code)
                        : true;
                });
        }

        if (endpoint === 'estimateShippingMethods') {
            sequence = sequence.then(function () {
                var estimateAddress = mergeObjectValues(payload.address, payload.shipping_address, payload.shippingAddress);

                if (!hasMeaningfulAddressData(estimateAddress) && !hasMeaningfulAddressData(payload)) {
                    return false;
                }

                return syncAddressToWire(
                    wire,
                    mergeAddressPayloadAttributes(
                        Object.keys(estimateAddress).length ? estimateAddress : payload,
                        payload
                    ),
                    false
                );
            }).then(function (addressSynced) {
                if (addressSynced !== false && typeof wire.call === 'function') {
                    return wire.call('saveShippingAddress', true, true, true);
                }

                return true;
            });
        }

        if (endpoint === 'billingAddress') {
            sequence = sequence.then(function () {
                return syncAddressToWire(
                    wire,
                    mergeAddressPayloadAttributes(payload.address || payload, payload),
                    true
                );
            }).then(function () {
                if (typeof wire.call === 'function') {
                    return wire.call('saveBillingAddress', true);
                }

                return true;
            });
        }

        if (endpoint === 'setPaymentInformation') {
            sequence = sequence
                .then(function () {
                    var billingAddress = getPayloadBillingAddress(payload);

                    if (!Object.keys(billingAddress).length) {
                        return false;
                    }

                    return syncAddressToWire(
                        wire,
                        mergeAddressPayloadAttributes(billingAddress, billingAddress),
                        true
                    ).then(function () {
                        return true;
                    });
                })
                .then(function (billingAddressSynced) {
                    if (billingAddressSynced && typeof wire.call === 'function') {
                        return wire.call('saveBillingAddress', true);
                    }

                    return true;
                })
                .then(function () {
                    return syncPaymentToWire(wire, getPayloadPaymentMethod(payload));
                });
        }

        if (endpoint === 'placeOrder') {
            sequence = sequence
                .then(function () {
                    var shippingAddress = getPayloadShippingAddress(payload);

                    return Object.keys(shippingAddress).length
                        ? syncAddressToWire(
                            wire,
                            mergeAddressPayloadAttributes(shippingAddress, shippingAddress),
                            false
                        )
                        : true;
                })
                .then(function () {
                    var billingAddress = getPayloadBillingAddress(payload);

                    return Object.keys(billingAddress).length
                        ? syncAddressToWire(
                            wire,
                            mergeAddressPayloadAttributes(billingAddress, billingAddress),
                            true
                        )
                        : true;
                })
                .then(function () {
                    return syncPaymentToWire(wire, getPayloadPaymentMethod(payload));
                });
        }

        sequence = sequence.then(function () {
            return syncBridgeFormDataToWire(wire, endpoint);
        });

        if ((headers && hasObjectData(headers)) || hasMeaningfulRequestPayload(payload)) {
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
            endpoint = getEndpoint(url),
            payload = parsePayload(data);

        if (!wire) {
            deferred.reject(new Error('Magewire not available'));
            return deferred.promise();
        }

        if (
            !hasMeaningfulRequestPayload(payload) &&
            (
                endpoint === 'estimateShippingMethods' ||
                (endpoint === 'totals' && isGuestAddressSnapshotRestorePending())
            )
        ) {
            resolveEmptyIntercept(deferred, endpoint);
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
                var paymentMethod = getPayloadPaymentMethod(parsePayload(data)),
                    methodCode = paymentMethod.method || '';

                if (typeof wire.call !== 'function') {
                    deferred.reject(new Error('Magewire placeOrder is not available'));
                    return;
                }

                Promise.resolve(wire.call('placeOrder', methodCode)).then(function (result) {
                    if (result && typeof result === 'object' && result.success === false) {
                        deferred.reject(new Error(result.message || result.error || 'The order was not placed.'));
                        return;
                    }

                    window.fastcheckoutLastPlaceOrderResult = result || {};
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
                    .then(function () {
                        return ensureShippingRatesAfterBillingAddress(endpoint, wire);
                    })
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
