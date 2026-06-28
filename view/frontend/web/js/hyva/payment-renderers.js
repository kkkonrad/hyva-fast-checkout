define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        if (window.console && typeof window.console.log === 'function') {
            window.console.log('Kkkonrad OPC: payment-renderers JS initialized with config:', config);
        }
        var scope = config.scope || 'iwdOpcHyvaPaymentRenderers',
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
                            window.console.warn('Kkkonrad OPC: payment renderer could not be loaded', component, error);
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
                                if (window.console && typeof window.console.log === 'function') {
                                    window.console.log('Kkkonrad OPC: customerData initialized successfully');
                                }
                            } catch (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Kkkonrad OPC: customerData initialization error:', e);
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
                    document.querySelectorAll('.iwd-opc-payment-method-ko-container').forEach(function (placeholder) {
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
                    if (window.iwdOpcHyvaPaymentList && typeof window.iwdOpcHyvaPaymentList.syncRenderers === 'function') {
                        window.iwdOpcHyvaPaymentList.syncRenderers();
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
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: clearing inactive quote payment method:', quoteMethod);
                        }
                        selectPaymentMethodAction(null);
                        hidePaymentPlaceholders();
                    }

                    if (currentMethodsJson === lastMethodsJson) {
                        syncKoPaymentRenderers();
                        return domMethods;
                    }
                    lastMethodsJson = currentMethodsJson;

                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: syncPaymentMethods found methods:', methods);
                    }

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
                        'iwdOpcHyvaShippingRenderers': {
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

                function syncAddressToKnockout(magewire) {
                    if (!magewire) return;

                    var street = [];
                    var street1 = getProperty(magewire, 'street1');
                    var street2 = getProperty(magewire, 'street2');
                    if (street1) street.push(street1);
                    if (street2) street.push(street2);

                    var addressData = {
                        firstname: getProperty(magewire, 'firstname'),
                        lastname: getProperty(magewire, 'lastname'),
                        company: getProperty(magewire, 'company'),
                        street: street,
                        city: getProperty(magewire, 'city'),
                        postcode: getProperty(magewire, 'postcode'),
                        countryId: getProperty(magewire, 'countryId'),
                        regionId: (getProperty(magewire, 'regionId') && parseInt(getProperty(magewire, 'regionId'), 10) > 0) ? parseInt(getProperty(magewire, 'regionId'), 10) : null,
                        region: getProperty(magewire, 'region'),
                        telephone: getProperty(magewire, 'telephone'),
                        saveInAddressBook: 0
                    };

                    require([
                        'Magento_Checkout/js/action/select-shipping-address',
                        'Magento_Checkout/js/model/address-converter'
                    ], function (selectShippingAddress, addressConverter) {
                        var newAddress = addressConverter.formAddressDataToQuoteAddress(addressData);
                        var currentAddress = quote.shippingAddress();

                        if (currentAddress &&
                            currentAddress.countryId === newAddress.countryId &&
                            currentAddress.postcode === newAddress.postcode &&
                            currentAddress.city === newAddress.city &&
                            JSON.stringify(currentAddress.street) === JSON.stringify(newAddress.street) &&
                            currentAddress.regionId == newAddress.regionId &&
                            currentAddress.region === newAddress.region &&
                            currentAddress.firstname === newAddress.firstname &&
                            currentAddress.lastname === newAddress.lastname &&
                            currentAddress.telephone === newAddress.telephone
                        ) {
                            return;
                        }

                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: syncAddressToKnockout updating quote shippingAddress:', addressData);
                        }
                        selectShippingAddress(newAddress);
                    });
                }

                function syncSelectedShippingMethodToKnockout(methodCode) {
                    if (!methodCode) {
                        quote.shippingMethod(null);
                        return;
                    }
                    require([
                        'Magento_Checkout/js/action/select-shipping-method'
                    ], function (selectShippingMethod) {
                        var rates = shippingService.getShippingRates()();
                        var found = rates.filter(function (rate) {
                            return (rate.carrier_code + '_' + rate.method_code) === methodCode;
                        })[0];
                        if (found) {
                            var active = quote.shippingMethod();
                            if (!active || active.carrier_code !== found.carrier_code || active.method_code !== found.method_code) {
                                if (window.console && typeof window.console.log === 'function') {
                                    window.console.log('Kkkonrad OPC: syncSelectedShippingMethodToKnockout setting active:', methodCode);
                                }
                                selectShippingMethod(found);
                            }
                        }
                    });
                }

                function getShippingListComponent() {
                    return window.iwdOpcHyvaShippingListInstance || (typeof registry !== 'undefined' && registry.get('iwdOpcHyvaShippingRenderers.shippingList')) || null;
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
                             document.getElementById('iwd-opc-ko-shipping-root') ||
                             document.querySelector('[name="shipping_method"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                window.iwdOpcHyvaShipping = {
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
                                window.console.error('Kkkonrad OPC: Error in shipping validation:', e);
                            }
                        }

                        // Run dynamic/custom shipping validators if registered
                        if (window.iwdOpcCustomShippingValidators && window.iwdOpcCustomShippingValidators.length > 0) {
                            for (var i = 0; i < window.iwdOpcCustomShippingValidators.length; i++) {
                                var validator = window.iwdOpcCustomShippingValidators[i];
                                if (typeof validator === 'function') {
                                    try {
                                        if (!validator(activeMethod)) {
                                            return false;
                                        }
                                    } catch (err) {
                                        if (window.console && typeof window.console.error === 'function') {
                                            window.console.error('Kkkonrad OPC: Custom shipping validator error:', err);
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
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: quote.shippingMethod changed in KO, syncing to Magewire:', methodCode);
                            }
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

                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: getSelectedMethodCode - quoteMethod:', quoteMethod, 'domMethod:', domMethod);
                    }

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
                    if (!component || component.iwdOpcHyvaPatched) {
                        return;
                    }

                    component.iwdOpcHyvaPatched = true;
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

                    // 3. Check if there are any images, custom payment containers, or regulatory texts
                    var customSelectors = [
                        'img',
                        'iframe',
                        '.payu-card-form-container',
                        '.tpay-payment-gateways',
                        '.TpayRegulations'
                    ];
                    for (var i = 0; i < customSelectors.length; i++) {
                        if (clone.querySelector(customSelectors[i])) {
                            return true;
                        }
                    }

                    // 4. Check if there is any visible text content
                    var text = clone.textContent || clone.innerText || '';
                    if (text.trim().length > 0) {
                        return true;
                    }

                    return false;
                }

                function updateActiveRendererClass(methodCode, activeCode) {
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: updateActiveRendererClass methodCode:', methodCode, 'activeCode:', activeCode);
                    }
                    var root = document.getElementById('iwd-opc-ko-payment-root'),
                        activeElement = null,
                        movedToTarget = false;

                    // Always hide all target placeholders first
                    hidePaymentPlaceholders();

                    if (!root) {
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: #iwd-opc-ko-payment-root not found!');
                        }
                        return false;
                    }

                    var allRenderers = document.querySelectorAll('.payment-method');
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: allRenderers count:', allRenderers.length);
                    }

                    allRenderers.forEach(function (element) {
                        element.classList.remove('_active');
                        element.removeAttribute('data-iwd-active');
                    });

                    allRenderers.forEach(function (element) {
                        if (!activeElement && elementMatchesMethod(element, methodCode, activeCode)) {
                            activeElement = element;
                        }
                    });

                    if (activeElement) {
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: found activeElement for method:', methodCode);
                        }
                        activeElement.classList.add('_active');
                        activeElement.setAttribute('data-iwd-active', 'true');

                        var target = document.querySelector('[data-iwd-payment-method-ko-target="' + methodCode + '"]');
                        if (target) {
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: moving activeElement to target placeholder:', methodCode, 'hasVisibleContent:', hasVisibleContent(activeElement));
                            }
                            target.appendChild(activeElement);
                            target.classList.remove('hidden');
                            target.style.display = 'block';
                            movedToTarget = true;
                        } else {
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: target placeholder NOT found for method:', methodCode);
                            }
                        }
                    } else {
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: activeElement NOT found for method:', methodCode);
                        }
                    }

                    return movedToTarget;
                }

                function applySelectedMethod(methodCode) {
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: applySelectedMethod called for:', methodCode);
                    }
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
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: applySelectedMethod renderer found:', !!renderer, 'activeCode:', activeCode);
                    }
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

                function dispatchReadyEvent() {
                    if (readyDispatched) { return; }
                    readyDispatched = true;
                    document.dispatchEvent(new CustomEvent('iwd-opc:ready'));
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
                    var root = document.getElementById('iwd-opc-ko-payment-root');

                    if (paymentRendererObserver || !root || typeof window.MutationObserver !== 'function') {
                        return;
                    }

                    paymentRendererObserver = new MutationObserver(function () {
                        window.setTimeout(retryPendingSelectedMethod, 0);
                    });
                    paymentRendererObserver.observe(root, {
                        childList: true,
                        subtree: true
                    });
                }

                function setSelectedMethod(methodCode) {
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: setSelectedMethod called with:', methodCode);
                    }
                    syncPaymentMethods();

                    if (!methodCode) {
                        pendingSelectedMethodCode = '';
                        hidePaymentPlaceholders();
                        return;
                    }

                    if (!domHasPaymentMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                        hidePaymentPlaceholders();
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: selected payment method is no longer available:', methodCode);
                        }
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

                window.iwdOpcHyvaPayment = {
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

                    syncPaymentData: function (wire) {
                        var paymentData = this.getActivePaymentData(),
                            additionalData = paymentData.additional_data || {};

                        if (!wire || typeof wire.set !== 'function') {
                            return Promise.resolve();
                        }

                        // Extract PO number for purchaseorder
                        if (paymentData && (paymentData.method === 'purchaseorder' || getSelectedMethodCode() === 'purchaseorder')) {
                            var poNumber = paymentData.po_number || '';
                            if (!poNumber) {
                                var poInput = document.querySelector('input[name="payment[po_number]"]');
                                if (poInput) {
                                    poNumber = poInput.value;
                                }
                            }
                            additionalData.po_number = poNumber;
                        }

                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData));
                    },

                    validate: function () {
                        var component = getActiveRenderer();
                        if (component && typeof component.validate === 'function') {
                            var isValid = component.validate();
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: Knockout component validation result:', isValid);
                            }
                            return isValid;
                        }
                        return true;
                    },

                    afterPlaceOrder: function () {
                        var component = getActiveRenderer();
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: afterPlaceOrder triggered for component:', component);
                        }

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
                                        window.console.error('Kkkonrad OPC: error executing afterPlaceOrder:', e);
                                    }
                                }
                            }
                        }

                        // Default success redirect
                        require(['mage/url'], function (url) {
                            window.location.replace(url.build('checkout/onepage/success'));
                        });
                    },

                    selectPaymentMethod: setSelectedMethod
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
                    if (event.target && event.target.closest('.iwd-opc-payment-method-ko-container')) {
                        return;
                    }

                    var option = event.target ? event.target.closest('[data-iwd-opc-payment-option]') : null,
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
                    var root = document.getElementById('iwd-opc-ko-payment-root');
                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('Kkkonrad OPC: moveRenderersBackToRoot called, root exists:', !!root);
                    }
                    hidePaymentPlaceholders();
                    if (root) {
                        var count = 0;
                        document.querySelectorAll('.payment-method').forEach(function (element) {
                            if (element.parentNode !== root) {
                                root.appendChild(element);
                                count++;
                            }
                        });
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: moved back to root count:', count);
                        }
                    }
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('element.updating', function (fromEl, toEl) {
                        if (fromEl.getAttribute('wire:key') === 'checkout-payment-methods-card') {
                            var fromCodes = Array.from(fromEl.querySelectorAll('[data-iwd-opc-payment-option]')).map(function (el) {
                                return el.getAttribute('data-iwd-opc-payment-option');
                            }).sort().join(',');

                            var toCodes = Array.from(toEl.querySelectorAll('[data-iwd-opc-payment-option]')).map(function (el) {
                                return el.getAttribute('data-iwd-opc-payment-option');
                            }).sort().join(',');

                            if (fromCodes === toCodes) {
                                if (window.console && typeof window.console.log === 'function') {
                                    window.console.log('Kkkonrad OPC: Payment methods list did not change, ignoring DOM update.');
                                }
                                return false;
                            }

                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: Payment methods list changed, moving renderers to root before update.');
                            }
                            moveRenderersBackToRoot();
                        }
                    });

                    window.Livewire.hook('message.processed', function () {
                        syncPaymentMethods();
                        var code = getSelectedMethodCode();
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('Kkkonrad OPC: Livewire message.processed triggered, getSelectedMethodCode:', code);
                        }
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
                            if (window.console && typeof window.console.log === 'function') {
                                window.console.log('Kkkonrad OPC: Loaded layout script:', scriptModule);
                            }
                        }, function (err) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad OPC: Could not load layout script:', scriptModule, err);
                            }
                        });
                    });
                }

            });
        });
    };
});
