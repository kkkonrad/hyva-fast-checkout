define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/hyva/renderer-manager',
    'Kkkonrad_Fastcheckout/js/hyva/shadow-selector-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-provider-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/address-attributes-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/form-data-collector',
    'Kkkonrad_Fastcheckout/js/hyva/payment-message-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/payment-validation-registry',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-compatibility-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-compatibility',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-data-persistence',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-totals-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-layout-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/address-data-builder',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-state-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/payment-dom-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/place-order-hooks-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-attributes-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-component-fallbacks',
    'Kkkonrad_Fastcheckout/js/hyva/magewire-utils',
    'Kkkonrad_Fastcheckout/js/hyva/payment-method-sync',
    'Kkkonrad_Fastcheckout/js/hyva/customer-email-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-agreements-fallback',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-method-sync',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-error-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/step-navigator-bridge'
], function ($, createRendererManager, initShadowSelectorBridge, createCheckoutProviderBridge, createAddressAttributesBridge, formDataCollector, createPaymentMessageBridge, createPaymentValidationRegistry, createShippingCompatibilityBridge, checkoutCompatibility, createCheckoutDataPersistence, createCheckoutTotalsSync, createCheckoutLayoutBridge, createAddressDataBuilder, createCheckoutStateBridge, createPaymentDomBridge, createPlaceOrderHooksBridge, createShippingAttributesSync, createCheckoutComponentFallbacks, magewireUtils, createPaymentMethodSync, createCustomerEmailSync, checkoutAgreementsFallback, createShippingMethodSync, createShippingErrorBridge, createStepNavigatorBridge) {
    'use strict';

    return function (config) {
        if (window.fastcheckoutKoCheckoutBridgeInitialized || window.fastcheckoutKoPaymentBridgeInitialized) {
            return;
        }

        window.fastcheckoutKoCheckoutBridgeInitialized = true;
        window.fastcheckoutKoPaymentBridgeInitialized = true;
        
        initShadowSelectorBridge();
        window.fastcheckoutKoPaymentBridgeInitCount = (window.fastcheckoutKoPaymentBridgeInitCount || 0) + 1;
        
        var scope = config.scope || 'fastcheckoutHyvaPaymentRenderers',
            rendererManager = createRendererManager(config);

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
        if (!window.checkoutConfig.totalsData || typeof window.checkoutConfig.totalsData !== 'object') {
            window.checkoutConfig.totalsData = {
                items: window.checkoutConfig.quoteItemData || [],
                total_segments: [],
                subtotal: 0,
                subtotal_with_discount: 0,
                grand_total: 0
            };
        }
        window.isCustomerLoggedIn = window.checkoutConfig.isCustomerLoggedIn;
        window.customerData = window.checkoutConfig.customerData;

        require([
            'knockout',
            'Magento_Ui/js/core/app',
            'Magento_Checkout/js/model/payment-service',
            'Magento_Checkout/js/model/payment/method-converter',
            'Magento_Checkout/js/model/payment/method-list',
            'Magento_Checkout/js/model/quote',
            'Magento_Checkout/js/model/totals',
            'Magento_Checkout/js/action/select-payment-method',
            'uiRegistry',
            'Magento_Checkout/js/model/shipping-service',
            'Magento_Checkout/js/model/shipping-rate-service',
            'Magento_Checkout/js/model/shipping-rates-validator',
            'Magento_Checkout/js/checkout-data',
            'Magento_Checkout/js/action/select-shipping-address',
            'Magento_Checkout/js/action/select-shipping-method',
            'Magento_Checkout/js/action/select-billing-address',
            'Magento_Checkout/js/model/address-converter',
            'Magento_Checkout/js/action/set-shipping-information',
            'Magento_Checkout/js/model/payment/additional-validators',
            'Magento_Ui/js/model/messages',
            'Magento_Ui/js/model/messageList',
            'Magento_Checkout/js/model/error-processor',
            'Magento_Checkout/js/model/full-screen-loader',
            'Magento_Checkout/js/model/payment/place-order-hooks',
            'Magento_Checkout/js/model/step-navigator',
            'mage/translate',
            'mage/validation'
        ], function (
            ko,
            app,
            paymentService,
            methodConverter,
            methodList,
            quote,
            checkoutTotals,
            selectPaymentMethodAction,
            registry,
            shippingService,
            shippingRateService,
            shippingRatesValidator,
            checkoutData,
            selectShippingAddressAction,
            selectShippingMethodAction,
            selectBillingAddressAction,
            addressConverter,
            setShippingInformationAction,
            additionalValidators,
            Messages,
            globalMessageList,
            errorProcessor,
            fullScreenLoader,
            placeOrderHooks,
            stepNavigator,
            $t
        ) {
            checkoutCompatibility.ensureQuoteAddressCacheKeys(quote);
            checkoutCompatibility.ensureCheckoutDataInPostFallback(checkoutData);

            var checkoutProviderBridge = createCheckoutProviderBridge({
                registry: registry,
                getPaymentMethods: function () {
                    return typeof getDomPaymentMethods === 'function' ? getDomPaymentMethods() : [];
                }
            });

            var addressAttributesBridge = createAddressAttributesBridge({
                quote: quote,
                getCheckoutProvider: getCheckoutProvider
            });

            var checkoutComponentFallbacks = createCheckoutComponentFallbacks({
                ko: ko,
                registry: registry,
                quote: quote,
                getCheckoutProvider: getCheckoutProvider,
                translate: $t
            });

            createStepNavigatorBridge({
                ko: ko,
                stepNavigator: stepNavigator
            }).init();

            function getCountryDictionaryOptions() {
                return checkoutProviderBridge.getCountryDictionaryOptions();
            }

            function getCountryOptionsByValue() {
                return checkoutProviderBridge.getCountryOptionsByValue();
            }

            function getCheckoutProvider() {
                return checkoutProviderBridge.getCheckoutProvider();
            }

            function updateQuoteAddressAttributes(address, customAttributes, extensionAttributes) {
                addressAttributesBridge.updateQuoteAddressAttributes(address, customAttributes, extensionAttributes);
            }

            function syncCheckoutProviderAddressAttributes() {
                addressAttributesBridge.sync();
            }

            function registerCheckoutProviderAddressAttributeSync() {
                addressAttributesBridge.register();
            }

            function getShippingAddressComponent() {
                return checkoutComponentFallbacks.getShippingAddressComponent();
            }

            function getBillingAddressComponent() {
                return checkoutComponentFallbacks.getBillingAddressComponent();
            }

            getCheckoutProvider();
            getShippingAddressComponent();
            getBillingAddressComponent();

            window.fastcheckoutHyvaPayment = window.fastcheckoutHyvaPayment || {};

            function getRendererComponentForMethod(methodCode) {
                return rendererManager.getRendererComponentForMethod(methodCode);
            }

            function loadRendererForMethod(methodCode) {
                return rendererManager.loadRendererForMethod(methodCode);
            }

            function ensureRendererForMethod(methodCode) {
                return rendererManager.ensureRendererForMethod(methodCode);
            }

            function runPatchRenderers() {
                rendererManager.runPatchRenderers();
            }

            function runSyncPaymentRenderers() {
                rendererManager.runSyncPaymentRenderers();
            }

            function loadRendererComponents(done) {
                rendererManager.loadRendererComponents(done);
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

                var paymentMessageBridge = createPaymentMessageBridge({
                    registry: registry,
                    Messages: Messages,
                    globalMessageList: globalMessageList,
                    errorProcessor: errorProcessor,
                    fullScreenLoader: fullScreenLoader,
                    translate: $t
                });
                var paymentValidationRegistry = createPaymentValidationRegistry({
                    config: config,
                    additionalValidators: additionalValidators
                });
                var shippingCompatibilityBridge = createShippingCompatibilityBridge({
                    ko: ko,
                    registry: registry,
                    getShippingAddressComponent: getShippingAddressComponent,
                    getCheckoutProvider: getCheckoutProvider,
                    getCountryOptionsByValue: getCountryOptionsByValue,
                    getBridgeMessageContainer: getBridgeMessageContainer,
                    getCheckoutErrorsComponent: getCheckoutErrorsComponent
                });
                var checkoutDataPersistence = createCheckoutDataPersistence({
                    checkoutData: checkoutData
                });
                var checkoutTotalsSync = createCheckoutTotalsSync({
                    config: config,
                    quote: quote,
                    checkoutTotals: checkoutTotals
                });
                var checkoutLayoutBridge = createCheckoutLayoutBridge({
                    config: config,
                    registry: registry
                });
                var addressDataBuilder = createAddressDataBuilder({
                    quote: quote,
                    getProperty: getProperty,
                    normalizeCustomAttributes: normalizeAddressCustomAttributes
                });
                var paymentDomBridge = createPaymentDomBridge({
                    compareMethodCodes: paymentMethodCodesEqual
                });
                var checkoutStateBridge = createCheckoutStateBridge({
                    config: config,
                    paymentService: paymentService,
                    methodConverter: methodConverter,
                    quote: quote,
                    checkoutTotals: checkoutTotals,
                    shippingService: shippingService,
                    selectPaymentMethodAction: selectPaymentMethodAction,
                    selectShippingMethodAction: selectShippingMethodAction,
                    callbacks: {
                        syncQuoteTotals: syncQuoteTotals,
                        syncQuoteTotalsFromDom: syncQuoteTotalsFromDom,
                        syncQuoteCustomerData: syncQuoteCustomerData,
                        getDomPaymentMethods: getDomPaymentMethods,
                        domHasPaymentMethod: domHasPaymentMethod,
                        persistPaymentMethodToCheckoutData: persistPaymentMethodToCheckoutData,
                        hidePaymentPlaceholders: hidePaymentPlaceholders,
                        syncKoPaymentRenderers: syncKoPaymentRenderers,
                        setQuotePaymentMethodFromBridge: setQuotePaymentMethodFromBridge,
                        persistEmailToCheckoutData: persistEmailToCheckoutData,
                        syncSelectedShippingMethodToKnockout: syncSelectedShippingMethodToKnockout,
                        setQuoteGuestEmail: setQuoteGuestEmail,
                        getShippingMethodCode: getShippingMethodCode,
                        getMagewireComponent: getMagewireComponent,
                        getProperty: getProperty,
                        handlePaymentError: handlePaymentError,
                        getBridgeMessageContainer: getBridgeMessageContainer
                    }
                });
                var placeOrderHooksBridge = createPlaceOrderHooksBridge({
                    quote: quote,
                    placeOrderHooks: placeOrderHooks,
                    getEmailForQuote: getEmailForQuote
                });
                var shippingAttributesSync = createShippingAttributesSync({
                    checkoutData: checkoutData,
                    quote: quote,
                    getShippingMethodCode: getShippingMethodCode,
                    collectStructuredFields: collectFastcheckoutStructuredFields,
                    getShippingFormRoots: getFastcheckoutShippingFormRoots,
                    normalizeAddressAttributeMap: normalizeAddressAttributeMap,
                    getAddressAttributes: getAddressAttributes,
                    updateQuoteAddressAttributes: updateQuoteAddressAttributes,
                    getMagewireComponent: getMagewireComponent,
                    getProperty: getProperty,
                    setMagewireValue: setMagewireValue
                });
                var paymentMethodSync = createPaymentMethodSync({
                    quote: quote,
                    getMagewireComponent: getMagewireComponent,
                    getProperty: getProperty,
                    persistPaymentMethod: persistPaymentMethodToCheckoutData
                });
                var customerEmailSync = createCustomerEmailSync({
                    quote: quote,
                    persistEmail: persistEmailToCheckoutData
                });
                var shippingMethodSync = createShippingMethodSync({
                    quote: quote,
                    shippingService: shippingService,
                    selectShippingMethodAction: selectShippingMethodAction,
                    getMagewireComponent: getMagewireComponent,
                    getProperty: getProperty,
                    persistShippingMethod: persistShippingMethodToCheckoutData
                });
                var shippingErrorBridge = createShippingErrorBridge({
                    registry: registry
                });

                function translateFastcheckoutMessage(message) {
                    return paymentMessageBridge.translate(message);
                }

                function subscribePaymentMessageContainer(messageContainer) {
                    return paymentMessageBridge.subscribe(messageContainer);
                }

                function getBridgeMessageContainer() {
                    return paymentMessageBridge.getContainer();
                }

                function getCheckoutErrorsComponent() {
                    return paymentMessageBridge.getCheckoutErrorsComponent();
                }

                function clearPaymentMessages() {
                    paymentMessageBridge.clear();
                }

                function handlePaymentError(error, messageContainer) {
                    paymentMessageBridge.handleError(error, messageContainer);
                }

                subscribePaymentMessageContainer(globalMessageList);
                getCheckoutErrorsComponent();

                function syncEmailCompatibilityComponent(value, triggerChange) {
                    shippingCompatibilityBridge.syncEmailCompatibilityComponent(value, triggerChange);
                }

                shippingCompatibilityBridge.init();

                function runStandardShippingViewSelectMethod(shippingMethod) {
                    shippingCompatibilityBridge.runStandardShippingViewSelectMethod(shippingMethod);
                }

                function registerPaymentValidator(validator) {
                    paymentValidationRegistry.registerPaymentValidator(validator);
                }

                function registerPaymentDataAssigner(assigner) {
                    paymentValidationRegistry.registerPaymentDataAssigner(assigner);
                }

                function registerShippingValidator(validator) {
                    paymentValidationRegistry.registerShippingValidator(validator);
                }

                function loadOptionalValidationComponents() {
                    paymentValidationRegistry.loadOptionalValidationComponents();
                }

                function loadShippingRatesValidationComponents() {
                    paymentValidationRegistry.loadShippingRatesValidationComponents();
                }

                function loadPaymentValidationComponents() {
                    paymentValidationRegistry.loadPaymentValidationComponents();
                }

                function getDomPaymentMethods() {
                    return paymentDomBridge.getMethods();
                }

                function domHasPaymentMethod(methodCode) {
                    return paymentDomBridge.hasMethod(methodCode);
                }

                function getCheckedDomPaymentMethod() {
                    return paymentDomBridge.getCheckedMethod();
                }

                function hidePaymentPlaceholders() {
                    paymentDomBridge.hidePlaceholders();
                }

                function setQuoteGuestEmail(email) {
                    customerEmailSync.setGuestEmail(email);
                }

                function syncQuoteCustomerData() {
                    customerEmailSync.sync();
                }

                customerEmailSync.registerInputListener();

                function syncKoPaymentRenderers() {
                    syncQuoteCustomerData();
                    if (window.fastcheckoutHyvaPaymentList && typeof window.fastcheckoutHyvaPaymentList.syncRenderers === 'function') {
                        window.fastcheckoutHyvaPaymentList.syncRenderers();
                    }
                }

                function syncQuoteTotals(totalsData) {
                    return checkoutTotalsSync.sync(totalsData);
                }

                function syncQuoteTotalsFromConfig() {
                    return checkoutTotalsSync.syncFromConfig();
                }

                function syncQuoteTotalsFromDom() {
                    return checkoutTotalsSync.syncFromDom();
                }

                function refreshCheckoutStateFromMagewire() {
                    return checkoutStateBridge.refresh();
                }

                function resolveCheckoutStateRefresh(callbacks, deferred, messageContainer) {
                    return checkoutStateBridge.resolveRefresh(callbacks, deferred, messageContainer);
                }

                function refreshShippingRatesFromMagewire() {
                    return checkoutStateBridge.refreshShippingRates();
                }

                function syncPaymentMethods() {
                    return checkoutStateBridge.syncPaymentMethods();
                }

                syncPaymentMethods();
                syncQuoteTotalsFromConfig();
                syncQuoteTotalsFromDom();
                checkoutStateBridge.applyInitialShippingRates();
                loadShippingRatesValidationComponents();
                loadPaymentValidationComponents();

                registerCheckoutProviderAddressAttributeSync();

                app({
                    components: {
                        [scope]: {
                            component: 'uiComponent',
                            children: checkoutLayoutBridge.paymentRegionChildren
                        },
                        'fastcheckoutHyvaShippingRenderers': {
                            component: 'uiComponent',
                            children: {
                                shippingList: {
                                    component: 'Kkkonrad_Fastcheckout/js/hyva/shipping-list',
                                    displayArea: 'shipping-methods-list',
                                    children: checkoutLayoutBridge.shippingListChildren
                                }
                            }
                        },
                        'checkout': {
                            component: 'uiComponent',
                            children: {
                                steps: {
                                    component: 'uiComponent',
                                    children: $.extend(true, {}, checkoutLayoutBridge.checkoutStepChildren, {
                                        'shipping-step': {
                                            component: 'uiComponent',
                                            children: {
                                                shippingAddress: {
                                                    component: 'uiComponent',
                                                    children: checkoutLayoutBridge.shippingAddressChildren
                                                }
                                            }
                                        }
                                    })
                                }
                            }
                        }
                    }
                });

                [0, 50, 250, 750].forEach(function (delay) {
                    window.setTimeout(checkoutLayoutBridge.aliasStandardShippingRegistryPaths, delay);
                    window.setTimeout(registerCheckoutProviderAddressAttributeSync, delay);
                });

                function getProperty(wire, name) {
                    return magewireUtils.getProperty(wire, name);
                }

                function getEmailForQuote() {
                    return addressDataBuilder.getEmailForQuote();
                }


                function buildAddressData(magewire, prefix) {
                    return addressDataBuilder.buildAddressData(magewire, prefix);
                }

                function persistEmailToCheckoutData(email) {
                    checkoutDataPersistence.persistEmail(email);
                }

                function persistAddressToCheckoutData(addressData, type) {
                    checkoutDataPersistence.persistAddress(addressData, type);
                }

                function persistShippingMethodToCheckoutData(methodCode) {
                    checkoutDataPersistence.persistShippingMethod(methodCode);
                }

                function persistPaymentMethodToCheckoutData(methodCode) {
                    checkoutDataPersistence.persistPaymentMethod(methodCode);
                }

                function syncAddressDataToCheckoutProvider(addressData, type) {
                    checkoutProviderBridge.syncAddressData(addressData, type);
                }

                function getMagewireComponent() {
                    return magewireUtils.getComponent();
                }

                function getAddressValue(address, camelKey, snakeKey) {
                    return formDataCollector.getAddressValue(address, camelKey, snakeKey);
                }

                function normalizeAddressCustomAttributes(attributes) {
                    return formDataCollector.normalizeAddressCustomAttributes(attributes);
                }

                function normalizeAddressAttributeMap(attributes) {
                    return formDataCollector.normalizeAddressAttributeMap(attributes);
                }

                function getAddressAttributes(address, camelKey, snakeKey) {
                    return formDataCollector.getAddressAttributes(address, camelKey, snakeKey);
                }

                function collectFastcheckoutStructuredFields(roots, options) {
                    return formDataCollector.collectStructuredFields(roots, options);
                }

                function getFastcheckoutShippingFormRoots() {
                    return formDataCollector.getShippingFormRoots();
                }

                function normalizeKoAddressData(address) {
                    if (!address) {
                        return null;
                    }

                    return {
                        firstname: getAddressValue(address, 'firstname') || '',
                        lastname: getAddressValue(address, 'lastname') || '',
                        company: getAddressValue(address, 'company') || '',
                        street: getAddressValue(address, 'street') || [],
                        city: getAddressValue(address, 'city') || '',
                        postcode: getAddressValue(address, 'postcode') || '',
                        country_id: getAddressValue(address, 'countryId', 'country_id') || '',
                        countryId: getAddressValue(address, 'countryId', 'country_id') || '',
                        region: getAddressValue(address, 'region') || '',
                        region_id: getAddressValue(address, 'regionId', 'region_id') || null,
                        regionId: getAddressValue(address, 'regionId', 'region_id') || null,
                        telephone: getAddressValue(address, 'telephone') || '',
                        prefix: getAddressValue(address, 'prefix') || '',
                        middlename: getAddressValue(address, 'middlename') || '',
                        suffix: getAddressValue(address, 'suffix') || '',
                        fax: getAddressValue(address, 'fax') || '',
                        vat_id: getAddressValue(address, 'vatId', 'vat_id') || '',
                        vatId: getAddressValue(address, 'vatId', 'vat_id') || '',
                        custom_attributes: normalizeAddressCustomAttributes(getAddressAttributes(address, 'customAttributes', 'custom_attributes')),
                        customAttributes: normalizeAddressCustomAttributes(getAddressAttributes(address, 'customAttributes', 'custom_attributes')),
                        extension_attributes: getAddressAttributes(address, 'extensionAttributes', 'extension_attributes'),
                        extensionAttributes: getAddressAttributes(address, 'extensionAttributes', 'extension_attributes')
                    };
                }

                function getCurrentShippingAddressData(address) {
                    var normalized = normalizeKoAddressData(address);

                    if (normalized) {
                        return normalized;
                    }

                    if (quote && typeof quote.shippingAddress === 'function' && quote.shippingAddress()) {
                        normalized = normalizeKoAddressData(quote.shippingAddress());
                        if (normalized) {
                            return normalized;
                        }
                    }

                    return buildAddressData(getMagewireComponent(), 'shipping');
                }

                function validateShippingRatesAddress(address, showMessage) {
                    var addressData;

                    if (
                        !shippingRatesValidator ||
                        typeof shippingRatesValidator.validateAddressData !== 'function'
                    ) {
                        return true;
                    }

                    addressData = getCurrentShippingAddressData(address);
                    if (shippingRatesValidator.validateAddressData(addressData)) {
                        return true;
                    }

                    if (showMessage) {
                        document.dispatchEvent(new CustomEvent('fastcheckout:shipping-error', {
                            detail: {
                                message: $t('Please check the shipping address and try again.')
                            }
                        }));
                    }

                    return false;
                }

                function setMagewireValue(wire, field, value, deferUpdate) {
                    return magewireUtils.setValue(wire, field, value, deferUpdate);
                }

                function writeKoAddressToMagewire(address, isBilling, deferUpdates) {
                    var wire = getMagewireComponent(),
                        prefix = isBilling ? 'billing' : '',
                        operations = [],
                        street,
                        customAttributes,
                        extensionAttributes,
                        fields;

                    if (!wire || !address) {
                        return Promise.resolve(false);
                    }

                    fields = [
                        ['countryId', 'country_id', prefix ? 'billingCountryId' : 'countryId'],
                        ['postcode', null, prefix ? 'billingPostcode' : 'postcode'],
                        ['city', null, prefix ? 'billingCity' : 'city'],
                        ['region', null, prefix ? 'billingRegion' : 'region'],
                        ['regionId', 'region_id', prefix ? 'billingRegionId' : 'regionId'],
                        ['firstname', null, prefix ? 'billingFirstname' : 'firstname'],
                        ['lastname', null, prefix ? 'billingLastname' : 'lastname'],
                        ['telephone', null, prefix ? 'billingTelephone' : 'telephone'],
                        ['company', null, prefix ? 'billingCompany' : 'company'],
                        ['prefix', null, prefix ? 'billingPrefix' : 'prefix'],
                        ['middlename', null, prefix ? 'billingMiddlename' : 'middlename'],
                        ['suffix', null, prefix ? 'billingSuffix' : 'suffix'],
                        ['fax', null, prefix ? 'billingFax' : 'fax'],
                        ['vatId', 'vat_id', prefix ? 'billingVatId' : 'vatId']
                    ];

                    fields.forEach(function (field) {
                        var operation = setMagewireValue(
                            wire,
                            field[2],
                            getAddressValue(address, field[0], field[1]),
                            deferUpdates === true
                        );
                        if (operation && typeof operation.then === 'function') {
                            operations.push(operation);
                        }
                    });

                    street = getAddressValue(address, 'street');
                    if (Array.isArray(street)) {
                        [
                            [prefix ? 'billingStreet1' : 'street1', street[0]],
                            [prefix ? 'billingStreet2' : 'street2', street[1]],
                            [prefix ? 'billingStreet3' : 'street3', street[2]],
                            [prefix ? 'billingStreet4' : 'street4', street[3]]
                        ].forEach(function (line) {
                            var operation = setMagewireValue(wire, line[0], line[1], deferUpdates === true);
                            if (operation && typeof operation.then === 'function') {
                                operations.push(operation);
                            }
                        });
                    }

                    customAttributes = normalizeAddressAttributeMap(getAddressAttributes(address, 'customAttributes', 'custom_attributes'));
                    extensionAttributes = getAddressAttributes(address, 'extensionAttributes', 'extension_attributes');

                    [
                        [prefix ? 'billingCustomAttributes' : 'shippingCustomAttributes', customAttributes],
                        [prefix ? 'billingExtensionAttributes' : 'shippingExtensionAttributes', extensionAttributes]
                    ].forEach(function (attributeData) {
                        var operation = setMagewireValue(wire, attributeData[0], attributeData[1], deferUpdates === true);
                        if (operation && typeof operation.then === 'function') {
                            operations.push(operation);
                        }
                    });

                    return operations.length ? Promise.all(operations).then(function () { return true; }) : Promise.resolve(false);
                }

                function syncDomShippingAttributesToMagewire(wire, deferUpdates) {
                    return shippingAttributesSync.sync(wire, deferUpdates);
                }

                function registerKoStateAdapter() {
                    var isSyncingFromKo = false;

                    if (!quote || window.fastcheckoutKoStateAdapterRegistered) {
                        return;
                    }

                    window.fastcheckoutKoStateAdapterRegistered = true;

                    function syncKoAddressToMagewire(address, isBilling) {
                        if (isSyncingFromKo || !address) {
                            return;
                        }

                        isSyncingFromKo = true;
                        writeKoAddressToMagewire(address, isBilling)
                            .catch(function (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Fastcheckout: Sync address to Magewire failed', e);
                                }
                            })
                            .then(function () {
                                isSyncingFromKo = false;
                            });
                    }

                    if (typeof quote.shippingAddress === 'function') {
                        quote.shippingAddress.subscribe(function (address) {
                            syncKoAddressToMagewire(address, false);
                        });
                    }

                    if (typeof quote.billingAddress === 'function') {
                        quote.billingAddress.subscribe(function (address) {
                            syncKoAddressToMagewire(address, true);
                        });
                    }

                    if (typeof quote.paymentMethod === 'function') {
                        quote.paymentMethod.subscribe(function (method) {
                            var wire,
                                methodCode;

                            if (isSyncingFromKo || paymentMethodSync.isApplyingFromBridge() || !method) {
                                return;
                            }

                            wire = getMagewireComponent();
                            methodCode = method.method;
                            if (wire && methodCode && getProperty(wire, 'paymentMethod') !== methodCode) {
                                isSyncingFromKo = true;
                                Promise.resolve(wire.set('paymentMethod', methodCode))
                                    .then(function () {
                                        isSyncingFromKo = false;
                                    })
                                    .catch(function () {
                                        isSyncingFromKo = false;
                                    });
                            }
                        });
                    }
                }

                function registerKoFieldSyncBridge() {
                    window.fastcheckoutHyvaPayment = window.fastcheckoutHyvaPayment || {};
                    window.fastcheckoutHyvaPayment.syncFieldToKo = function (field, value) {
                        var shipping,
                            billing,
                            mapping,
                            billingMapping,
                            koField,
                            koFieldBilling,
                            street,
                            billingStreet,
                            currentPayment;

                        if (!quote) {
                            return;
                        }

                        shipping = typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
                        billing = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

                        if (field === 'email') {
                            setQuoteGuestEmail(value);
                            syncEmailCompatibilityComponent(value, false);
                        }

                        if (field === 'paymentMethod' && typeof quote.paymentMethod === 'function') {
                            currentPayment = quote.paymentMethod();
                            if (!currentPayment || currentPayment.method !== value) {
                                setQuotePaymentMethodFromBridge(value ? { method: value } : null);
                            }
                        }

                        mapping = {
                            'countryId': 'countryId',
                            'postcode': 'postcode',
                            'city': 'city',
                            'region': 'region',
                            'regionId': 'regionId',
                            'firstname': 'firstname',
                            'lastname': 'lastname',
                            'telephone': 'telephone',
                            'company': 'company'
                        };

                        if (shipping && mapping[field]) {
                            koField = mapping[field];
                            if (shipping[koField] !== value) {
                                shipping[koField] = value;
                                quote.shippingAddress.valueHasMutated();
                            }
                        }

                        billingMapping = {
                            'billingCountryId': 'countryId',
                            'billingPostcode': 'postcode',
                            'billingCity': 'city',
                            'billingRegion': 'region',
                            'billingRegionId': 'regionId',
                            'billingFirstname': 'firstname',
                            'billingLastname': 'lastname',
                            'billingTelephone': 'telephone',
                            'billingCompany': 'company'
                        };

                        if (billing && billingMapping[field]) {
                            koFieldBilling = billingMapping[field];
                            if (billing[koFieldBilling] !== value) {
                                billing[koFieldBilling] = value;
                                quote.billingAddress.valueHasMutated();
                            }
                        }

                        if (shipping && (field === 'street1' || field === 'street2')) {
                            street = shipping.street || [];
                            if (field === 'street1') {
                                street[0] = value;
                            }
                            if (field === 'street2') {
                                street[1] = value;
                            }
                            shipping.street = street;
                            quote.shippingAddress.valueHasMutated();
                        }

                        if (billing && (field === 'billingStreet1' || field === 'billingStreet2')) {
                            billingStreet = billing.street || [];
                            if (field === 'billingStreet1') {
                                billingStreet[0] = value;
                            }
                            if (field === 'billingStreet2') {
                                billingStreet[1] = value;
                            }
                            billing.street = billingStreet;
                            quote.billingAddress.valueHasMutated();
                        }
                    };
                }

                function registerCheckoutDataBufferBridge() {
                    var pending = window.fastcheckoutPendingCheckoutData || {
                        shippingAddress: null,
                        billingAddress: null,
                        selectedShippingRate: null,
                        selectedPaymentMethod: null,
                        email: null,
                        changed: false
                    };

                    if (window.fastcheckoutCheckoutDataBufferRegistered) {
                        return;
                    }

                    window.fastcheckoutPendingCheckoutData = pending;
                    window.fastcheckoutCheckoutDataBufferRegistered = true;
                    window.fastcheckoutCheckoutDataBufferReady = false;

                    window.fastcheckoutApplyPendingCheckoutData = function (wire) {
                        var shippingAddress,
                            billingAddress,
                            operations = [];

                        if (!wire || !pending.changed) {
                            return Promise.resolve(false);
                        }

                        if (pending.email) {
                            setQuoteGuestEmail(pending.email);
                            syncEmailCompatibilityComponent(pending.email, false);
                            operations.push(setMagewireValue(wire, 'email', pending.email, false));
                        }

                        if (pending.shippingAddress) {
                            shippingAddress = addressConverter.formAddressDataToQuoteAddress(pending.shippingAddress);
                            syncAddressDataToCheckoutProvider(normalizeKoAddressData(shippingAddress), 'shipping');
                            operations.push(writeKoAddressToMagewire(shippingAddress, false, false));
                        }

                        if (pending.billingAddress) {
                            billingAddress = addressConverter.formAddressDataToQuoteAddress(pending.billingAddress);
                            syncAddressDataToCheckoutProvider(normalizeKoAddressData(billingAddress), 'billing');
                            operations.push(writeKoAddressToMagewire(billingAddress, true, false));
                        }

                        return Promise.all(operations.filter(Boolean)).then(function () {
                            if (!pending.selectedShippingRate) {
                                return true;
                            }

                            if (typeof wire.call === 'function') {
                                return wire.call('selectShippingMethod', pending.selectedShippingRate);
                            }

                            return setMagewireValue(wire, 'shippingMethod', pending.selectedShippingRate, false);
                        }).then(function () {
                            if (!pending.selectedPaymentMethod) {
                                return true;
                            }

                            if (typeof wire.call === 'function') {
                                return wire.call('selectPaymentMethod', pending.selectedPaymentMethod);
                            }

                            setQuotePaymentMethodFromBridge({ method: pending.selectedPaymentMethod });
                            return setMagewireValue(wire, 'paymentMethod', pending.selectedPaymentMethod, false);
                        }).then(function () {
                            pending.shippingAddress = null;
                            pending.billingAddress = null;
                            pending.selectedShippingRate = null;
                            pending.selectedPaymentMethod = null;
                            pending.email = null;
                            pending.changed = false;

                            return true;
                        });
                    };

                    window.addEventListener('fastcheckout:checkout-data-set', function (event) {
                        var detail = event.detail || {};

                        if (window.fastcheckoutSuppressCheckoutDataBridge || !detail.method) {
                            return;
                        }

                        switch (detail.method) {
                            case 'setShippingAddressFromData':
                            case 'setNewCustomerShippingAddress':
                                pending.shippingAddress = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setBillingAddressFromData':
                            case 'setNewCustomerBillingAddress':
                                pending.billingAddress = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setSelectedShippingRate':
                                pending.selectedShippingRate = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setSelectedPaymentMethod':
                                pending.selectedPaymentMethod = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setValidatedEmailValue':
                            case 'setInputFieldEmailValue':
                            case 'setCheckedEmailValue':
                                pending.email = detail.value || null;
                                pending.changed = true;
                                break;
                        }
                    });

                    pending.shippingAddress = null;
                    pending.billingAddress = null;
                    pending.selectedShippingRate = null;
                    pending.selectedPaymentMethod = null;
                    pending.email = null;
                    pending.changed = false;
                    window.fastcheckoutCheckoutDataBufferReady = true;
                }

                registerKoStateAdapter();
                registerKoFieldSyncBridge();
                registerCheckoutDataBufferBridge();

                function syncCheckoutStateWithoutServer(magewire) {
                    var shippingAddress;

                    syncQuoteCustomerData();

                    if (!magewire) {
                        return;
                    }

                    shippingAddress = syncAddressToKnockout(magewire);
                    syncBillingAddressToKnockout(magewire, shippingAddress);
                    syncSelectedShippingMethodToKnockout(getProperty(magewire, 'shippingMethod'));
                }

                function resolveAsKoDeferred(promise, messageContainer) {
                    return magewireUtils.resolveAsKoDeferred(
                        promise,
                        messageContainer,
                        function (error, container) {
                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                            handlePaymentError(error, container || getBridgeMessageContainer());
                        },
                        function () {
                            if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                                fullScreenLoader.stopLoader(true);
                            }
                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                        }
                    );
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
                    syncAddressDataToCheckoutProvider(addressData, 'shipping');

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
                        var shippingAddressData = buildAddressData(magewire, '');
                        persistAddressToCheckoutData(shippingAddressData, 'billing');
                        syncAddressDataToCheckoutProvider(shippingAddressData, 'billing');
                        if (shippingAddress) {
                            selectBillingAddressAction(shippingAddress);
                        }
                        return quote.billingAddress();
                    }

                    var addressData = buildAddressData(magewire, 'billing');
                    persistAddressToCheckoutData(addressData, 'billing');
                    syncAddressDataToCheckoutProvider(addressData, 'billing');

                    newAddress = addressConverter.formAddressDataToQuoteAddress(addressData);
                    currentAddress = quote.billingAddress();
                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectBillingAddressAction(newAddress);
                    }

                    return quote.billingAddress() || newAddress;
                }

                function syncSelectedShippingMethodToKnockout(methodCode) {
                    shippingMethodSync.syncSelectedToKnockout(methodCode);
                }

                function getShippingMethodCode(shippingMethod) {
                    return shippingMethodSync.getCode(shippingMethod);
                }

                function splitShippingMethodCode(methodCode) {
                    return shippingMethodSync.splitCode(methodCode);
                }

                function syncShippingMethodToMagewireNow(methodCode) {
                    return shippingMethodSync.syncToMagewireNow(methodCode);
                }

                function syncShippingMethodToMagewire(methodCode) {
                    shippingMethodSync.syncToMagewire(methodCode);
                }

                function resolveShippingInformationAction(originalAction) {
                    var wire = getMagewireComponent(),
                        selectedMethod = quote && typeof quote.shippingMethod === 'function' ? quote.shippingMethod() : null,
                        methodCode = getShippingMethodCode(selectedMethod),
                        deferred = $.Deferred();

                    if (!wire || typeof wire.call !== 'function') {
                        return originalAction();
                    }

                    if (!methodCode) {
                        return originalAction();
                    }

                    syncShippingMethodToMagewireNow(methodCode)
                        .then(function () {
                            return originalAction();
                        })
                        .then(function (response) {
                            deferred.resolve(response);
                        })
                        .catch(function (error) {
                            handlePaymentError(error, getBridgeMessageContainer());
                            deferred.reject(error);
                        });

                    return deferred.promise();
                }

                function resolveShippingRatesEstimate(address) {
                    var wire = getMagewireComponent();

                    if (!validateShippingRatesAddress(address, false)) {
                        if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                            shippingService.isLoading(false);
                        }
                        if (shippingService && typeof shippingService.setShippingRates === 'function') {
                            shippingService.setShippingRates([]);
                        }

                        return Promise.resolve([]);
                    }

                    return writeKoAddressToMagewire(address, false)
                        .then(function (changed) {
                            if (changed) {
                                if (wire && typeof wire.call === 'function') {
                                    return wire.call('saveShippingAddress', true, true, true)
                                        .then(function () {
                                            return refreshCheckoutStateFromMagewire();
                                        })
                                        .then(function (payload) {
                                            payload = payload && typeof payload === 'object' ? payload : {};
                                            return Array.isArray(payload.shipping_rates) ? payload.shipping_rates : [];
                                        });
                                }
                            }
                            return shippingService.getShippingRates()();
                        });
                }

                function getPaymentMethodCode(paymentMethod) {
                    return paymentMethodSync.getCode(paymentMethod);
                }

                function getQuotePaymentMethodCode() {
                    return paymentMethodSync.getQuoteCode();
                }

                function setQuotePaymentMethodFromBridge(paymentMethod) {
                    paymentMethodSync.setQuoteFromBridge(paymentMethod);
                }

                function syncPaymentMethodToMagewire(paymentMethod) {
                    paymentMethodSync.syncToMagewire(paymentMethod);
                }

                function prepareCheckoutState(magewire) {
                    syncQuoteCustomerData();

                    return Promise.resolve(
                        magewire && typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                            ? window.fastcheckoutApplyPendingCheckoutData(magewire)
                            : true
                    ).then(function () {
                        var shippingAddress = syncAddressToKnockout(magewire);
                        syncBillingAddressToKnockout(magewire, shippingAddress);

                        return syncDomShippingAttributesToMagewire(magewire, true).then(function () {
                            if (magewire) {
                                syncSelectedShippingMethodToKnockout(getProperty(magewire, 'shippingMethod'));
                            }

                            if (quote.isVirtual && quote.isVirtual()) {
                                return true;
                            }

                            if (!quote.shippingAddress() || !quote.shippingMethod()) {
                                return true;
                            }

                            syncPaymentMethods();
                            return true;
                        });
                    });
                }

                function clearShippingFieldError() {
                    shippingErrorBridge.clear();
                }

                function showShippingFieldError(methodCode, carrierCode, errorMessage) {
                    shippingErrorBridge.show(methodCode, carrierCode, errorMessage);
                }

                window.fastcheckoutHyvaShipping = {
                    syncAddress: syncAddressToKnockout,
                    syncShippingMethod: syncSelectedShippingMethodToKnockout,
                    syncShippingMethodToMagewire: syncShippingMethodToMagewire,
                    syncShippingMethodToMagewireNow: syncShippingMethodToMagewireNow,
                    getShippingInformationComponent: function () {
                        return shippingCompatibilityBridge.getShippingInformationComponent();
                    },
                    onSelectShippingAddressAction: function (shippingAddress) {
                        var addressData = normalizeKoAddressData(shippingAddress),
                            currentShippingAddress;

                        persistAddressToCheckoutData(addressData, 'shipping');
                        syncAddressDataToCheckoutProvider(addressData, 'shipping');
                        syncCheckoutProviderAddressAttributes();
                        currentShippingAddress = quote && typeof quote.shippingAddress === 'function'
                            ? quote.shippingAddress()
                            : null;

                        return writeKoAddressToMagewire(currentShippingAddress || shippingAddress, false);
                    },
                    onSelectBillingAddressAction: function (billingAddress) {
                        var addressData = normalizeKoAddressData(billingAddress),
                            currentBillingAddress;

                        persistAddressToCheckoutData(addressData, 'billing');
                        syncAddressDataToCheckoutProvider(addressData, 'billing');
                        syncCheckoutProviderAddressAttributes();
                        currentBillingAddress = quote && typeof quote.billingAddress === 'function'
                            ? quote.billingAddress()
                            : null;

                        return writeKoAddressToMagewire(currentBillingAddress || billingAddress, true);
                    },
                    onSelectShippingMethodAction: function (shippingMethod) {
                        syncShippingMethodToMagewire(getShippingMethodCode(shippingMethod));
                        runStandardShippingViewSelectMethod(shippingMethod);
                    },
                    onSetShippingInformationAction: function (originalAction) {
                        return resolveShippingInformationAction(originalAction);
                    },
                    onEstimateShippingRatesAction: function (address) {
                        return resolveShippingRatesEstimate(address);
                    },
                    syncDomAttributes: function (wire) {
                        return syncDomShippingAttributesToMagewire(wire || getMagewireComponent(), true);
                    },
                    registerValidator: registerShippingValidator,
                    onRecollectShippingRatesAction: function (originalAction) {
                        if (!getMagewireComponent()) {
                            return originalAction();
                        }

                        return refreshShippingRatesFromMagewire();
                    },
                    setError: function (methodCode, message) {
                        showShippingFieldError(methodCode, '', message);
                    },
                    clearError: clearShippingFieldError,
                    validate: function () {
                        try {
                            clearShippingFieldError();
                            syncDomShippingAttributesToMagewire(getMagewireComponent(), true);
                            var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked');
                            var activeMethod = quote.shippingMethod();

                            var carrierCode = '';
                            var methodCode = '';

                            if (checkedDomRadio && checkedDomRadio.value) {
                                var parsedMethod = splitShippingMethodCode(checkedDomRadio.value);
                                carrierCode = parsedMethod.carrier_code;
                                methodCode = parsedMethod.method_code;
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

                        if (!validateShippingRatesAddress(null, true)) {
                            return false;
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

                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(true);
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

                    if (quoteMethod && domMethod && paymentMethodCodesEqual(domMethod, quoteMethod)) {
                        return quoteMethod;
                    }

                    if (domMethod) {
                        return domMethod;
                    }

                    return domHasPaymentMethod(quoteMethod) ? quoteMethod : '';
                }

                function getMethod(methodCode) {
                    return methodList().filter(function (method) {
                        return paymentMethodCodesEqual(method.method, methodCode) ||
                            paymentMethodCodesEqual(methodCode, method.method);
                    })[0] || null;
                }

                function paymentMethodCodesEqual(candidateCode, selectedCode) {
                    candidateCode = candidateCode ? String(candidateCode) : '';
                    selectedCode = selectedCode ? String(selectedCode) : '';

                    return candidateCode !== '' && candidateCode === selectedCode;
                }

                function getRendererByMethod(methodCode) {
                    var found = null;

                    registry.get(function (component) {
                        var rendererCode;

                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        rendererCode = typeof component.getCode === 'function' ? component.getCode() : '';

                        if (
                            paymentMethodCodesEqual(component.item.method, methodCode) ||
                            paymentMethodCodesEqual(rendererCode, methodCode)
                        ) {
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
                    component.selectPaymentMethod = function (selectedMethodCode) {
                        syncQuoteCustomerData();
                        var paymentData = typeof component.getData === 'function'
                            ? component.getData()
                            : { method: component.item ? component.item.method : null },
                            rendererCode = getRendererCode(component, paymentData.method),
                            selectedCode = selectedMethodCode || rendererCode;

                        if (paymentData && paymentData.method && selectedCode) {
                            paymentData = clonePaymentPayload(paymentData);
                            paymentData.method = selectedCode;
                            selectPaymentMethodAction(paymentData);
                            persistPaymentMethodToCheckoutData(selectedCode);
                            quote.paymentMethod({
                                method: selectedCode,
                                title: component.item ? component.item.title : null
                            });
                        }

                    };
                }

                function patchRenderers() {
                    registry.get(function (component) {
                        if (component && component.item && component.item.method) {
                            patchRenderer(component);
                        }
                    });
                }

                rendererManager.setPatchRenderersHandler(patchRenderers);
                rendererManager.setSyncPaymentRenderersHandler(syncKoPaymentRenderers);

                function elementMatchesMethod(element, methodCode, activeCode) {
                    var inputs = element.querySelectorAll('input'),
                        matches = false;

                    if (
                        paymentMethodCodesEqual(element.id, methodCode) ||
                        paymentMethodCodesEqual(element.id, activeCode)
                    ) {
                        return true;
                    }

                    inputs.forEach(function (input) {
                        if (matches) {
                            return;
                        }

                        matches = paymentMethodCodesEqual(input.id, methodCode) ||
                            paymentMethodCodesEqual(input.id, activeCode) ||
                            paymentMethodCodesEqual(input.value, methodCode) ||
                            paymentMethodCodesEqual(input.value, activeCode) ||
                            paymentMethodCodesEqual(input.getAttribute('value'), methodCode) ||
                            paymentMethodCodesEqual(input.getAttribute('value'), activeCode);
                    });

                    return matches;
                }

                function getKoClickHandlerName(element) {
                    var binding = element && element.getAttribute ? (element.getAttribute('data-bind') || element.getAttribute('ko')) : '',
                        match;

                    if (!binding) {
                        return '';
                    }

                    match = binding.match(/(?:^|[,{\s])click\s*:\s*(?:\$parent\.|\$data\.|this\.)?([A-Za-z_$][\w$]*)/);
                    return match ? match[1] : '';
                }

                function getNativeCheckoutActionButtons(root) {
                    if (!root || typeof root.querySelectorAll !== 'function') {
                        return [];
                    }

                    return Array.prototype.slice.call(root.querySelectorAll(
                        '.actions-toolbar button.action.primary.checkout, ' +
                        '.actions-toolbar .action.primary.checkout, ' +
                        'button.action.primary.checkout, ' +
                        '.apple-pay-button.action.primary.checkout'
                    ));
                }

                function annotateNativePaymentActions(root) {
                    if (!root || typeof root.querySelectorAll !== 'function') {
                        return;
                    }

                    Array.prototype.slice.call(root.querySelectorAll('.fastcheckout-native-place-order-hidden')).forEach(function (button) {
                        button.classList.remove('fastcheckout-native-place-order-hidden');
                    });
                    Array.prototype.slice.call(root.querySelectorAll('.fastcheckout-actions-toolbar-hidden')).forEach(function (toolbar) {
                        toolbar.classList.remove('fastcheckout-actions-toolbar-hidden');
                    });

                    Array.prototype.slice.call(root.querySelectorAll('.actions-toolbar')).forEach(function (toolbar) {
                        var actionButtons = getNativeCheckoutActionButtons(toolbar),
                            visibleActionButtons;

                        actionButtons.forEach(function (button) {
                            var handlerName = getKoClickHandlerName(button);

                            if (!handlerName || handlerName === 'placeOrder') {
                                button.classList.add('fastcheckout-native-place-order-hidden');
                            }
                        });

                        visibleActionButtons = actionButtons.filter(function (button) {
                            return !button.classList.contains('fastcheckout-native-place-order-hidden');
                        });

                        if (actionButtons.length && !visibleActionButtons.length) {
                            toolbar.classList.add('fastcheckout-actions-toolbar-hidden');
                        }
                    });
                }

                function getRendererNativeSubmitAction(component) {
                    var roots = getActivePaymentFormRoots(),
                        action = null;

                    if (!component) {
                        return null;
                    }

                    roots.some(function (root) {
                        return getNativeCheckoutActionButtons(root).some(function (button) {
                            var handlerName = getKoClickHandlerName(button);

                            if (
                                handlerName &&
                                handlerName !== 'placeOrder' &&
                                typeof component[handlerName] === 'function'
                            ) {
                                action = {
                                    name: handlerName,
                                    button: button,
                                    run: component[handlerName].bind(component)
                                };
                                return true;
                            }

                            return false;
                        });
                    });

                    return action;
                }

                function hasVisibleContent(element) {
                    var content = element.querySelector('.payment-method-content');
                    if (!content) {
                        return false;
                    }

                    annotateNativePaymentActions(content);

                    // 1. Check if there are any input, select, textarea, or native custom action elements
                    if (content.querySelector('input:not([type="hidden"]), select, textarea, .actions-toolbar:not(.fastcheckout-actions-toolbar-hidden) button:not(.fastcheckout-native-place-order-hidden)')) {
                        return true;
                    }

                    // 2. Clone the content to inspect remaining elements/text
                    var clone = content.cloneNode(true);

                    // Remove components we explicitly hide or handle globally
                    var selectorsToRemove = [
                        '.payment-method-title',
                        '.fastcheckout-actions-toolbar-hidden',
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
                        annotateNativePaymentActions(activeElement);

                        var target = document.querySelector('[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]');
                        if (target) {
                            var shadow = target.shadowRoot;
                            if (!shadow) {
                                shadow = target.attachShadow({ mode: 'open' });
                                
                                // Clone ALL page stylesheets (including main Tailwind stylesheet)
                                document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
                                    shadow.appendChild(link.cloneNode(true));
                                });

                                var style = document.createElement('style');
                                style.textContent = `
                                    .payment-method {
                                        display: block !important;
                                        border: none !important;
                                        background: transparent !important;
                                        margin-top: 0 !important;
                                        padding: 0 !important;
                                    }
                                    .payment-method-title,
                                    .payment-method-billing-address,
                                    .fastcheckout-payment-method-ko-container .payment-method-title,
                                    .fastcheckout-payment-method-ko-container .payment-method-billing-address,
                                    .fastcheckout-native-place-order-hidden,
                                    .fastcheckout-actions-toolbar-hidden {
                                        display: none !important;
                                    }
                                    .required-captcha.checkbox {
                                        position: absolute !important;
                                        display: block !important;
                                        visibility: visible !important;
                                        overflow: hidden !important;
                                        opacity: 0 !important;
                                        width: 1px !important;
                                        height: 1px !important;
                                        padding: 0 !important;
                                        border: none !important;
                                    }
                                    .recaptcha-checkout-place-order .field {
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        height: 0 !important;
                                        overflow: hidden !important;
                                    }
                                    .tpay-groups-wrapper .tpay-group-logo-holder img {
                                        max-width: 100% !important;
                                    }
                                `;
                                shadow.appendChild(style);
                            }

                            var existingWrapper = shadow.querySelector('.fastcheckout-payment-method-ko-container');
                            if (existingWrapper && activeElement.parentNode === existingWrapper) {
                                existingWrapper.classList.remove('hidden');
                                existingWrapper.style.display = '';
                                target.classList.remove('hidden');
                                target.style.display = 'block';
                                movedToTarget = true;
                            } else {
                                shadow.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (w) {
                                    w.remove();
                                });

                                // Wrap activeElement in a container with class fastcheckout-payment-method-ko-container
                                // to ensure that CSS selectors starting with .fastcheckout-payment-method-ko-container will match perfectly!
                                var wrapper = document.createElement('div');
                                wrapper.className = 'fastcheckout-payment-method-ko-container';
                                wrapper.appendChild(activeElement);

                                shadow.appendChild(wrapper);
                                target.classList.remove('hidden');
                                target.style.display = 'block';
                                movedToTarget = true;
                            }
                        } else {
                            
                        }
                    } else {
                        
                    }

                    return movedToTarget;
                }

                function applySelectedMethod(methodCode) {
                    
                    var method,
                        renderer,
                        component,
                        activeCode,
                        activeMethod;

                    if (!methodCode) {
                        return false;
                    }

                    component = getRendererComponentForMethod(methodCode);
                    if (component && !rendererManager.isLoaded(component)) {
                        loadRendererForMethod(methodCode).done(function () {
                            if (getSelectedMethodCode() === methodCode || pendingSelectedMethodCode === methodCode) {
                                retryPendingSelectedMethod();
                            }
                        });
                    }

                    method = getMethod(methodCode) || { method: methodCode };
                    runPatchRenderers();
                    renderer = getRendererByMethod(methodCode);
                    patchRenderer(renderer);
                    activeCode = getRendererCode(renderer, methodCode);
                    
                    activeMethod = getMethod(activeCode) || { method: activeCode, title: method.title };
                    if (renderer && typeof renderer.selectPaymentMethod === 'function') {
                        renderer.selectPaymentMethod(methodCode);
                    } else {
                        selectPaymentMethodAction(activeMethod);
                        persistPaymentMethodToCheckoutData(activeCode);
                    }
                    return updateActiveRendererClass(methodCode, activeCode);
                }

                var readyDispatched = false;
                var pendingSelectedMethodCode = '';
                var paymentRendererObserver = null;
                var paymentRendererObserverRetryTimer = null;
                var lastSetSelectedMethodCode = '';
                var lastSetSelectedMethodAt = 0;

                function dispatchReadyEvent() {
                    if (readyDispatched) { return; }
                    readyDispatched = true;
                    document.dispatchEvent(new CustomEvent('fastcheckout:ready'));
                }

                function retryPendingSelectedMethod() {
                    if (!pendingSelectedMethodCode || !domHasPaymentMethod(pendingSelectedMethodCode)) {
                        return;
                    }

                    runPatchRenderers();
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
                        }, 50);
                    });
                    paymentRendererObserver.observe(root, {
                        childList: true,
                        subtree: true
                    });
                }

                function setSelectedMethod(methodCode) {
                    if (methodCode && methodCode === lastSetSelectedMethodCode && Date.now() - lastSetSelectedMethodAt < 250) {
                        return;
                    }
                    lastSetSelectedMethodCode = methodCode || '';
                    lastSetSelectedMethodAt = Date.now();
                    syncPaymentMethods();

                    if (!methodCode) {
                        pendingSelectedMethodCode = '';
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        return;
                    }

                    if (paymentMethodSync.isSynced(methodCode)) {
                        pendingSelectedMethodCode = '';
                        runPatchRenderers();
                        updateActiveRendererClass(methodCode, methodCode);
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
                            (paymentMethodCodesEqual(component.item.method, selectedMethod) ||
                                (typeof component.getCode === 'function' && paymentMethodCodesEqual(component.getCode(), selectedMethod)))
                        ) {
                            found = component;
                        }
                    });

                    return found;
                }

                function getActivePaymentFormRoots() {
                    var roots = [],
                        selectedMethod = getSelectedMethodCode(),
                        activeElements;

                    function addRoot(root) {
                        if (root && roots.indexOf(root) === -1) {
                            roots.push(root);
                        }
                    }

                    activeElements = Array.prototype.slice.call(document.querySelectorAll(
                        '.payment-method._active, [data-fastcheckout-active="true"]'
                    ));
                    activeElements.forEach(addRoot);

                    Array.prototype.slice.call(document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]')).forEach(function (target) {
                        var shadow = target.shadowRoot,
                            targetMethod = target.getAttribute('data-fastcheckout-payment-method-ko-target');

                        if (!shadow) {
                            return;
                        }

                        Array.prototype.slice.call(shadow.querySelectorAll(
                            '.payment-method._active, [data-fastcheckout-active="true"], .fastcheckout-payment-method-ko-container:not(.hidden)'
                        )).forEach(addRoot);

                        if (selectedMethod && targetMethod === selectedMethod) {
                            addRoot(shadow);
                        }
                    });

                    return roots;
                }

                function refreshNativePaymentActions() {
                    annotateNativePaymentActions(document);
                    getActivePaymentFormRoots().forEach(function (root) {
                        annotateNativePaymentActions(root);
                    });
                }

                function getActiveNativeSubmitActionName() {
                    var action = getRendererNativeSubmitAction(getActiveRenderer());

                    return action ? action.name : '';
                }

                function mergeActivePaymentFormData(paymentData) {
                    var collected = collectFastcheckoutStructuredFields(getActivePaymentFormRoots(), { mode: 'payment' }),
                        additionalData = collected.additionalData || {},
                        extensionAttributes = collected.extensionAttributes || {};

                    paymentData = paymentData || { method: getSelectedMethodCode() };

                    if (Object.keys(additionalData).length) {
                        paymentData.additional_data = $.extend(true, {}, paymentData.additional_data || {}, additionalData);
                    }

                    if (Object.keys(extensionAttributes).length) {
                        paymentData.extension_attributes = $.extend(true, {}, paymentData.extension_attributes || {}, extensionAttributes);
                    }

                    if (collected.topLevel && collected.topLevel.po_number && !paymentData.po_number) {
                        paymentData.po_number = collected.topLevel.po_number;
                    }

                    return paymentData;
                }

                function getScopedPurchaseOrderInput() {
                    var roots = getActivePaymentFormRoots(),
                        input = null;

                    roots.some(function (root) {
                        input = root.querySelector('input[name="payment[po_number]"], #po_number');
                        return !!input;
                    });

                    return input || document.querySelector('.payment-method._active input[name="payment[po_number]"], .payment-method._active #po_number');
                }

                function getFieldValidationErrorElement(input) {
                    var root,
                        describedBy,
                        errorElement;

                    if (!input) {
                        return null;
                    }

                    root = typeof input.getRootNode === 'function' ? input.getRootNode() : document;
                    describedBy = input.getAttribute('aria-describedby');

                    if (describedBy && root && typeof root.getElementById === 'function') {
                        errorElement = root.getElementById(describedBy);
                        if (errorElement) {
                            return errorElement;
                        }
                    }

                    if (input.id && root && typeof root.getElementById === 'function') {
                        errorElement = root.getElementById(input.id + '-error');
                        if (errorElement) {
                            return errorElement;
                        }
                    }

                    if (input.nextElementSibling && input.nextElementSibling.classList && input.nextElementSibling.classList.contains('mage-error')) {
                        return input.nextElementSibling;
                    }

                    return null;
                }

                function fieldErrorElementHasVisibleText(element) {
                    var style,
                        rect;

                    if (!element || !String(element.textContent || '').trim()) {
                        return false;
                    }

                    style = window.getComputedStyle ? window.getComputedStyle(element) : null;
                    rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;

                    return !style || (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        (!rect || rect.height > 0)
                    );
                }

                function getRequiredFieldMessage(input) {
                    return input && input.getAttribute('data-msg-required')
                        ? input.getAttribute('data-msg-required')
                        : translateFastcheckoutMessage('This is a required field.');
                }

                function isNativeRequiredField(input) {
                    var dataValidate = input && input.getAttribute('data-validate');

                    return !!(
                        input &&
                        (
                            input.required ||
                            input.getAttribute('aria-required') === 'true' ||
                            (dataValidate && /required\s*:\s*true/.test(dataValidate))
                        )
                    );
                }

                function isNativeFieldEmpty(input) {
                    return !input || !String(input.value || '').trim();
                }

                function scheduleNativeFieldErrorMessage(input, message) {
                    window.setTimeout(function () {
                        if (isNativeRequiredField(input) && isNativeFieldEmpty(input)) {
                            ensureNativeFieldErrorMessage(input, message);
                        }
                    }, 0);
                    window.setTimeout(function () {
                        if (isNativeRequiredField(input) && isNativeFieldEmpty(input)) {
                            ensureNativeFieldErrorMessage(input, message);
                        }
                    }, 75);
                }

                function ensureNativeFieldErrorMessage(input, message) {
                    var errorElement;

                    if (!input) {
                        return;
                    }

                    errorElement = getFieldValidationErrorElement(input);
                    if (fieldErrorElementHasVisibleText(errorElement)) {
                        return;
                    }

                    if (!errorElement) {
                        errorElement = document.createElement('div');
                        errorElement.id = input.id ? input.id + '-error' : 'fastcheckout-payment-field-error';
                        errorElement.className = 'mage-error fastcheckout-validation-error';
                        errorElement.setAttribute('data-fastcheckout-validation-fallback', 'true');

                        if (input.parentNode) {
                            input.parentNode.insertBefore(errorElement, input.nextSibling);
                        }
                    }

                    errorElement.textContent = message || getRequiredFieldMessage(input);
                    errorElement.style.display = 'block';
                    errorElement.classList.add('mage-error');

                    input.classList.add('mage-error');
                    input.setAttribute('aria-invalid', 'true');
                    if (errorElement.id) {
                        input.setAttribute('aria-describedby', errorElement.id);
                    }
                }

                function clearNativeFieldErrorFallback(input) {
                    var errorElement = getFieldValidationErrorElement(input);

                    if (errorElement && errorElement.getAttribute('data-fastcheckout-validation-fallback') === 'true') {
                        errorElement.remove();
                    }
                }

                // Use Magento's validation plugin, but scope it to the active KO renderer form.
                function validateNativeMagentoField(input) {
                    var form,
                        isValid;

                    if (!input) {
                        return true;
                    }

                    form = input.form || input.closest('form');
                    if (form && typeof $(form).validation === 'function') {
                        $(form).validation();
                        if (typeof $(input).valid === 'function') {
                            isValid = $(input).valid();
                        } else {
                            isValid = $(form).validation('isValid');
                        }

                        if (isValid && isNativeRequiredField(input) && isNativeFieldEmpty(input)) {
                            isValid = false;
                        }

                        if (!isValid) {
                            ensureNativeFieldErrorMessage(input, getRequiredFieldMessage(input));
                            scheduleNativeFieldErrorMessage(input, getRequiredFieldMessage(input));
                        } else {
                            clearNativeFieldErrorFallback(input);
                        }

                        return isValid;
                    }

                    if (!String(input.value || '').trim()) {
                        ensureNativeFieldErrorMessage(input, getRequiredFieldMessage(input));
                        return false;
                    }

                    input.removeAttribute('aria-invalid');
                    clearNativeFieldErrorFallback(input);
                    return true;
                }

                function validatePurchaseOrderWithNativeValidation() {
                    return validateNativeMagentoField(getScopedPurchaseOrderInput());
                }

                function assignCheckoutAgreementsFallback(paymentData) {
                    return checkoutAgreementsFallback.assign(paymentData);
                }

                function annotatePaymentDataWithFastcheckoutSelection(paymentData) {
                    var selectedMethod;

                    paymentData = paymentData || { method: getSelectedMethodCode() };
                    selectedMethod = getSelectedMethodCode();

                    if (
                        paymentData.method &&
                        selectedMethod &&
                        !paymentMethodCodesEqual(paymentData.method, selectedMethod)
                    ) {
                        paymentData.fastcheckout_selected_method = selectedMethod;
                        paymentData.fastcheckoutSelectedMethod = selectedMethod;
                        paymentData.additional_data = paymentData.additional_data || {};
                        paymentData.additional_data.fastcheckout_selected_method = selectedMethod;
                    }

                    return paymentData;
                }

                function validateCheckoutAgreementsFallback(hideError) {
                    return checkoutAgreementsFallback.validate(hideError);
                }

                function applyPaymentDataAssigners(paymentData) {
                    paymentData = paymentData || { method: getSelectedMethodCode() };

                    loadPaymentValidationComponents();
                    loadOptionalValidationComponents();

                    paymentValidationRegistry.applyPaymentDataAssigners(paymentData);
                    paymentData = mergeActivePaymentFormData(paymentData);
                    paymentData = annotatePaymentDataWithFastcheckoutSelection(paymentData);

                    return assignCheckoutAgreementsFallback(paymentData);
                }

                function validateAdditionalValidators(hideError) {
                    loadPaymentValidationComponents();
                    loadOptionalValidationComponents();

                    return paymentValidationRegistry.validateAdditionalValidators(hideError, function () {
                        return validateCheckoutAgreementsFallback(hideError);
                    });
                }

                loadOptionalValidationComponents();
                loadPaymentValidationComponents();

                function clonePaymentPayload(paymentData) {
                    return placeOrderHooksBridge.clonePaymentPayload(paymentData);
                }

                function runPlaceOrderRequestModifiers(paymentData, includeBillingAddress, clonePaymentData) {
                    return placeOrderHooksBridge.runRequestModifiers(paymentData, includeBillingAddress, clonePaymentData);
                }

                function buildPlaceOrderSyncPayload(paymentData) {
                    return placeOrderHooksBridge.buildSyncPayload(paymentData);
                }

                function runPlaceOrderAfterRequestListeners() {
                    placeOrderHooksBridge.runAfterRequestListeners();
                }

                function syncPlaceOrderHookData(wire, hookData, deferUpdate) {
                    return placeOrderHooksBridge.syncHookData(wire, hookData, deferUpdate);
                }

                function isAsyncTokenizationInProgress(component, result) {
                    return result === false &&
                        component &&
                        typeof component.placeOrderDefer === 'function' &&
                        typeof component.cardToken === 'function' &&
                        component.secureFormError &&
                        typeof component.secureFormError.subscribe === 'function';
                }

                function formatAsyncTokenizationErrorMessage(message) {
                    var lines = String(message || '')
                        .replace(/<\s*\/?\s*(?:div|p|li|br)\b[^>]*>/gi, '\n')
                        .replace(/<[^>]*>/g, ' ')
                        .split(/\r?\n/)
                        .map(function (line) {
                            return line.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
                        })
                        .filter(function (line) {
                            return line !== '';
                        });

                    return lines.length ? lines.join('. ') + '.' : '';
                }

                function watchAsyncTokenizationError(component, reject) {
                    var errorObserver = component && component.secureFormError,
                        subscription,
                        handleError;

                    if (!errorObserver || typeof errorObserver.subscribe !== 'function') {
                        return;
                    }

                    handleError = function (message) {
                        var errorMessage;

                        if (!message || !window.fastcheckoutHyvaPayment || !window.fastcheckoutHyvaPayment.koOrderActive) {
                            return;
                        }

                        errorMessage = formatAsyncTokenizationErrorMessage(message) ||
                            translateFastcheckoutMessage('The selected payment method could not complete order placement. Please try again.');

                        if (String(message).trim() !== errorMessage) {
                            errorObserver(errorMessage);
                            return;
                        }

                        window.fastcheckoutHyvaPayment.cleanupKoOrderState();
                        handlePaymentError(new Error(errorMessage), component.messageContainer || getBridgeMessageContainer());
                        reject(new Error(errorMessage));
                    };

                    subscription = errorObserver.subscribe(handleError);

                    window.fastcheckoutHyvaPayment.koOrderNativeErrorSubscription = subscription;
                    handleError(errorObserver());
                }

                function watchRendererPlaceOrderResult(result, component, reject) {
                    var handleReject;

                    if (!result || typeof result !== 'object') {
                        return;
                    }

                    function normalizeError(error) {
                        if (error instanceof Error) {
                            return error;
                        }
                        if (error && error.message) {
                            return new Error(error.message);
                        }
                        if (typeof error === 'string' && error) {
                            return new Error(error);
                        }

                        return new Error(translateFastcheckoutMessage('The selected payment method could not complete order placement. Please try again.'));
                    }

                    handleReject = function (error) {
                        var messageContainer = component && component.messageContainer
                                ? component.messageContainer
                                : getBridgeMessageContainer(),
                            normalizedError = normalizeError(error);

                        if (!window.fastcheckoutHyvaPayment || !window.fastcheckoutHyvaPayment.koOrderActive) {
                            return;
                        }

                        window.fastcheckoutHyvaPayment.cleanupKoOrderState();
                        handlePaymentError(normalizedError, messageContainer);
                        reject(normalizedError);
                    };

                    if (typeof result.fail === 'function') {
                        result.fail(handleReject);
                    } else if (typeof result.catch === 'function') {
                        result.catch(handleReject);
                    }
                }

                window.fastcheckoutHyvaPayment = $.extend(window.fastcheckoutHyvaPayment || {}, {
                        registerDataAssigner: registerPaymentDataAssigner,
                        registerValidator: registerPaymentValidator,

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
	                        if (
	                            this.koOrderNativeErrorSubscription &&
	                            typeof this.koOrderNativeErrorSubscription.dispose === 'function'
	                        ) {
	                            this.koOrderNativeErrorSubscription.dispose();
	                        }
	                        this.koOrderTimeout = null;
	                        this.koOrderNativeErrorSubscription = null;
	                        this.koOrderDeferred = null;
	                        this.koOrderActive = false;
	                        this.syncWire = null;
	                        this.syncResolve = null;
	                        this.syncReject = null;
	                    },

	                    getPurchaseOrderNumber: function (paymentData) {
	                        var poNumber = '';

	                        if (paymentData) {
	                            poNumber = paymentData.po_number || paymentData.poNumber || '';
	                            if (!poNumber && paymentData.additional_data) {
	                                poNumber = paymentData.additional_data.po_number || paymentData.additional_data.poNumber || '';
	                            }
	                            if (!poNumber && paymentData.additionalData) {
	                                poNumber = paymentData.additionalData.po_number || paymentData.additionalData.poNumber || '';
	                            }
	                        }

		                        if (!poNumber) {
		                            var poInput = getScopedPurchaseOrderInput();
		                            if (poInput) {
		                                poNumber = poInput.value || '';
		                            }
		                        }

		                        return String(poNumber || '').trim();
	                    },

	                    getPaymentAdditionalData: function (paymentData) {
	                        var additionalData = {};

	                        if (paymentData && paymentData.additional_data && typeof paymentData.additional_data === 'object') {
	                            $.extend(true, additionalData, paymentData.additional_data);
	                        }

	                        if (paymentData && paymentData.additionalData && typeof paymentData.additionalData === 'object') {
	                            $.extend(true, additionalData, paymentData.additionalData);
	                        }

	                        if ((paymentData && paymentData.method === 'purchaseorder') || getSelectedMethodCode() === 'purchaseorder') {
	                            additionalData.po_number = this.getPurchaseOrderNumber(paymentData);
	                        }

	                        return additionalData;
	                    },

	                    getPaymentExtensionAttributes: function (paymentData) {
	                        var extensionAttributes = {};

	                        if (paymentData && paymentData.extension_attributes && typeof paymentData.extension_attributes === 'object') {
	                            $.extend(true, extensionAttributes, paymentData.extension_attributes);
	                        }

	                        if (paymentData && paymentData.extensionAttributes && typeof paymentData.extensionAttributes === 'object') {
	                            $.extend(true, extensionAttributes, paymentData.extensionAttributes);
	                        }

	                        return extensionAttributes;
	                    },

	                    syncWirePaymentData: function (wire, paymentData, hookData) {
                            paymentData = applyPaymentDataAssigners(
                                (hookData && hookData.paymentData) || paymentData || this.getActivePaymentData()
                            );
                            hookData = hookData || buildPlaceOrderSyncPayload(paymentData);

	                        var additionalData = this.getPaymentAdditionalData(paymentData),
                                extensionAttributes = this.getPaymentExtensionAttributes(paymentData),
	                            methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode(),
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '';

	                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData, true))
                                .then(function () {
                                    if (typeof wire.set === 'function') {
                                        return wire.set('paymentExtensionAttributes', extensionAttributes, true);
                                    }
                                    return true;
                                })
		                            .then(function () {
		                                if (methodCode === 'purchaseorder' && typeof wire.set === 'function') {
		                                    return wire.set('poNumber', poNumber, true);
		                                }
		                                return true;
		                            })
                                .then(function () {
                                    if (hookData) {
                                        return syncPlaceOrderHookData(wire, hookData, true);
                                    }

                                    return true;
	                            });
	                    },

	                    syncPaymentData: function (wire) {
                            var paymentData;

	                        if (!wire || typeof wire.set !== 'function') {
	                            return Promise.resolve();
	                        }

                            paymentData = this.getActivePaymentData();

	                        return this.syncWirePaymentData(
                                wire,
                                paymentData,
                                runPlaceOrderRequestModifiers(paymentData, true)
                            );
	                    },

	                        syncActiveFormData: function (wire) {
	                            var collected,
	                                paymentData,
	                                additionalData,
	                                extensionAttributes,
	                                methodCode,
	                                poNumber;

	                            if (!wire || typeof wire.set !== 'function') {
	                                return Promise.resolve();
	                            }

	                            methodCode = getSelectedMethodCode();
	                            collected = collectFastcheckoutStructuredFields(getActivePaymentFormRoots(), { mode: 'payment' });
	                            if (
	                                methodCode !== 'purchaseorder' &&
	                                !Object.keys(collected.additionalData || {}).length &&
	                                !Object.keys(collected.extensionAttributes || {}).length &&
	                                !(collected.topLevel && collected.topLevel.po_number)
	                            ) {
	                                return Promise.resolve(true);
	                            }

	                            paymentData = {
	                                method: methodCode
	                            };
	                            if (Object.keys(collected.additionalData || {}).length) {
	                                paymentData.additional_data = collected.additionalData;
	                            }
	                            if (Object.keys(collected.extensionAttributes || {}).length) {
	                                paymentData.extension_attributes = collected.extensionAttributes;
	                            }
	                            if (collected.topLevel && collected.topLevel.po_number) {
	                                paymentData.po_number = collected.topLevel.po_number;
	                            }
	                            additionalData = this.getPaymentAdditionalData(paymentData);
	                            extensionAttributes = this.getPaymentExtensionAttributes(paymentData);
	                            additionalData = $.extend(
	                                true,
	                                {},
	                                getProperty(wire, 'paymentAdditionalData') || {},
	                                additionalData
	                            );
	                            extensionAttributes = $.extend(
	                                true,
	                                {},
	                                getProperty(wire, 'paymentExtensionAttributes') || {},
	                                extensionAttributes
	                            );
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '';

	                            return Promise.resolve(wire.set('paymentAdditionalData', additionalData, true))
	                                .then(function () {
	                                    return wire.set('paymentExtensionAttributes', extensionAttributes, true);
	                                })
	                                .then(function () {
	                                    return methodCode === 'purchaseorder' ? wire.set('poNumber', poNumber, true) : true;
	                                });
	                        },

                        onSelectPaymentMethodAction: function (paymentMethod) {
                            var methodCode = getPaymentMethodCode(paymentMethod),
                                input;

                            if (!methodCode) {
                                persistPaymentMethodToCheckoutData(null);
                                syncPaymentMethodToMagewire(null);
                                hidePaymentPlaceholders();
                                return;
                            }

                            persistPaymentMethodToCheckoutData(methodCode);
                            document.querySelectorAll('input[name="payment_method"]').forEach(function (element) {
                                if (
                                    !input &&
                                    (
                                        paymentMethodCodesEqual(element.value, methodCode) ||
                                        paymentMethodCodesEqual(methodCode, element.value)
                                    )
                                ) {
                                    input = element;
                                }
                            });
                            if (input && !input.checked) {
                                input.checked = true;
                            }
                            if (domHasPaymentMethod(methodCode)) {
                                loadRendererForMethod(methodCode).done(function () {
                                    runPatchRenderers();
                                    updateActiveRendererClass(methodCode, methodCode);
                                });
                            }
                            syncPaymentMethodToMagewire(paymentMethod);
                        },

                        onSetBillingAddressAction: function (messageContainer, originalAction) {
                            var wire = getMagewireComponent(),
                                billingAddress = quote && typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            if (!wire) {
                                return originalAction(messageContainer);
                            }

                            return resolveAsKoDeferred(
                                new Promise(function (resolve, reject) {
                                    try {
                                        Promise.resolve(
                                            typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                                                ? window.fastcheckoutApplyPendingCheckoutData(wire)
                                                : true
                                        )
                                            .then(function () {
                                                syncCheckoutStateWithoutServer(wire);
                                                return writeKoAddressToMagewire(billingAddress, true);
                                            })
                                            .then(function () {
                                                return originalAction(messageContainer);
                                            })
                                            .then(function (result) {
                                                return refreshCheckoutStateFromMagewire()
                                                    .catch(function () {
                                                        syncQuoteTotalsFromDom();
                                                    })
                                                    .then(function () {
                                                        resolve(result);
                                                    });
                                            })
                                            .catch(function (error) {
                                                reject(error);
                                            });
                                    } catch (error) {
                                        reject(error);
                                    }
                                }),
                                messageContainer
                            );
                        },

                        onSetPaymentInformationAction: function (messageContainer, paymentData, skipBilling, originalAction) {
                            var wire = getMagewireComponent(),
                                self = this,
                                methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode();

                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            if (!wire) {
                                return originalAction(messageContainer, paymentData, skipBilling);
                            }

                            return resolveAsKoDeferred(
                                new Promise(function (resolve, reject) {
                                    try {
                                        if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                            checkoutTotals.isLoading(true);
                                        }
                                        Promise.resolve(
                                            typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                                                ? window.fastcheckoutApplyPendingCheckoutData(wire)
                                                : true
                                        )
                                            .then(function () {
                                                syncCheckoutStateWithoutServer(wire);
                                                return self.syncWirePaymentData(wire, paymentData || self.getActivePaymentData());
                                            })
                                            .then(function () {
                                                var currentMagewireMethod = getProperty(wire, 'paymentMethod');
                                                if (methodCode && methodCode !== currentMagewireMethod && !paymentMethodSync.isSynced(methodCode) && typeof wire.call === 'function') {
                                                    paymentMethodSync.markSynced(methodCode);
                                                    return wire.call('selectPaymentMethod', methodCode);
                                                }
                                                return true;
                                            })
                                            .then(function () {
                                                return refreshCheckoutStateFromMagewire();
                                            })
                                            .then(function () {
                                                resolve(true);
                                            })
                                            .catch(function (error) {
                                                reject(error);
                                            });
                                    } catch (error) {
                                        reject(error);
                                    }
                                }),
                                messageContainer
                            );
                        },

                        onGetPaymentInformationAction: function (deferred, messageContainer, originalAction) {
                            if (!getMagewireComponent()) {
                                return originalAction(deferred, messageContainer);
                            }

                            return resolveCheckoutStateRefresh([], deferred, messageContainer);
                        },

                        onGetTotalsAction: function (callbacks, deferred, originalAction) {
                            if (!getMagewireComponent()) {
                                return originalAction(callbacks, deferred);
                            }

                            return resolveCheckoutStateRefresh(callbacks, deferred, getBridgeMessageContainer());
                        },

		                    placeOrder: function (wire, selectedMethod) {
		                        var component,
		                            paymentData,
                                    methodCode,
                                    nativeSubmitAction,
		                            result,
		                            self = this;

                            clearPaymentMessages();

	                        if (!wire || typeof wire.call !== 'function') {
                                var missingSessionError = new Error(translateFastcheckoutMessage('Checkout session is not ready. Please refresh the page and try again.'));
                                handlePaymentError(missingSessionError, getBridgeMessageContainer());
	                            return Promise.reject(missingSessionError);
	                        }

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

	                        return ensureRendererForMethod(selectedMethod || getSelectedMethodCode()).then(function () {
                                return prepareCheckoutState(wire);
                            }).then(function () {
		                            component = getActiveRenderer();
                                if (component) {
                                    refreshNativePaymentActions();
                                }
		                            paymentData = component && typeof component.getData === 'function'
		                                ? applyPaymentDataAssigners(component.getData())
		                                : this.getActivePaymentData();
                                methodCode = paymentData && paymentData.method ? paymentData.method : (selectedMethod || getSelectedMethodCode());
                                nativeSubmitAction = getRendererNativeSubmitAction(component);

		                            if (!component || typeof component.placeOrder !== 'function') {
	                                    if (methodCode === 'purchaseorder' && !validatePurchaseOrderWithNativeValidation()) {
	                                        var fallbackPoValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
	                                        handlePaymentError(fallbackPoValidationError, getBridgeMessageContainer());
	                                        return Promise.reject(fallbackPoValidationError);
	                                    }
                                        if (methodCode === 'purchaseorder' && !validateAdditionalValidators(false)) {
                                            var fallbackPoAdditionalValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
                                            handlePaymentError(fallbackPoAdditionalValidationError, getBridgeMessageContainer());
                                            return Promise.reject(fallbackPoAdditionalValidationError);
                                        }
		                                    if (methodCode !== 'purchaseorder' && !this.validate()) {
		                                        var validationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
		                                        handlePaymentError(validationError, getBridgeMessageContainer());
		                                        return Promise.reject(validationError);
	                                    }
		                                return this.syncPaymentData(wire).then(function () {
		                                    return wire.call('placeOrder', selectedMethod || (paymentData && paymentData.method) || getSelectedMethodCode());
		                                }).then(function (result) {
                                        if (result && typeof result === 'object' && result.success === false) {
                                            throw new Error(result.message || result.error || translateFastcheckoutMessage('The order was not placed.'));
                                        }
                                        window.fastcheckoutLastPlaceOrderResult = result || {};
                                        runPlaceOrderAfterRequestListeners();
                                        return result;
	                                }).catch(function (err) {
                                        runPlaceOrderAfterRequestListeners();
                                        handlePaymentError(err, getBridgeMessageContainer());
                                        throw err;
	                                });
	                            }

	                                if (methodCode === 'purchaseorder' && !validatePurchaseOrderWithNativeValidation()) {
	                                    var poValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
	                                    handlePaymentError(poValidationError, component.messageContainer || getBridgeMessageContainer());
	                                    return Promise.reject(poValidationError);
	                                }
	                                    if (methodCode === 'purchaseorder' && !validateAdditionalValidators(false)) {
	                                        var poAdditionalValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
	                                        handlePaymentError(poAdditionalValidationError, component.messageContainer || getBridgeMessageContainer());
	                                        return Promise.reject(poAdditionalValidationError);
	                                    }
                                    if (methodCode === 'purchaseorder') {
                                        return this.syncPaymentData(wire).then(function () {
                                            return wire.call('placeOrder', methodCode);
                                        }).then(function (result) {
                                            if (result && typeof result === 'object' && result.success === false) {
                                                throw new Error(result.message || result.error || translateFastcheckoutMessage('The order was not placed.'));
                                            }
                                            window.fastcheckoutLastPlaceOrderResult = result || {};
                                            runPlaceOrderAfterRequestListeners();
                                            return result;
                                        }).catch(function (err) {
                                            runPlaceOrderAfterRequestListeners();
                                            handlePaymentError(err, component.messageContainer || getBridgeMessageContainer());
                                            throw err;
                                        });
                                    }
			                            if (methodCode !== 'purchaseorder' && !this.validate()) {
		                                    var activeValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
		                                    handlePaymentError(activeValidationError, component.messageContainer || getBridgeMessageContainer());
			                                return Promise.reject(activeValidationError);
		                            }
		                            if (
	                                typeof component.isPlaceOrderActionAllowed === 'function' &&
	                                !component.isPlaceOrderActionAllowed()
	                            ) {
                                    var notReadyError = new Error(translateFastcheckoutMessage('The selected payment method is not ready. Please try again.'));
                                    handlePaymentError(notReadyError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(notReadyError);
	                            }
                                if (
                                    nativeSubmitAction &&
                                    nativeSubmitAction.button &&
                                    (
                                        nativeSubmitAction.button.disabled ||
                                        nativeSubmitAction.button.classList.contains('disabled') ||
                                        nativeSubmitAction.button.getAttribute('aria-disabled') === 'true'
                                    )
                                ) {
                                    var nativeActionNotReadyError = new Error(translateFastcheckoutMessage('The selected payment method is not ready. Please try again.'));
                                    handlePaymentError(nativeActionNotReadyError, component.messageContainer || getBridgeMessageContainer());
                                    return Promise.reject(nativeActionNotReadyError);
                                }

                                return this.syncWirePaymentData(
                                    wire,
                                    paymentData,
                                    buildPlaceOrderSyncPayload(paymentData)
                                ).then(function () {
                                    if (methodCode && typeof wire.call === 'function') {
                                        return wire.call('selectPaymentMethod', methodCode);
                                    }

                                    return true;
                                }).then(function () {
		                            self.cleanupKoOrderState();
		                            self.syncWire = wire;
		                            self.koOrderActive = true;
		                            self.koOrderDeferred = $.Deferred();

		                            return new Promise(function (resolve, reject) {
		                                self.syncResolve = resolve;
		                                self.syncReject = reject;
		                                self.koOrderTimeout = window.setTimeout(function () {
	                                    if (!self.koOrderActive) {
	                                        return;
	                                    }
	                                    self.cleanupKoOrderState();
                                        var timeoutError = new Error(translateFastcheckoutMessage('The selected payment method did not start order placement. Please try again.'));
                                        handlePaymentError(timeoutError, component.messageContainer || getBridgeMessageContainer());
	                                    reject(timeoutError);
	                                }, 30000);

	                                try {
                                            if (nativeSubmitAction) {
                                                result = nativeSubmitAction.run(component, new Event('submit'));
                                            } else if (component.getCode && component.getCode() === 'braintree') {
		                                        result = component.placeOrder();
		                                    } else {
		                                        result = component.placeOrder(paymentData, new Event('submit'));
                                            }
                                            watchRendererPlaceOrderResult(result, component, reject);

			                                    if (isAsyncTokenizationInProgress(component, result)) {
			                                        watchAsyncTokenizationError(component, reject);
			                                    } else if (result === false) {
			                                        self.cleanupKoOrderState();
	                                            var resultError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
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
                                }).catch(function (error) {
                                    handlePaymentError(error, component.messageContainer || getBridgeMessageContainer());
                                    throw error;
                                });
		                        }.bind(this));
		                    },

	                    onPlaceOrderAction: function (paymentData, messageContainer, originalAction) {
	                        var methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode();
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();
                            clearPaymentMessages();

	                        if (this.koOrderActive && this.syncWire) {
	                            try {
	                                if (this.koOrderTimeout) {
	                                    window.clearTimeout(this.koOrderTimeout);
	                                    this.koOrderTimeout = null;
	                                }

	                                this.syncWirePaymentData(
                                        this.syncWire,
                                        paymentData,
                                        runPlaceOrderRequestModifiers(paymentData, true, true)
                                    )
	                                    .then(function () {
                                            if (methodCode && typeof this.syncWire.call === 'function') {
                                                return this.syncWire.call('selectPaymentMethod', methodCode);
                                            }

                                            return true;
	                                    }.bind(this))
                                        .then(function () {
                                            return originalAction(paymentData, messageContainer);
                                        })
	                                    .then(function (result) {
                                            if (this.koOrderDeferred && typeof this.koOrderDeferred.resolve === 'function') {
                                                this.koOrderDeferred.resolve(result);
                                            }
	                                        if (this.syncResolve) {
	                                            this.syncResolve(result);
	                                            this.syncResolve = null;
	                                            this.syncReject = null;
	                                        }
                                            this.cleanupKoOrderState();
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
                                var wire = this.syncWire || getMagewireComponent(),
                                    fallbackDeferred;

                                if (!wire || typeof wire.call !== 'function') {
                                    return originalAction(paymentData, messageContainer);
                                }

                                this.cleanupKoOrderState();
                                this.syncWire = wire;
                                this.koOrderActive = true;
                                this.koOrderDeferred = $.Deferred();
                                fallbackDeferred = this.koOrderDeferred;
                                this.koOrderTimeout = window.setTimeout(function () {
                                    if (!this.koOrderActive) {
                                        return;
                                    }
                                    var timeoutError = new Error(translateFastcheckoutMessage('The selected payment method did not complete order placement. Please try again.'));
                                    handlePaymentError(timeoutError, messageContainer);
                                    if (fallbackDeferred && typeof fallbackDeferred.reject === 'function') {
                                        fallbackDeferred.reject(timeoutError);
                                    }
                                    this.cleanupKoOrderState();
                                }.bind(this), 30000);

                                this.syncWirePaymentData(
                                    wire,
                                    paymentData,
                                    runPlaceOrderRequestModifiers(paymentData, true, true)
                                )
                                    .then(function () {
                                        if (methodCode && typeof wire.call === 'function') {
                                            return wire.call('selectPaymentMethod', methodCode);
                                        }

                                        return true;
                                    })
                                    .then(function () {
                                        return originalAction(paymentData, messageContainer);
                                    })
                                    .then(function (result) {
                                        if (fallbackDeferred && typeof fallbackDeferred.resolve === 'function') {
                                            fallbackDeferred.resolve(result);
                                        }
                                        this.cleanupKoOrderState();
                                    }.bind(this))
                                    .catch(function (err) {
                                        handlePaymentError(err, messageContainer);
                                        if (fallbackDeferred && typeof fallbackDeferred.reject === 'function') {
                                            fallbackDeferred.reject(err);
                                        }
                                        this.cleanupKoOrderState();
                                    }.bind(this));

                                return fallbackDeferred.promise();
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
	                        var component = getActiveRenderer(),
                                methodCode = getSelectedMethodCode();

                            if (methodCode === 'purchaseorder') {
                                return validatePurchaseOrderWithNativeValidation() && validateAdditionalValidators(false);
                            }

                            // Hosted card renderers can expose field validation separately from validate().
                            if (
                                component &&
                                (
                                    typeof component.validateCardType === 'function' ||
                                    typeof component.validateExpirationDate === 'function' ||
                                    typeof component.validateCvvNumber === 'function'
                                )
                            ) {
                                var isCardNumberValid = typeof component.validateCardType === 'function'
                                        ? component.validateCardType()
                                        : true,
                                    isExpirationDateValid = typeof component.validateExpirationDate === 'function'
                                        ? component.validateExpirationDate()
                                        : true,
                                    isCvvValid = typeof component.validateCvvNumber === 'function'
                                        ? component.validateCvvNumber()
                                        : true;

                                if (
                                    !isCardNumberValid ||
                                    !isExpirationDateValid ||
                                    !isCvvValid
                                ) {
                                    return false;
                                }
                            }

	                        if (component && typeof component.validate === 'function') {
	                            var isValid = component.validate();
	                            if (!isValid) {
                                return false;
                            }
                        }
                        return validateAdditionalValidators(false);
                    },

                    afterPlaceOrder: function () {
                        var component = getActiveRenderer(),
                            shouldRunRendererAfterPlaceOrder = !window.fastcheckoutKoSuccessRedirectInProgress;
                        

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

                            // If the component overrides standard afterPlaceOrder (like Tpay/Mollie).
                            // When Magento's redirect-on-success action calls this bridge, the renderer
                            // has already run its native afterPlaceOrder in payment/default.js.
                            if (shouldRunRendererAfterPlaceOrder && typeof component.afterPlaceOrder === 'function') {
                                try {
                                    component.afterPlaceOrder();
                                } catch (e) {
                                    if (window.console && typeof window.console.error === 'function') {
                                        window.console.error('Kkkonrad Fastcheckout: error executing afterPlaceOrder:', e);
                                    }
                                }

                                if (component.redirectAfterPlaceOrder === false) {
                                    return;
                                }
                            }
                        }

                        // Default success redirect, honoring modules that set redirectOnSuccessAction.redirectUrl
                        // in their native afterPlaceOrder implementation (for example Przelewy24).
                        require([
                            'mage/url',
                            'Magento_Checkout/js/action/redirect-on-success'
                        ], function (url, redirectOnSuccessAction) {
                            var redirectUrl = redirectOnSuccessAction && redirectOnSuccessAction.redirectUrl
                                ? redirectOnSuccessAction.redirectUrl
                                : (window.checkoutConfig && window.checkoutConfig.defaultSuccessPageUrl) || 'checkout/onepage/success';

                            window.location.replace(url.build(redirectUrl));
                        });
                    },

                    selectPaymentMethod: setSelectedMethod,
                    ensureRendererForMethod: ensureRendererForMethod,
                    getRendererMap: function () {
                        return typeof rendererManager.getRendererMap === 'function'
                            ? rendererManager.getRendererMap()
                            : [];
                    },
                    getActiveRenderer: getActiveRenderer,
                    refreshNativePaymentActions: refreshNativePaymentActions,
                    getActiveNativeSubmitActionName: getActiveNativeSubmitActionName,
                    getMessageContainer: getBridgeMessageContainer,
                    clearMessages: clearPaymentMessages
                });


                runPatchRenderers();
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

                        // Clear empty wrappers from shadow roots
                        document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]').forEach(function (placeholder) {
                            if (placeholder.shadowRoot) {
                                placeholder.shadowRoot.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (wrapper) {
                                    wrapper.remove();
                                });
                            }
                        });
                    }
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('element.updating', function (fromEl, toEl) {
                        if (fromEl.getAttribute('wire:key') === 'checkout-payment-methods-card') {
                            var fromCodes = Array.from(fromEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option') + ':' +
                                    el.getAttribute('data-fastcheckout-payment-allowed');
                            }).sort().join(',');

                            var toCodes = Array.from(toEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option') + ':' +
                                    el.getAttribute('data-fastcheckout-payment-allowed');
                            }).sort().join(',');

                            if (fromCodes === toCodes) {
                                
                                return false;
                            }

                            
                            moveRenderersBackToRoot();
                        }
                    });

                    window.Livewire.hook('message.processed', function () {
                        syncPaymentMethods();
                        syncQuoteTotalsFromDom();
                        var code = getSelectedMethodCode();
                        
                        runPatchRenderers();
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
                        syncCheckoutProviderAddressAttributes();
                        if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                            checkoutTotals.isLoading(false);
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
