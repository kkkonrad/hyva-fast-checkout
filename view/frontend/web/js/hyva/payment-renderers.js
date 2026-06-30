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
                        if (shippingAddress) {
                            selectBillingAddressAction(shippingAddress);
                        }
                        return quote.billingAddress();
                    }

                    newAddress = addressConverter.formAddressDataToQuoteAddress(buildAddressData(magewire, 'billing'));
                    currentAddress = quote.billingAddress();
                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectBillingAddressAction(newAddress);
                    }

                    return quote.billingAddress() || newAddress;
                }

                function syncSelectedShippingMethodToKnockout(methodCode) {
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
                    if (!method) return;
                    var methodCode = method.carrier_code + '_' + method.method_code;

                    var magewireEl = document.querySelector('[wire\\:id]');
                    if (magewireEl && magewireEl.__livewire) {
                        var wire = magewireEl.__livewire;
                        if (wire.shippingMethod !== methodCode) {
                            
                            wire.call('selectShippingMethod', methodCode);
                        }
                    }
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
                        return;
                    }

                    component.fastcheckoutHyvaPatched = true;
                    component.selectPaymentMethod = function () {
                        syncQuoteCustomerData();
                        var paymentData = typeof component.getData === 'function'
                            ? component.getData()
                            : { method: component.item ? component.item.method : null },
                            rendererCode = getRendererCode(component, paymentData.method);

                        if (paymentData && paymentData.method) {
                            selectPaymentMethodAction(paymentData);
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
                    patchRenderers();
                    renderer = getRendererByMethod(methodCode);
                    patchRenderer(renderer);
                    activeCode = getRendererCode(renderer, methodCode);
                    
                    activeMethod = getMethod(activeCode) || { method: activeCode, title: method.title };
                    quote.paymentMethod(activeMethod);
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
                        hidePaymentPlaceholders();
                        return;
                    }

                    if (!domHasPaymentMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
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

                window.fastcheckoutHyvaPayment = {
	                    getActivePaymentData: function () {
	                        var component = getActiveRenderer();

	                        if (component && typeof component.getData === 'function') {
	                            return component.getData();
                        }

                        return {
                            method: getSelectedMethodCode(),
	                            additional_data: {}
	                        };
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
	                        var additionalData = this.getPaymentAdditionalData(paymentData),
	                            methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode(),
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '';

	                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData))
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

	                        if (!wire || typeof wire.call !== 'function') {
	                            return Promise.reject(new Error('Checkout session is not ready'));
	                        }

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

	                        return prepareCheckoutState(wire).then(function () {
	                            component = getActiveRenderer();
	                            paymentData = component && typeof component.getData === 'function'
	                                ? component.getData()
	                                : this.getActivePaymentData();

	                            if (!component || typeof component.placeOrder !== 'function') {
	                                return this.syncPaymentData(wire).then(function () {
	                                    return wire.call('placeOrder', selectedMethod || (paymentData && paymentData.method) || getSelectedMethodCode());
	                                });
	                            }

	                            if (typeof component.validate === 'function' && !component.validate()) {
	                                return Promise.reject(new Error('Payment method validation failed'));
	                            }
	                            if (
	                                typeof component.isPlaceOrderActionAllowed === 'function' &&
	                                !component.isPlaceOrderActionAllowed()
	                            ) {
	                                return Promise.reject(new Error('Payment method is not ready'));
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
	                                    reject(new Error('Payment method did not start order placement'));
	                                }, 30000);

	                                try {
	                                    if (component.getCode && component.getCode() === 'braintree') {
	                                        result = component.placeOrder();
	                                    } else {
	                                        result = component.placeOrder(paymentData, new Event('submit'));
	                                    }

	                                    if (result === false) {
	                                        self.cleanupKoOrderState();
	                                        reject(new Error('Payment method validation failed'));
	                                    }
	                                } catch (e) {
	                                    if (window.console && typeof window.console.error === 'function') {
	                                        window.console.error('Kkkonrad Fastcheckout: component placeOrder thrown exception:', e);
	                                    }
	                                    self.cleanupKoOrderState();
	                                    reject(e);
	                                }
	                            });
	                        }.bind(this));
	                    },

	                    onPlaceOrderAction: function (paymentData, messageContainer, originalAction) {
	                        var methodCode = paymentData.method || getSelectedMethodCode();

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
	                                        if (this.koOrderDeferred) {
	                                            this.koOrderDeferred.reject(err);
	                                        }
	                                        if (this.syncReject) {
	                                            this.syncReject(err);
	                                        }
	                                        this.cleanupKoOrderState();
	                                    }.bind(this));
	                            } catch (err) {
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
                            
                            return isValid;
                        }
                        return true;
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
                    getActiveRenderer: getActiveRenderer
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
