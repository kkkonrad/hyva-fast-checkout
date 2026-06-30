define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        
        var scope = config.scope || 'fastcheckoutHyvaPaymentRenderers',
            rendererComponents = config.rendererComponents || [];

        window.checkoutConfig = config.checkoutConfig || {};

        var initPaymentProxy = function(paymentObj) {
            paymentObj = paymentObj || {};
            if (paymentObj.__isProxy) {
                return paymentObj;
            }
            return new Proxy(paymentObj, {
                get: function(target, prop) {
                    if (prop === '__isProxy') {
                        return true;
                    }
                    if (prop === '__raw__') {
                        return target;
                    }
                    if (typeof prop === 'string' && !(prop in target)) {
                        target[prop] = {};
                    }
                    return target[prop];
                }
            });
        };
        window.checkoutConfig.payment = initPaymentProxy(window.checkoutConfig.payment);
        window.isCustomerLoggedIn = window.checkoutConfig.isCustomerLoggedIn;
        window.customerData = window.checkoutConfig.customerData;

        require([
            'Magento_Ui/js/core/app',
            'Magento_Checkout/js/model/payment-service',
            'Magento_Checkout/js/model/payment/method-converter',
            'Magento_Checkout/js/model/payment/method-list',
            'Magento_Checkout/js/model/quote',
            'Magento_Checkout/js/action/select-payment-method',
            'uiRegistry',
            'Magento_Checkout/js/model/shipping-service',
            'Magento_Checkout/js/model/shipping-rate-service',
            'Magento_Checkout/js/checkout-data',
            'Magento_Checkout/js/action/select-shipping-address',
            'Magento_Checkout/js/action/select-shipping-method',
            'Magento_Checkout/js/action/select-billing-address',
            'Magento_Checkout/js/model/address-converter',
            'Magento_Checkout/js/action/set-shipping-information',
            'Magento_Checkout/js/model/payment/additional-validators',
            'Magento_Ui/js/model/messages',
            'Magento_Checkout/js/model/error-processor',
            'Magento_Checkout/js/model/full-screen-loader',
            'mage/translate'
        ], function (
            app,
            paymentService,
            methodConverter,
            methodList,
            quote,
            selectPaymentMethodAction,
            registry,
            shippingService,
            shippingRateService,
            checkoutData,
            selectShippingAddressAction,
            selectShippingMethodAction,
            selectBillingAddressAction,
            addressConverter,
            setShippingInformationAction,
            additionalValidators,
            Messages,
            errorProcessor,
            fullScreenLoader,
            $t
        ) {
            if (quote && quote.billingAddress) {
                var currentBilling = quote.billingAddress();
                if (currentBilling && typeof currentBilling.getCacheKey !== 'function') {
                    currentBilling.getCacheKey = function () {
                        return 'billing-address-placeholder';
                    };
                }
                var originalBillingAddress = quote.billingAddress;
                quote.billingAddress = function (value) {
                    if (arguments.length > 0) {
                        if (value && typeof value.getCacheKey !== 'function') {
                            value.getCacheKey = function () {
                                return 'billing-address-placeholder';
                            };
                        }
                    }
                    return originalBillingAddress.apply(this, arguments);
                };
                Object.keys(originalBillingAddress).forEach(function (key) {
                    quote.billingAddress[key] = originalBillingAddress[key];
                });
                quote.billingAddress.subscribe = originalBillingAddress.subscribe.bind(originalBillingAddress);
            }

            if (quote && quote.shippingAddress) {
                var currentShipping = quote.shippingAddress();
                if (currentShipping && typeof currentShipping.getCacheKey !== 'function') {
                    currentShipping.getCacheKey = function () {
                        return 'shipping-address-placeholder';
                    };
                }
                var originalShippingAddress = quote.shippingAddress;
                quote.shippingAddress = function (value) {
                    if (arguments.length > 0) {
                        if (value && typeof value.getCacheKey !== 'function') {
                            value.getCacheKey = function () {
                                return 'shipping-address-placeholder';
                            };
                        }
                    }
                    return originalShippingAddress.apply(this, arguments);
                };
                Object.keys(originalShippingAddress).forEach(function (key) {
                    quote.shippingAddress[key] = originalShippingAddress[key];
                });
                quote.shippingAddress.subscribe = originalShippingAddress.subscribe.bind(originalShippingAddress);
            }

            if (checkoutData) {
                var cacheKey = 'checkout-data';
                var getLocalData = function () {
                    try {
                        var raw = window.localStorage ? window.localStorage.getItem(cacheKey) : null;
                        return raw ? JSON.parse(raw) : {};
                    } catch (e) { return {}; }
                };
                var saveLocalData = function (data) {
                    try { if (window.localStorage) window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
                };

                if (typeof checkoutData.setShippingInPostPoint !== 'function') {
                    checkoutData.setShippingInPostPoint = function (data) {
                        var obj = getLocalData();
                        obj.shippingInPostPointData = data;
                        saveLocalData(obj);
                    };
                }
                if (typeof checkoutData.getShippingInPostPoint !== 'function') {
                    checkoutData.getShippingInPostPoint = function () {
                        return getLocalData().shippingInPostPointData || null;
                    };
                }
                if (typeof checkoutData.setShippingInPostMode !== 'function') {
                    checkoutData.setShippingInPostMode = function (data) {
                        var obj = getLocalData();
                        obj.shippingInPostModeData = data;
                        saveLocalData(obj);
                    };
                }
                if (typeof checkoutData.getShippingInPostMode !== 'function') {
                    checkoutData.getShippingInPostMode = function () {
                        return getLocalData().shippingInPostModeData || null;
                    };
                }
            }

            function loadRendererComponents(done) {
                var remaining = rendererComponents.length;

                if (!remaining) {
                    done();
                    return;
                }

                rendererComponents.forEach(function (component) {
                    require([component], function () {
                        remaining -= 1;
                        if (remaining === 0) {
                            done();
                        }
                    }, function (error) {
                        remaining -= 1;
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: payment renderer could not be loaded', component, error);
                        }
                        if (remaining === 0) {
                            done();
                        }
                    });
                });
            }

            loadRendererComponents(function () {
                // Initialize customerData dynamically if available
                require(['Magento_Customer/js/customer-data'], function (customerData) {
                    if (customerData) {
                        var cdInitFunc = typeof customerData === 'function' ? customerData : customerData['Magento_Customer/js/customer-data'];
                        if (typeof cdInitFunc === 'function') {
                            var customerDataConfig = $.extend({
                                cookieLifeTime: '3600',
                                expirableSectionNames: ['cart'],
                                expirableSectionLifetime: 60,
                                cookieDomain: '',
                                isLoggedIn: window.isCustomerLoggedIn,
                                sectionLoadUrl: (window.BASE_URL || '/') + 'customer/section/load/'
                            }, window.checkoutConfig.customerData || {});
                            try {
                                cdInitFunc(customerDataConfig);
                                
                            } catch (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Kkkonrad Fastcheckout: customerData initialization error:', e);
                                }
                            }
                        }
                    }
                });

                var lastMethodsJson = '';
                var lastMagewireShippingMethodCode = '';
                var magewireShippingMethodSyncTimer = null;
                var checkoutDataFallbackWarningShown = false;
                var optionalValidationComponentsRequested = false;
                var optionalPaymentDataAssigners = [];
                var bridgeMessageContainer = new Messages();

                function getMessageText(message) {
                    if (!message) {
                        return '';
                    }

                    if (typeof message === 'string') {
                        return message;
                    }

                    if (message.message) {
                        return message.message;
                    }

                    return String(message);
                }

                function dispatchPaymentMessage(type, message) {
                    var text = getMessageText(message);

                    if (!text) {
                        return;
                    }

                    document.dispatchEvent(new CustomEvent('fastcheckout:payment-message', {
                        detail: {
                            type: type,
                            message: text
                        }
                    }));

                    if (type === 'error') {
                        document.dispatchEvent(new CustomEvent('fastcheckout:payment-error', {
                            detail: {
                                message: text
                            }
                        }));
                    }
                }

                function subscribePaymentMessageContainer(messageContainer) {
                    if (!messageContainer || messageContainer.fastcheckoutHyvaSubscribed) {
                        return messageContainer;
                    }

                    messageContainer.fastcheckoutHyvaSubscribed = true;

                    if (
                        typeof messageContainer.errorMessages === 'function' &&
                        typeof messageContainer.errorMessages.subscribe === 'function'
                    ) {
                        messageContainer.errorMessages.subscribe(function (messages) {
                            if (messages && messages.length) {
                                dispatchPaymentMessage('error', messages[messages.length - 1]);
                            }
                        });
                    }

                    if (
                        typeof messageContainer.successMessages === 'function' &&
                        typeof messageContainer.successMessages.subscribe === 'function'
                    ) {
                        messageContainer.successMessages.subscribe(function (messages) {
                            if (messages && messages.length) {
                                dispatchPaymentMessage('success', messages[messages.length - 1]);
                            }
                        });
                    }

                    return messageContainer;
                }

                function getBridgeMessageContainer() {
                    return subscribePaymentMessageContainer(bridgeMessageContainer);
                }

                function clearPaymentMessages() {
                    if (bridgeMessageContainer && typeof bridgeMessageContainer.clear === 'function') {
                        bridgeMessageContainer.clear();
                    }
                }

                function messageContainerHasMessages(messageContainer) {
                    return !!(
                        messageContainer &&
                        typeof messageContainer.hasMessages === 'function' &&
                        messageContainer.hasMessages()
                    );
                }

                function handlePaymentError(error, messageContainer) {
                    var container = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer(),
                        message = error && error.message ? error.message : $t('We could not place your order. Please try again.');

                    if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                        fullScreenLoader.stopLoader(true);
                    }

                    if (error && (error.responseText || error.status)) {
                        try {
                            errorProcessor.process(error, container);
                            return;
                        } catch (e) {}
                    }

                    if (messageContainerHasMessages(container)) {
                        return;
                    }

                    if (container && typeof container.addErrorMessage === 'function') {
                        container.addErrorMessage({ message: message });
                    } else {
                        dispatchPaymentMessage('error', message);
                    }
                }

                function registerAdditionalValidatorOnce(validator) {
                    if (!additionalValidators || !validator || typeof validator.validate !== 'function') {
                        return;
                    }

                    if (
                        typeof additionalValidators.getValidators === 'function' &&
                        additionalValidators.getValidators().indexOf(validator) !== -1
                    ) {
                        return;
                    }

                    if (typeof additionalValidators.registerValidator === 'function') {
                        additionalValidators.registerValidator(validator);
                    }
                }

                function registerPaymentDataAssignerOnce(assigner) {
                    if (typeof assigner !== 'function' || optionalPaymentDataAssigners.indexOf(assigner) !== -1) {
                        return;
                    }

                    optionalPaymentDataAssigners.push(assigner);
                }

                function loadOptionalValidationComponents() {
                    if (optionalValidationComponentsRequested) {
                        return;
                    }

                    optionalValidationComponentsRequested = true;

                    if (
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return;
                    }

                    require([
                        'Magento_CheckoutAgreements/js/model/agreement-validator',
                        'Magento_CheckoutAgreements/js/model/agreements-assigner'
                    ], function (agreementValidator, agreementsAssigner) {
                        registerAdditionalValidatorOnce(agreementValidator);
                        registerPaymentDataAssignerOnce(agreementsAssigner);
                    }, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: optional checkout agreements validators could not be loaded.', error);
                        }
                    });
                }

                function getDomPaymentMethods() {
                    var methods = [];

                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        var label = input.closest('label');
                        var titleElement = label ? label.querySelector('span') : null;

                        methods.push({
                            method: input.value,
                            title: titleElement ? titleElement.textContent.trim() : '',
                            checked: !!input.checked,
                            disabled: !!input.disabled
                        });
                    });

                    return methods;
                }

                function domHasPaymentMethod(methodCode) {
                    var found = false;

                    if (!methodCode) {
                        return false;
                    }

                    getDomPaymentMethods().forEach(function (method) {
                        if (method.method === methodCode && !method.disabled) {
                            found = true;
                        }
                    });

                    return found;
                }

                function getCheckedDomPaymentMethod() {
                    var selected = document.querySelector('input[name="payment_method"]:checked:not(:disabled)');

                    return selected ? selected.value : '';
                }

                function hidePaymentPlaceholders() {
                    document.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (placeholder) {
                        placeholder.classList.add('hidden');
                        placeholder.style.display = 'none';
                    });
                }

                function syncQuoteCustomerData() {
                    if (!quote) return;
                    var emailEl = document.querySelector('input[name="email"]') || 
                                  document.querySelector('input[type="email"]') ||
                                  document.querySelector('[data-wire-field="email"]');
                    var emailVal = emailEl ? emailEl.value : '';
                    if (!emailVal && window.checkoutConfig && window.checkoutConfig.customerData) {
                        emailVal = window.checkoutConfig.customerData.email || '';
                    }
                    if (!emailVal && window.checkoutConfig && window.checkoutConfig.quoteData) {
                        emailVal = window.checkoutConfig.quoteData.customer_email || '';
                    }
                    if (emailVal) {
                        if (typeof quote.guestEmail === 'function') {
                            quote.guestEmail(emailVal);
                        }
                        persistEmailToCheckoutData(emailVal);
                        var billing = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;
                        if (billing && typeof billing.getCacheKey === 'function') {
                            billing.email = emailVal;
                        }
                    }
                }

                document.addEventListener('input', function (e) {
                    if (e.target && (e.target.name === 'email' || e.target.type === 'email' || e.target.getAttribute('data-wire-field') === 'email')) {
                        syncQuoteCustomerData();
                    }
                });

                function syncKoPaymentRenderers() {
                    syncQuoteCustomerData();
                    if (window.fastcheckoutHyvaPaymentList && typeof window.fastcheckoutHyvaPaymentList.syncRenderers === 'function') {
                        window.fastcheckoutHyvaPaymentList.syncRenderers();
                    }
                }

                function syncPaymentMethods() {
                    syncQuoteCustomerData();
                    var domMethods = getDomPaymentMethods();
                    var methods = domMethods.map(function (method) {
                        return {
                            method: method.method,
                            title: method.title
                        };
                    });
                    var currentMethodsJson = JSON.stringify(methods);
                    var quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';

                    if (quoteMethod && !domHasPaymentMethod(quoteMethod)) {
                        
                        selectPaymentMethodAction(null);
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                    }

                    if (currentMethodsJson === lastMethodsJson) {
                        syncKoPaymentRenderers();
                        return domMethods;
                    }
                    lastMethodsJson = currentMethodsJson;

                    

                    if (methods.length > 0) {
                        paymentService.setPaymentMethods(methods);
                    } else {
                        var fallbackMethods = methodConverter(config.paymentMethods || window.checkoutConfig.paymentMethods || []);
                        paymentService.setPaymentMethods(fallbackMethods);
                    }

                    window.setTimeout(syncKoPaymentRenderers, 0);

                    return domMethods;
                }

                syncPaymentMethods();

                app({
                    components: {
                        [scope]: {
                            component: 'uiComponent',
                            children: {
                                paymentList: {
                                    component: 'Kkkonrad_Fastcheckout/js/hyva/payment-list',
                                    displayArea: 'payment-methods-list'
                                }
                            }
                        },
                        'fastcheckoutHyvaShippingRenderers': {
                            component: 'uiComponent',
                            children: {
                                shippingList: {
                                    component: 'Kkkonrad_Fastcheckout/js/hyva/shipping-list',
                                    displayArea: 'shipping-methods-list'
                                }
                            }
                        }
                    }
                });

                function getProperty(wire, name) {
                    if (!wire) return '';
                    if (typeof wire[name] !== 'undefined') {
                        return wire[name];
                    }
                    if (typeof wire.get === 'function') {
                        return wire.get(name);
                    }
                    if (wire.data && typeof wire.data[name] !== 'undefined') {
                        return wire.data[name];
                    }
                    return '';
                }

                function getEmailForQuote() {
                    var emailEl = document.querySelector('input[name="email"]') ||
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

                function getStreetLines(magewire, prefix) {
                    var street = [],
                        isBilling = prefix === 'billing',
                        line1 = getProperty(magewire, isBilling ? 'billingStreet1' : 'street1'),
                        line2 = getProperty(magewire, isBilling ? 'billingStreet2' : 'street2'),
                        line3 = getProperty(magewire, isBilling ? 'billingStreet3' : 'street3'),
                        line4 = getProperty(magewire, isBilling ? 'billingStreet4' : 'street4');

                    [line1, line2, line3, line4].forEach(function (line) {
                        if (line) {
                            street.push(line);
                        }
                    });

                    return street;
                }

                function buildAddressData(magewire, prefix) {
                    var isBilling = prefix === 'billing',
                        countryId = getProperty(magewire, isBilling ? 'billingCountryId' : 'countryId'),
                        regionId = getProperty(magewire, isBilling ? 'billingRegionId' : 'regionId'),
                        region = getProperty(magewire, isBilling ? 'billingRegion' : 'region');

                    return {
                        email: getEmailForQuote(),
                        firstname: getProperty(magewire, isBilling ? 'billingFirstname' : 'firstname'),
                        lastname: getProperty(magewire, isBilling ? 'billingLastname' : 'lastname'),
                        company: getProperty(magewire, isBilling ? 'billingCompany' : 'company'),
                        street: getStreetLines(magewire, prefix),
                        city: getProperty(magewire, isBilling ? 'billingCity' : 'city'),
                        postcode: getProperty(magewire, isBilling ? 'billingPostcode' : 'postcode'),
                        countryId: countryId,
                        country_id: countryId,
                        regionId: regionId && parseInt(regionId, 10) > 0 ? parseInt(regionId, 10) : null,
                        region_id: regionId && parseInt(regionId, 10) > 0 ? parseInt(regionId, 10) : null,
                        region: region,
                        telephone: getProperty(magewire, isBilling ? 'billingTelephone' : 'telephone'),
                        prefix: getProperty(magewire, isBilling ? 'billingPrefix' : 'prefix'),
                        middlename: getProperty(magewire, isBilling ? 'billingMiddlename' : 'middlename'),
                        suffix: getProperty(magewire, isBilling ? 'billingSuffix' : 'suffix'),
                        fax: getProperty(magewire, isBilling ? 'billingFax' : 'fax'),
                        vat_id: getProperty(magewire, isBilling ? 'billingVatId' : 'vatId'),
                        save_in_address_book: 0
                    };
                }

                function getCheckoutDataFallbackStoreCode() {
                    return (window.checkoutConfig && window.checkoutConfig.storeCode) || 'default';
                }

                function readCheckoutDataFallback() {
                    var cache;

                    try {
                        cache = window.localStorage ? JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}') : {};
                    } catch (e) {
                        cache = {};
                    }

                    return {
                        cache: cache,
                        data: cache['checkout-data'] || {}
                    };
                }

                function writeCheckoutDataFallback(data) {
                    var fallback = readCheckoutDataFallback();

                    fallback.cache['checkout-data'] = data;

                    try {
                        if (window.localStorage) {
                            window.localStorage.setItem('mage-cache-storage', JSON.stringify(fallback.cache));
                        }
                    } catch (e) {}
                }

                function updateCheckoutDataFallback(update) {
                    var fallback = readCheckoutDataFallback();

                    update(fallback.data);
                    writeCheckoutDataFallback(fallback.data);
                }

                function setAddressByStoreFallback(currentValue, addressData) {
                    var byStore = currentValue || {};

                    byStore[getCheckoutDataFallbackStoreCode()] = addressData;
                    return byStore;
                }

                function safeCheckoutDataSet(methodName, value, fallback) {
                    if (checkoutData && typeof checkoutData[methodName] === 'function') {
                        try {
                            checkoutData[methodName](value);
                            return;
                        } catch (e) {
                            if (!checkoutDataFallbackWarningShown && window.console && typeof window.console.warn === 'function') {
                                checkoutDataFallbackWarningShown = true;
                                window.console.warn(
                                    'Kkkonrad Fastcheckout: checkout-data storage is not ready, using local fallback.',
                                    e
                                );
                            }
                        }
                    }

                    if (typeof fallback === 'function') {
                        fallback(value);
                    }
                }

                function persistEmailToCheckoutData(email) {
                    if (!email) {
                        return;
                    }

                    safeCheckoutDataSet('setValidatedEmailValue', email, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.validatedEmailValue = value;
                        });
                    });
                    safeCheckoutDataSet('setInputFieldEmailValue', email, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.inputFieldEmailValue = value;
                        });
                    });
                }

                function persistAddressToCheckoutData(addressData, type) {
                    if (!addressData) {
                        return;
                    }

                    if (type === 'billing') {
                        safeCheckoutDataSet('setBillingAddressFromData', addressData, function (value) {
                            updateCheckoutDataFallback(function (data) {
                                data.billingAddressFromData = value;
                            });
                        });
                        safeCheckoutDataSet('setNewCustomerBillingAddress', addressData, function (value) {
                            updateCheckoutDataFallback(function (data) {
                                data.newCustomerBillingAddress = value;
                            });
                        });
                        return;
                    }

                    safeCheckoutDataSet('setShippingAddressFromData', addressData, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.shippingAddressFromData = setAddressByStoreFallback(data.shippingAddressFromData, value);
                        });
                    });
                    safeCheckoutDataSet('setNewCustomerShippingAddress', addressData, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.newCustomerShippingAddress = setAddressByStoreFallback(data.newCustomerShippingAddress, value);
                        });
                    });
                }

                function persistShippingMethodToCheckoutData(methodCode) {
                    safeCheckoutDataSet('setSelectedShippingRate', methodCode || null, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.selectedShippingRate = value;
                        });
                    });
                }

                function persistPaymentMethodToCheckoutData(methodCode) {
                    safeCheckoutDataSet('setSelectedPaymentMethod', methodCode || null, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.selectedPaymentMethod = value;
                        });
                    });
                }

                function addressesMatch(currentAddress, newAddress) {
                    return currentAddress &&
                        currentAddress.countryId === newAddress.countryId &&
                        currentAddress.postcode === newAddress.postcode &&
                        currentAddress.city === newAddress.city &&
                        JSON.stringify(currentAddress.street || []) === JSON.stringify(newAddress.street || []) &&
                        currentAddress.regionId == newAddress.regionId &&
                        currentAddress.region === newAddress.region &&
                        currentAddress.firstname === newAddress.firstname &&
                        currentAddress.lastname === newAddress.lastname &&
                        currentAddress.telephone === newAddress.telephone;
                }

                function syncAddressToKnockout(magewire) {
                    if (!magewire) return null;

                    var addressData = buildAddressData(magewire, ''),
                        newAddress = addressConverter.formAddressDataToQuoteAddress(addressData),
                        currentAddress = quote.shippingAddress();

                    persistAddressToCheckoutData(addressData, 'shipping');

                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectShippingAddressAction(newAddress);
                    }

                    return quote.shippingAddress() || newAddress;
                }

                function syncBillingAddressToKnockout(magewire, shippingAddress) {
                    var billingSameAsShipping = getProperty(magewire, 'billingSameAsShipping'),
                        newAddress,
                        currentAddress;

                    if (!magewire) return null;

                    if (billingSameAsShipping === true || billingSameAsShipping === '1' || billingSameAsShipping === 1) {
                        persistAddressToCheckoutData(buildAddressData(magewire, ''), 'billing');
                        if (shippingAddress) {
                            selectBillingAddressAction(shippingAddress);
                        }
                        return quote.billingAddress();
                    }

                    var addressData = buildAddressData(magewire, 'billing');
                    persistAddressToCheckoutData(addressData, 'billing');

                    newAddress = addressConverter.formAddressDataToQuoteAddress(addressData);
                    currentAddress = quote.billingAddress();
                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectBillingAddressAction(newAddress);
                    }

                    return quote.billingAddress() || newAddress;
                }

                function syncSelectedShippingMethodToKnockout(methodCode) {
                    persistShippingMethodToCheckoutData(methodCode);

                    if (!methodCode) {
                        quote.shippingMethod(null);
                        return;
                    }

                    var rates = shippingService.getShippingRates()(),
                        found = null;

                    rates.some(function (rate) {
                        if ((rate.carrier_code + '_' + rate.method_code) === methodCode) {
                            found = rate;
                            return true;
                        }
                        return false;
                    });

                    if (found) {
                        var active = quote.shippingMethod();
                        if (!active || active.carrier_code !== found.carrier_code || active.method_code !== found.method_code) {
                            selectShippingMethodAction(found);
                        }
                    }
                }

                function syncShippingMethodToMagewire(methodCode) {
                    persistShippingMethodToCheckoutData(methodCode);

                    if (!methodCode || methodCode === lastMagewireShippingMethodCode) {
                        return;
                    }

                    lastMagewireShippingMethodCode = methodCode;

                    if (magewireShippingMethodSyncTimer) {
                        window.clearTimeout(magewireShippingMethodSyncTimer);
                    }

                    magewireShippingMethodSyncTimer = window.setTimeout(function () {
                        var magewireEl = document.querySelector('[wire\\:id]'),
                            wire,
                            currentMethod;

                        magewireShippingMethodSyncTimer = null;

                        if (!magewireEl || !magewireEl.__livewire) {
                            return;
                        }

                        wire = magewireEl.__livewire;
                        currentMethod = getProperty(wire, 'shippingMethod');
                        if (currentMethod !== methodCode && typeof wire.call === 'function') {
                            wire.call('selectShippingMethod', methodCode);
                        }
                    }, 0);
                }

                function prepareCheckoutState(magewire) {
                    syncQuoteCustomerData();

                    var shippingAddress = syncAddressToKnockout(magewire);
                    syncBillingAddressToKnockout(magewire, shippingAddress);

                    if (magewire) {
                        syncSelectedShippingMethodToKnockout(getProperty(magewire, 'shippingMethod'));
                    }

                    if (quote.isVirtual && quote.isVirtual()) {
                        return Promise.resolve(true);
                    }

                    if (!quote.shippingAddress() || !quote.shippingMethod()) {
                        return Promise.resolve(true);
                    }

                    try {
                        return Promise.resolve(setShippingInformationAction()).then(function () {
                            syncPaymentMethods();
                            return true;
                        });
                    } catch (e) {
                        return Promise.reject(e);
                    }
                }

                function getShippingListComponent() {
                    return window.fastcheckoutHyvaShippingListInstance || (typeof registry !== 'undefined' && registry.get('fastcheckoutHyvaShippingRenderers.shippingList')) || null;
                }

                function clearShippingFieldError() {
                    var component = getShippingListComponent();
                    if (component && typeof component.clearError === 'function') {
                        component.clearError();
                    }
                }

                function showShippingFieldError(methodCode, carrierCode, errorMessage) {
                    var component = getShippingListComponent();
                    if (component && typeof component.setError === 'function') {
                        component.setError(carrierCode + '_' + methodCode, errorMessage);
                    }
                    var el = document.getElementById('label_method_' + methodCode + '_' + carrierCode) ||
                             document.getElementById('fastcheckout-ko-shipping-root') ||
                             document.querySelector('[name="shipping_method"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                window.fastcheckoutHyvaShipping = {
                    syncAddress: syncAddressToKnockout,
                    syncShippingMethod: syncSelectedShippingMethodToKnockout,
                    syncShippingMethodToMagewire: syncShippingMethodToMagewire,
                    setError: function (methodCode, message) {
                        showShippingFieldError(methodCode, '', message);
                    },
                    clearError: clearShippingFieldError,
                    validate: function () {
                        try {
                            clearShippingFieldError();
                            var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked');
                            var activeMethod = quote.shippingMethod();

                            var carrierCode = '';
                            var methodCode = '';

                            if (checkedDomRadio && checkedDomRadio.value) {
                                var parts = checkedDomRadio.value.split('_');
                                carrierCode = parts[0] || '';
                                methodCode = parts[1] || parts[0] || '';
                            } else if (activeMethod) {
                                carrierCode = activeMethod.carrier_code || '';
                                methodCode = activeMethod.method_code || '';
                            }

                            if (!carrierCode) {
                                return true;
                            }

                            // InPost locker point selection validation
                            var fullMethodCode = (methodCode + '_' + carrierCode).toLowerCase();
                            var isInPostLocker = fullMethodCode.indexOf('inpostlocker') !== -1 || 
                                                 fullMethodCode.indexOf('paczkomat') !== -1 || 
                                                 (fullMethodCode.indexOf('inpost') !== -1 && (fullMethodCode.indexOf('locker') !== -1 || fullMethodCode.indexOf('box') !== -1 || fullMethodCode.indexOf('point') !== -1));
                            if (isInPostLocker) {
                                var pointData = null;
                                if (checkoutData && typeof checkoutData.getShippingInPostPoint === 'function') {
                                    pointData = checkoutData.getShippingInPostPoint();
                                }

                                if (!pointData || !pointData.name || pointData.name.length === 0) {
                                    showShippingFieldError(methodCode, carrierCode, $t('Please select a pickup point'));
                                    return false;
                                }

                                var fullMethodCodeRaw = methodCode + '_' + carrierCode;
                                if (fullMethodCodeRaw.indexOf('cod') !== -1) {
                                    if (pointData.type && !pointData.type.includes('parcel_locker')) {
                                        showShippingFieldError(methodCode, carrierCode, $t('The selected point does not support the cash on delivery method'));
                                        return false;
                                    }
                                }
                            }
                        } catch (e) {
                            if (window.console && typeof window.console.error === 'function') {
                                window.console.error('Kkkonrad Fastcheckout: Error in shipping validation:', e);
                            }
                        }

                        // Run dynamic/custom shipping validators if registered
                        if (window.fastcheckoutCustomShippingValidators && window.fastcheckoutCustomShippingValidators.length > 0) {
                            for (var i = 0; i < window.fastcheckoutCustomShippingValidators.length; i++) {
                                var validator = window.fastcheckoutCustomShippingValidators[i];
                                if (typeof validator === 'function') {
                                    try {
                                        if (!validator(activeMethod)) {
                                            return false;
                                        }
                                    } catch (err) {
                                        if (window.console && typeof window.console.error === 'function') {
                                            window.console.error('Kkkonrad Fastcheckout: Custom shipping validator error:', err);
                                        }
                                    }
                                }
                            }
                        }

                        return true;
                    }
                };

                // Initial sync once Knockout is ready
                var magewireEl = document.querySelector('[wire\\:id]');
                if (magewireEl && magewireEl.__livewire) {
                    var wire = magewireEl.__livewire;
                    syncAddressToKnockout(wire);
                    var initMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod');
                    if (initMethod) {
                        syncSelectedShippingMethodToKnockout(initMethod);
                    }
                }

                quote.shippingMethod.subscribe(function (method) {
                    clearShippingFieldError();
                    if (!method) {
                        persistShippingMethodToCheckoutData(null);
                        return;
                    }

                    syncShippingMethodToMagewire(method.carrier_code + '_' + method.method_code);
                });

                shippingService.getShippingRates().subscribe(function () {
                    var magewireEl = document.querySelector('[wire\\:id]');
                    if (magewireEl && magewireEl.__livewire) {
                        var wire = magewireEl.__livewire;
                        if (wire.shippingMethod) {
                            syncSelectedShippingMethodToKnockout(wire.shippingMethod);
                        }
                    }
                });

                function getSelectedMethodCode() {
                    var quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';
                    var domMethod = getCheckedDomPaymentMethod();

                    

                    if (domMethod) {
                        return domMethod;
                    }

                    return domHasPaymentMethod(quoteMethod) ? quoteMethod : '';
                }

                function getMethod(methodCode) {
                    return methodList().filter(function (method) {
                        return method.method === methodCode;
                    })[0] || null;
                }

                function getRendererByMethod(methodCode) {
                    var found = null;

                    registry.get(function (component) {
                        var rendererCode;

                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        rendererCode = typeof component.getCode === 'function' ? component.getCode() : '';

                        if (component.item.method === methodCode || rendererCode === methodCode) {
                            found = component;
                        }
                    });

                    return found;
                }

                function getRendererCode(component, fallbackCode) {
                    var rendererCode = component && typeof component.getCode === 'function' ? component.getCode() : '';

                    return rendererCode || fallbackCode;
                }

                function patchRenderer(component) {
                    if (!component || component.fastcheckoutHyvaPatched) {
                        if (component && component.messageContainer) {
                            subscribePaymentMessageContainer(component.messageContainer);
                        }
                        return;
                    }

                    component.fastcheckoutHyvaPatched = true;
                    if (component.messageContainer) {
                        subscribePaymentMessageContainer(component.messageContainer);
                    }
                    component.selectPaymentMethod = function () {
                        syncQuoteCustomerData();
                        var paymentData = typeof component.getData === 'function'
                            ? component.getData()
                            : { method: component.item ? component.item.method : null },
                            rendererCode = getRendererCode(component, paymentData.method);

                        if (paymentData && paymentData.method) {
                            selectPaymentMethodAction(paymentData);
                            persistPaymentMethodToCheckoutData(rendererCode);
                            quote.paymentMethod({
                                method: rendererCode,
                                title: component.item ? component.item.title : null
                            });
                        }

                        return true;
                    };
                }

                function patchRenderers() {
                    registry.get(function (component) {
                        if (component && component.item && component.item.method) {
                            patchRenderer(component);
                        }
                    });
                }

                function elementMatchesMethod(element, methodCode, activeCode) {
                    var inputs = element.querySelectorAll('input'),
                        matches = false;

                    if (element.id === methodCode || element.id === activeCode) {
                        return true;
                    }

                    inputs.forEach(function (input) {
                        if (matches) {
                            return;
                        }

                        matches = input.id === methodCode ||
                            input.id === activeCode ||
                            input.value === methodCode ||
                            input.value === activeCode ||
                            input.getAttribute('value') === methodCode ||
                            input.getAttribute('value') === activeCode;
                    });

                    return matches;
                }

                function hasVisibleContent(element) {
                    var content = element.querySelector('.payment-method-content');
                    if (!content) {
                        return false;
                    }

                    // 1. Check if there are any input, select, or textarea elements
                    if (content.querySelector('input:not([type="hidden"]), select, textarea')) {
                        return true;
                    }

                    // 2. Clone the content to inspect remaining elements/text
                    var clone = content.cloneNode(true);

                    // Remove components we explicitly hide or handle globally
                    var selectorsToRemove = [
                        '.payment-method-title',
                        '.actions-toolbar',
                        '.payment-method-billing-address'
                    ];
                    selectorsToRemove.forEach(function (selector) {
                        clone.querySelectorAll(selector).forEach(function (el) {
                            el.remove();
                        });
                    });

                    // 3. Check for any elements indicating actual content or custom containers (e.g. form structures)
                    var hasContent = false;
                    clone.querySelectorAll('*').forEach(function (el) {
                        var tagName = el.tagName.toLowerCase();
                        // Common content-bearing tags
                        if (['input', 'select', 'textarea', 'img', 'iframe', 'button', 'a', 'p', 'label'].indexOf(tagName) !== -1) {
                            hasContent = true;
                        }
                        // Unique IDs or non-wrapper classes indicate custom gateway elements/containers
                        if (el.id || (el.className && typeof el.className === 'string' && el.className.split(' ').some(function(cls) {
                            return cls && ['payment-method-content', 'content', 'clear'].indexOf(cls) === -1;
                        }))) {
                            hasContent = true;
                        }
                    });
                    if (hasContent) {
                        return true;
                    }

                    // 4. Check if there is any visible text content
                    var text = clone.textContent || clone.innerText || '';
                    if (text.trim().length > 0) {
                        return true;
                    }

                    return false;
                }

                function updateActiveRendererClass(methodCode, activeCode) {
                    
                    var root = document.getElementById('fastcheckout-ko-payment-root'),
                        activeElement = null,
                        movedToTarget = false;

                    // Always hide all target placeholders first
                    hidePaymentPlaceholders();

                    if (!root) {
                        
                        return false;
                    }

                    var allRenderers = document.querySelectorAll('.payment-method');
                    

                    allRenderers.forEach(function (element) {
                        element.classList.remove('_active');
                        element.removeAttribute('data-fastcheckout-active');
                    });

                    allRenderers.forEach(function (element) {
                        if (!activeElement && elementMatchesMethod(element, methodCode, activeCode)) {
                            activeElement = element;
                        }
                    });

                    if (activeElement) {
                        
                        activeElement.classList.add('_active');
                        activeElement.setAttribute('data-fastcheckout-active', 'true');

                        var target = document.querySelector('[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]');
                        if (target) {
                            
                            target.appendChild(activeElement);
                            target.classList.remove('hidden');
                            target.style.display = 'block';
                            movedToTarget = true;
                        } else {
                            
                        }
                    } else {
                        
                    }

                    return movedToTarget;
                }

                function applySelectedMethod(methodCode) {
                    
                    var method,
                        renderer,
                        activeCode,
                        activeMethod;

                    if (!methodCode) {
                        return false;
                    }

                    method = getMethod(methodCode) || { method: methodCode };
                    selectPaymentMethodAction(method);
                    persistPaymentMethodToCheckoutData(methodCode);
                    patchRenderers();
                    renderer = getRendererByMethod(methodCode);
                    patchRenderer(renderer);
                    activeCode = getRendererCode(renderer, methodCode);
                    
                    activeMethod = getMethod(activeCode) || { method: activeCode, title: method.title };
                    quote.paymentMethod(activeMethod);
                    persistPaymentMethodToCheckoutData(activeCode);
                    if (renderer && typeof renderer.selectPaymentMethod === 'function') {
                        renderer.selectPaymentMethod();
                    }
                    return updateActiveRendererClass(methodCode, activeCode);
                }

                var readyDispatched = false;
                var pendingSelectedMethodCode = '';
                var paymentRendererObserver = null;
                var paymentRendererObserverRetryTimer = null;

                function dispatchReadyEvent() {
                    if (readyDispatched) { return; }
                    readyDispatched = true;
                    document.dispatchEvent(new CustomEvent('fastcheckout:ready'));
                }

                function retryPendingSelectedMethod() {
                    if (!pendingSelectedMethodCode || !domHasPaymentMethod(pendingSelectedMethodCode)) {
                        return;
                    }

                    patchRenderers();
                    if (applySelectedMethod(pendingSelectedMethodCode)) {
                        pendingSelectedMethodCode = '';
                    }
                }

                function observePaymentRendererRoot() {
                    var root = document.getElementById('fastcheckout-ko-payment-root');

                    if (paymentRendererObserver || !root || typeof window.MutationObserver !== 'function') {
                        return;
                    }

                    paymentRendererObserver = new MutationObserver(function () {
                        if (paymentRendererObserverRetryTimer) {
                            return;
                        }
                        paymentRendererObserverRetryTimer = window.setTimeout(function () {
                            paymentRendererObserverRetryTimer = null;
                            retryPendingSelectedMethod();
                        }, 0);
                    });
                    paymentRendererObserver.observe(root, {
                        childList: true,
                        subtree: true
                    });
                }

                function setSelectedMethod(methodCode) {
                    
                    syncPaymentMethods();

                    if (!methodCode) {
                        pendingSelectedMethodCode = '';
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        return;
                    }

                    if (!domHasPaymentMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        
                        return;
                    }

                    pendingSelectedMethodCode = methodCode;
                    if (applySelectedMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                    }

                    [50, 150, 350, 750, 1500, 2500].forEach(function (delay) {
                        window.setTimeout(function () {
                            if (pendingSelectedMethodCode === methodCode) {
                                retryPendingSelectedMethod();
                            }
                        }, delay);
                    });

                    // Signal the page overlay that KO renderers are fully initialized
                    window.setTimeout(dispatchReadyEvent, 850);
                }


                function getActiveRenderer() {
                    var selectedMethod = getSelectedMethodCode(),
                        found = null;

                    registry.get(function (component) {
                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        if (
                            typeof component.getData === 'function' &&
                            (component.item.method === selectedMethod ||
                                (typeof component.getCode === 'function' && component.getCode() === selectedMethod))
                        ) {
                            found = component;
                        }
                    });

                    return found;
                }

                function assignCheckoutAgreementsFallback(paymentData) {
                    var agreementIds = [];

                    if (
                        !paymentData ||
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return paymentData;
                    }

                    $('.payment-method._active div[data-role=checkout-agreements] input').serializeArray().forEach(function (item) {
                        agreementIds.push(item.value);
                    });

                    if (!agreementIds.length) {
                        return paymentData;
                    }

                    paymentData.extension_attributes = paymentData.extension_attributes || {};
                    if (!paymentData.extension_attributes.agreement_ids) {
                        paymentData.extension_attributes.agreement_ids = agreementIds;
                    }

                    return paymentData;
                }

                function validateCheckoutAgreementsFallback(hideError) {
                    var inputs,
                        isValid = true,
                        firstInvalid = null;

                    if (
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return true;
                    }

                    inputs = $('.payment-method._active div.checkout-agreements input');
                    if (!inputs.length) {
                        return true;
                    }

                    inputs.each(function (index, element) {
                        var valid = true;

                        if ($.validator && typeof $.validator.validateSingleElement === 'function') {
                            valid = $.validator.validateSingleElement(element, {
                                errorElement: 'div',
                                hideError: !!hideError
                            });
                        } else if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
                            valid = false;
                        }

                        if (!valid) {
                            isValid = false;
                            if (!firstInvalid) {
                                firstInvalid = element;
                            }
                        }
                    });

                    if (!isValid && firstInvalid && !hideError) {
                        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    return isValid;
                }

                function applyPaymentDataAssigners(paymentData) {
                    paymentData = paymentData || { method: getSelectedMethodCode() };

                    loadOptionalValidationComponents();

                    optionalPaymentDataAssigners.forEach(function (assigner) {
                        try {
                            assigner(paymentData);
                        } catch (e) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: payment data assigner failed.', e);
                            }
                        }
                    });

                    return assignCheckoutAgreementsFallback(paymentData);
                }

                function validateAdditionalValidators(hideError) {
                    loadOptionalValidationComponents();

                    var isValid = true;

                    if (!additionalValidators || typeof additionalValidators.validate !== 'function') {
                        return validateCheckoutAgreementsFallback(hideError);
                    }

                    try {
                        isValid = additionalValidators.validate(!!hideError);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: additional checkout validation failed.', e);
                        }
                        return false;
                    }

                    return isValid && validateCheckoutAgreementsFallback(hideError);
                }

                loadOptionalValidationComponents();

                window.fastcheckoutHyvaPayment = {
	                    getActivePaymentData: function () {
	                        var component = getActiveRenderer();

	                        if (component && typeof component.getData === 'function') {
	                            return applyPaymentDataAssigners(component.getData());
                        }

                        return applyPaymentDataAssigners({
                            method: getSelectedMethodCode(),
	                            additional_data: {}
	                        });
	                    },

	                    cleanupKoOrderState: function () {
	                        if (this.koOrderTimeout) {
	                            window.clearTimeout(this.koOrderTimeout);
	                        }
	                        this.koOrderTimeout = null;
	                        this.koOrderDeferred = null;
	                        this.koOrderActive = false;
	                        this.syncWire = null;
	                        this.syncResolve = null;
	                        this.syncReject = null;
	                    },

	                    getPurchaseOrderNumber: function (paymentData) {
	                        var poNumber = '';

	                        if (paymentData) {
	                            poNumber = paymentData.po_number || '';
	                            if (!poNumber && paymentData.additional_data) {
	                                poNumber = paymentData.additional_data.po_number || '';
	                            }
	                        }

	                        if (!poNumber) {
	                            var poInput = document.querySelector('input[name="payment[po_number]"], #po_number');
	                            if (poInput) {
	                                poNumber = poInput.value || '';
	                            }
	                        }

	                        return poNumber;
	                    },

	                    getPaymentAdditionalData: function (paymentData) {
	                        var additionalData = {};

	                        if (paymentData && paymentData.additional_data && typeof paymentData.additional_data === 'object') {
	                            $.extend(additionalData, paymentData.additional_data);
	                        }

	                        if ((paymentData && paymentData.method === 'purchaseorder') || getSelectedMethodCode() === 'purchaseorder') {
	                            additionalData.po_number = this.getPurchaseOrderNumber(paymentData);
	                        }

	                        return additionalData;
	                    },

	                    syncWirePaymentData: function (wire, paymentData) {
                            paymentData = applyPaymentDataAssigners(paymentData || this.getActivePaymentData());

	                        var additionalData = this.getPaymentAdditionalData(paymentData),
                                extensionAttributes = paymentData && paymentData.extension_attributes ? paymentData.extension_attributes : {},
	                            methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode(),
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '';

	                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData))
                                .then(function () {
                                    if (typeof wire.set === 'function') {
                                        return wire.set('paymentExtensionAttributes', extensionAttributes);
                                    }
                                    return true;
                                })
	                            .then(function () {
	                                if (poNumber && typeof wire.set === 'function') {
	                                    return wire.set('poNumber', poNumber);
	                                }
	                                return true;
	                            });
	                    },

	                    syncPaymentData: function (wire) {
	                        if (!wire || typeof wire.set !== 'function') {
	                            return Promise.resolve();
	                        }

	                        return this.syncWirePaymentData(wire, this.getActivePaymentData());
	                    },

	                    placeOrder: function (wire, selectedMethod) {
	                        var component,
	                            paymentData,
	                            result,
	                            self = this;

                            clearPaymentMessages();

	                        if (!wire || typeof wire.call !== 'function') {
                                var missingSessionError = new Error('Checkout session is not ready');
                                handlePaymentError(missingSessionError, getBridgeMessageContainer());
	                            return Promise.reject(missingSessionError);
	                        }

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

	                        return prepareCheckoutState(wire).then(function () {
	                            component = getActiveRenderer();
	                            paymentData = component && typeof component.getData === 'function'
	                                ? applyPaymentDataAssigners(component.getData())
	                                : this.getActivePaymentData();

	                            if (!component || typeof component.placeOrder !== 'function') {
                                    if (!this.validate()) {
                                        var validationError = new Error('Payment method validation failed');
                                        handlePaymentError(validationError, getBridgeMessageContainer());
                                        return Promise.reject(validationError);
                                    }
	                                return this.syncPaymentData(wire).then(function () {
	                                    return wire.call('placeOrder', selectedMethod || (paymentData && paymentData.method) || getSelectedMethodCode());
	                                }).catch(function (err) {
                                        handlePaymentError(err, getBridgeMessageContainer());
                                        throw err;
	                                });
	                            }

	                            if (!this.validate()) {
                                    var activeValidationError = new Error('Payment method validation failed');
                                    handlePaymentError(activeValidationError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(activeValidationError);
	                            }
	                            if (
	                                typeof component.isPlaceOrderActionAllowed === 'function' &&
	                                !component.isPlaceOrderActionAllowed()
	                            ) {
                                    var notReadyError = new Error('Payment method is not ready');
                                    handlePaymentError(notReadyError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(notReadyError);
	                            }

	                            this.cleanupKoOrderState();
	                            this.syncWire = wire;
	                            this.koOrderActive = true;
	                            this.koOrderDeferred = $.Deferred();

	                            return new Promise(function (resolve, reject) {
	                                self.syncResolve = resolve;
	                                self.syncReject = reject;
	                                self.koOrderTimeout = window.setTimeout(function () {
	                                    if (!self.koOrderActive) {
	                                        return;
	                                    }
	                                    self.cleanupKoOrderState();
                                        var timeoutError = new Error('Payment method did not start order placement');
                                        handlePaymentError(timeoutError, component.messageContainer || getBridgeMessageContainer());
	                                    reject(timeoutError);
	                                }, 30000);

	                                try {
	                                    if (component.getCode && component.getCode() === 'braintree') {
	                                        result = component.placeOrder();
	                                    } else {
	                                        result = component.placeOrder(paymentData, new Event('submit'));
	                                    }

	                                    if (result === false) {
	                                        self.cleanupKoOrderState();
                                            var resultError = new Error('Payment method validation failed');
                                            handlePaymentError(resultError, component.messageContainer || getBridgeMessageContainer());
	                                        reject(resultError);
	                                    }
	                                } catch (e) {
	                                    if (window.console && typeof window.console.error === 'function') {
	                                        window.console.error('Kkkonrad Fastcheckout: component placeOrder thrown exception:', e);
	                                    }
	                                    self.cleanupKoOrderState();
                                        handlePaymentError(e, component.messageContainer || getBridgeMessageContainer());
	                                    reject(e);
	                                }
	                            });
	                        }.bind(this));
	                    },

	                    onPlaceOrderAction: function (paymentData, messageContainer, originalAction) {
	                        var methodCode = paymentData.method || getSelectedMethodCode();
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

	                        if (this.koOrderActive && this.syncWire) {
	                            try {
	                                if (this.koOrderTimeout) {
	                                    window.clearTimeout(this.koOrderTimeout);
	                                    this.koOrderTimeout = null;
	                                }

	                                this.syncWirePaymentData(this.syncWire, paymentData)
	                                    .then(function () {
	                                        return this.syncWire.call('placeOrder', methodCode);
	                                    }.bind(this))
	                                    .then(function () {
	                                        if (this.syncResolve) {
	                                            this.syncResolve(true);
	                                            this.syncResolve = null;
	                                            this.syncReject = null;
	                                        }
	                                    }.bind(this))
	                                    .catch(function (err) {
                                            handlePaymentError(err, messageContainer);
	                                        if (this.koOrderDeferred) {
	                                            this.koOrderDeferred.reject(err);
	                                        }
	                                        if (this.syncReject) {
	                                            this.syncReject(err);
	                                        }
	                                        this.cleanupKoOrderState();
	                                    }.bind(this));
	                            } catch (err) {
                                    handlePaymentError(err, messageContainer);
	                                if (this.koOrderDeferred) {
	                                    this.koOrderDeferred.reject(err);
	                                }
	                                if (this.syncReject) {
	                                    this.syncReject(err);
	                                }
	                                this.cleanupKoOrderState();
	                            }

	                            return this.koOrderDeferred ? this.koOrderDeferred.promise() : $.Deferred().promise();
	                        }

	                        // Fallback if a gateway calls placeOrderAction outside the Tailwind submit button flow.
	                        var wire = this.syncWire || (window.Livewire ? window.Livewire.find(document.querySelector('[wire\\:id]').getAttribute('wire:id')) : null);
	                        if (wire) {
	                            this.syncWirePaymentData(wire, paymentData).then(function () {
	                                wire.call('placeOrder', methodCode);
	                            }).catch(function (err) {
                                    handlePaymentError(err, messageContainer);
	                            });
	                        }

	                        return $.Deferred().promise();
	                    },

	                    handleOrderPlaced: function (detail) {
	                        var deferred = this.koOrderDeferred;

	                        if (detail && detail.redirectUrl) {
	                            this.cleanupKoOrderState();
	                            window.location.replace(detail.redirectUrl);
	                            return true;
	                        }

	                        if (deferred) {
	                            this.cleanupKoOrderState();
	                            deferred.resolve();
	                            return true;
	                        }

	                        return false;
	                    },

                    validate: function () {
                        var component = getActiveRenderer();
                        if (component && typeof component.validate === 'function') {
                            var isValid = component.validate();
                            if (!isValid) {
                                return false;
                            }
                        }
                        return validateAdditionalValidators(false);
                    },

                    afterPlaceOrder: function () {
                        var component = getActiveRenderer();
                        

                        if (component) {
                            // Check if the component has custom post-place order data (like PayU)
                            if (component.postPlaceOrderData) {
                                require(['mage/url', 'jquery'], function (url, $) {
                                    $.getJSON(url.build(component.postPlaceOrderData), function (response) {
                                        if (response.success && response.redirectUri) {
                                            window.location.replace(response.redirectUri);
                                        } else {
                                            window.location.replace(url.build('checkout/onepage/success'));
                                        }
                                    }).fail(function () {
                                        window.location.replace(url.build('checkout/onepage/success'));
                                    });
                                });
                                return;
                            }

                            // If the component overrides standard afterPlaceOrder (like Tpay)
                            if (typeof component.afterPlaceOrder === 'function' && component.redirectAfterPlaceOrder === false) {
                                try {
                                    component.afterPlaceOrder();
                                    return;
                                } catch (e) {
                                    if (window.console && typeof window.console.error === 'function') {
                                        window.console.error('Kkkonrad Fastcheckout: error executing afterPlaceOrder:', e);
                                    }
                                }
                            }
                        }

                        // Default success redirect
                        require(['mage/url'], function (url) {
                            window.location.replace(url.build('checkout/onepage/success'));
                        });
                    },

                    selectPaymentMethod: setSelectedMethod,
                    getActiveRenderer: getActiveRenderer,
                    getMessageContainer: getBridgeMessageContainer,
                    clearMessages: clearPaymentMessages
                };


                patchRenderers();
                observePaymentRendererRoot();
                setSelectedMethod(getSelectedMethodCode());

                document.addEventListener('change', function (event) {
                    if (event.target && event.target.name === 'payment_method') {
                        setSelectedMethod(event.target.value);
                    }
                });

                document.addEventListener('click', function (event) {
                    // Ignore clicks inside the Knockout payment form container to prevent inputs from losing focus
                    if (event.target && event.target.closest('.fastcheckout-payment-method-ko-container')) {
                        return;
                    }

                    var option = event.target ? event.target.closest('[data-fastcheckout-payment-option]') : null,
                        input;

                    if (event.target && event.target.name === 'payment_method') {
                        window.setTimeout(function () {
                            setSelectedMethod(event.target.value);
                        }, 0);
                        return;
                    }

                    if (option) {
                        input = option.querySelector('input[name="payment_method"]');
                        if (input && !input.disabled) {
                            input.checked = true;
                            window.setTimeout(function () {
                                setSelectedMethod(input.value);
                            }, 0);
                        }
                    }
                }, true);

                function moveRenderersBackToRoot() {
                    var root = document.getElementById('fastcheckout-ko-payment-root');
                    
                    hidePaymentPlaceholders();
                    if (root) {
                        var count = 0;
                        document.querySelectorAll('.payment-method').forEach(function (element) {
                            if (element.parentNode !== root) {
                                root.appendChild(element);
                                count++;
                            }
                        });
                        
                    }
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('element.updating', function (fromEl, toEl) {
                        if (fromEl.getAttribute('wire:key') === 'checkout-payment-methods-card') {
                            var fromCodes = Array.from(fromEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option');
                            }).sort().join(',');

                            var toCodes = Array.from(toEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option');
                            }).sort().join(',');

                            if (fromCodes === toCodes) {
                                
                                return false;
                            }

                            
                            moveRenderersBackToRoot();
                        }
                    });

                    window.Livewire.hook('message.processed', function () {
                        syncPaymentMethods();
                        var code = getSelectedMethodCode();
                        
                        patchRenderers();
                        setSelectedMethod(code);

                        var magewireEl = document.querySelector('[wire\\:id]');
                        if (magewireEl && magewireEl.__livewire) {
                            var wire = magewireEl.__livewire;
                            syncAddressToKnockout(wire);
                            var currentMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod');
                            if (currentMethod) {
                                syncSelectedShippingMethodToKnockout(currentMethod);
                            }
                        }
                    });
                }

                // Load discovered layout scripts dynamically via RequireJS
                var layoutScripts = config.layoutScripts || [];
                if (layoutScripts.length > 0) {
                    layoutScripts.forEach(function (scriptModule) {
                        require([scriptModule], function () {
                            
                        }, function (err) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: Could not load layout script:', scriptModule, err);
                            }
                        });
                    });
                }

            });
        });
    };
});
