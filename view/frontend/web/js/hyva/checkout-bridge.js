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
            'Magento_Ui/js/core/renderer/layout',
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
            uiLayout,
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

            function initializeCheckoutBridge(done) {
                // Loading a renderer registration module can initialize a remote
                // payment SDK. Individual renderers are loaded by method code.
                done();
            }

            initializeCheckoutBridge(function () {
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
                    registry: registry,
                    layout: uiLayout,
                    scope: scope
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

                // After a successful panel open, briefly refuse blank hide-all calls.
                // Delayed Magewire/KO callbacks were closing the just-opened method
                // (checkmo → empty → checkmo thrash after shipping remap).
                var paymentPanelHoldCode = '';
                var paymentPanelHoldUntil = 0;

                function holdPaymentPanel(methodCode, ms) {
                    if (!methodCode) {
                        paymentPanelHoldCode = '';
                        paymentPanelHoldUntil = 0;
                        return;
                    }
                    paymentPanelHoldCode = methodCode;
                    paymentPanelHoldUntil = Date.now() + (typeof ms === 'number' ? ms : 2500);
                }

                function hidePaymentPlaceholders(exceptMethodCode) {
                    var keep = exceptMethodCode || '';

                    if (
                        !keep &&
                        paymentPanelHoldCode &&
                        Date.now() < paymentPanelHoldUntil
                    ) {
                        keep = paymentPanelHoldCode;
                    } else if (
                        keep &&
                        paymentPanelHoldCode &&
                        Date.now() < paymentPanelHoldUntil &&
                        !paymentMethodCodesEqual(keep, paymentPanelHoldCode)
                    ) {
                        // Intentional switch to another method — drop the hold.
                        paymentPanelHoldCode = keep;
                        paymentPanelHoldUntil = Date.now() + 2500;
                    }

                    paymentDomBridge.hidePlaceholders(keep);
                }

                function clearActivePaymentClasses() {
                    if (typeof paymentDomBridge.clearActivePaymentClasses === 'function') {
                        paymentDomBridge.clearActivePaymentClasses();
                    }
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
                                methodCode,
                                userPayment;

                            if (isSyncingFromKo || paymentMethodSync.isApplyingFromBridge() || !method) {
                                return;
                            }

                            methodCode = method.method || '';
                            userPayment = paymentMethodSync.getUserSelectedPaymentMethod
                                ? paymentMethodSync.getUserSelectedPaymentMethod()
                                : '';

                            // Stale KO select of an older method while shopper already picked another.
                            if (
                                userPayment &&
                                paymentMethodSync.isUserPaymentSelectionFresh &&
                                paymentMethodSync.isUserPaymentSelectionFresh() &&
                                methodCode &&
                                !paymentMethodCodesEqual(methodCode, userPayment)
                            ) {
                                if (paymentMethodSync.reassertUserPaymentOnQuote) {
                                    paymentMethodSync.reassertUserPaymentOnQuote();
                                }
                                return;
                            }

                            // KO re-notifies on every new object even when method string is unchanged.
                            // Never $set Magewire for an already-synced payment — that alone can loop XHR.
                            if (!methodCode || paymentMethodSync.isSynced(methodCode)) {
                                return;
                            }

                            wire = getMagewireComponent();
                            if (wire && getProperty(wire, 'paymentMethod') !== methodCode) {
                                isSyncingFromKo = true;
                                Promise.resolve(setMagewireValue(wire, 'paymentMethod', methodCode, false))
                                    .then(function () {
                                        paymentMethodSync.markSynced(methodCode);
                                        isSyncingFromKo = false;
                                    })
                                    .catch(function () {
                                        isSyncingFromKo = false;
                                    });
                            } else if (methodCode) {
                                paymentMethodSync.markSynced(methodCode);
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

                function rememberUserShippingSelection(methodCode) {
                    if (shippingMethodSync && typeof shippingMethodSync.rememberUserShippingSelection === 'function') {
                        shippingMethodSync.rememberUserShippingSelection(methodCode);
                    }
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
                    rememberUserShippingSelection: rememberUserShippingSelection,
                    getShippingMethodCode: getShippingMethodCode,
                    getUserSelectedShippingMethod: function () {
                        return shippingMethodSync && typeof shippingMethodSync.getUserSelectedShippingMethod === 'function'
                            ? shippingMethodSync.getUserSelectedShippingMethod()
                            : '';
                    },
                    isUserShippingSelectionFresh: function () {
                        return !!(
                            shippingMethodSync &&
                            typeof shippingMethodSync.isUserShippingSelectionFresh === 'function' &&
                            shippingMethodSync.isUserShippingSelectionFresh()
                        );
                    },
                    shouldIgnoreKnockoutApply: function (methodCode) {
                        return !!(
                            shippingMethodSync &&
                            typeof shippingMethodSync.shouldIgnoreKnockoutApply === 'function' &&
                            shippingMethodSync.shouldIgnoreKnockoutApply(methodCode)
                        );
                    },
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
                        var code = getShippingMethodCode(shippingMethod);

                        // Do not treat Magento rate-resolver overwrites as a new user choice,
                        // and never re-lock intent from non-user paths (that re-opened the loop).
                        if (
                            code &&
                            shippingMethodSync &&
                            typeof shippingMethodSync.shouldIgnoreKnockoutApply === 'function' &&
                            shippingMethodSync.shouldIgnoreKnockoutApply(code)
                        ) {
                            return;
                        }

                        // Sync to Magewire only — user lock is set exclusively by trusted clicks.
                        syncShippingMethodToMagewire(code);
                        // Avoid standard shipping-view select side-effects (extra rate
                        // recollect / setShippingInformation races that bounced the radio).
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
                    var code,
                        userMethod;

                    clearShippingFieldError();
                    if (window.fastcheckoutSuppressShippingSync) {
                        return;
                    }
                    if (!method) {
                        persistShippingMethodToCheckoutData(null);
                        return;
                    }

                    code = method.carrier_code + '_' + method.method_code;

                    // Magento rate recollect / checkoutData often re-selects the previous
                    // rate after the user picked another. Snap KO back to the user choice
                    // instead of letting the radio bounce and pushing the stale rate to Magewire.
                    if (
                        shippingMethodSync &&
                        typeof shippingMethodSync.shouldIgnoreKnockoutApply === 'function' &&
                        shippingMethodSync.shouldIgnoreKnockoutApply(code)
                    ) {
                        userMethod = typeof shippingMethodSync.getUserSelectedShippingMethod === 'function'
                            ? shippingMethodSync.getUserSelectedShippingMethod()
                            : '';
                        if (userMethod && userMethod !== code) {
                            syncSelectedShippingMethodToKnockout(userMethod);
                        }
                        return;
                    }

                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(true);
                    }
                    syncShippingMethodToMagewire(code);
                });

                shippingService.getShippingRates().subscribe(function () {
                    var magewireEl = document.querySelector('[wire\\:id]'),
                        wire,
                        wireMethod,
                        userMethod,
                        preferred = '';

                    if (!magewireEl || !magewireEl.__livewire) {
                        return;
                    }

                    wire = magewireEl.__livewire;
                    wireMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod');
                    // Prefer the user's fresh choice over a lagging wire value while rates rebind.
                    if (
                        shippingMethodSync &&
                        typeof shippingMethodSync.getUserSelectedShippingMethod === 'function' &&
                        typeof shippingMethodSync.isUserShippingSelectionFresh === 'function' &&
                        shippingMethodSync.isUserShippingSelectionFresh()
                    ) {
                        userMethod = shippingMethodSync.getUserSelectedShippingMethod();
                        if (userMethod) {
                            preferred = userMethod;
                        }
                    }

                    if (!preferred && wireMethod) {
                        preferred = wireMethod;
                    }

                    if (!preferred) {
                        return;
                    }

                    syncSelectedShippingMethodToKnockout(preferred);

                    // Force the radio checked state immediately after rates re-render so the
                    // previous rate does not flash between KO foreach cycles.
                    window.requestAnimationFrame(function () {
                        var radio = document.querySelector(
                            'input[name="shipping_method"][value="' + preferred + '"]'
                        );
                        if (radio && !radio.checked) {
                            radio.checked = true;
                        }
                        syncSelectedShippingMethodToKnockout(preferred);
                    });
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

                function markNativePlaceOrderHidden(button) {
                    if (!button || !button.classList) {
                        return;
                    }

                    // Keep KO placeOrder controls out of form submit / Playwright :submit matches.
                    if (!button.getAttribute('data-fastcheckout-original-type')) {
                        button.setAttribute(
                            'data-fastcheckout-original-type',
                            button.getAttribute('type') || 'submit'
                        );
                    }
                    button.setAttribute('type', 'button');
                    button.setAttribute('tabindex', '-1');
                    button.setAttribute('aria-hidden', 'true');
                    button.setAttribute('disabled', 'disabled');
                    button.classList.add('fastcheckout-native-place-order-hidden');
                }

                function unmarkNativePlaceOrderHidden(button) {
                    if (!button || !button.classList) {
                        return;
                    }

                    var originalType = button.getAttribute('data-fastcheckout-original-type') || 'submit';
                    button.setAttribute('type', originalType);
                    button.removeAttribute('tabindex');
                    button.removeAttribute('aria-hidden');
                    button.removeAttribute('disabled');
                    button.removeAttribute('data-fastcheckout-original-type');
                    button.classList.remove('fastcheckout-native-place-order-hidden');
                }

                function annotateNativePaymentActions(root) {
                    if (!root || typeof root.querySelectorAll !== 'function') {
                        return;
                    }

                    Array.prototype.slice.call(root.querySelectorAll('.fastcheckout-native-place-order-hidden')).forEach(function (button) {
                        unmarkNativePlaceOrderHidden(button);
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
                                markNativePlaceOrderHidden(button);
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

                function isPaymentPanelOpen(methodCode, activeCode) {
                    var target,
                        existingInTarget;

                    if (!methodCode) {
                        return false;
                    }

                    target = document.querySelector(
                        '[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]'
                    );
                    if (!target || target.classList.contains('hidden') || target.style.display === 'none') {
                        return false;
                    }

                    existingInTarget = target.querySelector('.payment-method');
                    if (!existingInTarget) {
                        // Some offline methods only inject light content / notes without .payment-method.
                        return target.children.length > 0 && hasVisibleContent(target);
                    }

                    return elementMatchesMethod(existingInTarget, methodCode, activeCode || methodCode) &&
                        (
                            existingInTarget.classList.contains('_active') ||
                            existingInTarget.getAttribute('data-fastcheckout-active') === 'true' ||
                            hasVisibleContent(existingInTarget)
                        );
                }

                function updateActiveRendererClass(methodCode, activeCode) {
                    var root = document.getElementById('fastcheckout-ko-payment-root'),
                        activeElement = null,
                        movedToTarget = false,
                        opened = false,
                        target = methodCode
                            ? document.querySelector('[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]')
                            : null,
                        existingInTarget,
                        allRenderers;

                    // Already open for this method — skip hide/show cycle.
                    if (isPaymentPanelOpen(methodCode, activeCode)) {
                        existingInTarget = target ? target.querySelector('.payment-method') : null;
                        if (existingInTarget) {
                            annotateNativePaymentActions(existingInTarget);
                        }
                        holdPaymentPanel(methodCode);
                        hidePaymentPlaceholders(methodCode);
                        return true;
                    }

                    if (!root && !target) {
                        return false;
                    }

                    allRenderers = document.querySelectorAll('.payment-method');
                    allRenderers.forEach(function (element) {
                        if (!activeElement && elementMatchesMethod(element, methodCode, activeCode)) {
                            activeElement = element;
                        }
                    });

                    // Critical: do not hide the previous panel until the next one is ready.
                    // Hiding first caused open → empty → open flicker when the renderer was still booting.
                    if (!activeElement || !hasVisibleContent(activeElement)) {
                        return false;
                    }

                    activeElement.classList.add('_active');
                    activeElement.setAttribute('data-fastcheckout-active', 'true');
                    annotateNativePaymentActions(activeElement);

                    if (target) {
                        if (activeElement.parentNode !== target) {
                            target.appendChild(activeElement);
                        }

                        // Show the destination first, then hide every other panel.
                        target.classList.remove('hidden');
                        target.style.display = 'block';
                        movedToTarget = true;
                        opened = true;
                        holdPaymentPanel(methodCode);
                    } else {
                        opened = true;
                        holdPaymentPanel(methodCode);
                    }

                    hidePaymentPlaceholders(methodCode);

                    allRenderers.forEach(function (element) {
                        if (!elementMatchesMethod(element, methodCode, activeCode)) {
                            element.classList.remove('_active');
                            element.removeAttribute('data-fastcheckout-active');
                        }
                    });

                    return opened || movedToTarget;
                }

                function isPaymentSelectionStillWanted(methodCode, generation) {
                    if (!methodCode) {
                        return false;
                    }
                    if (
                        paymentMethodSync.shouldAcceptPaymentSelection &&
                        !paymentMethodSync.shouldAcceptPaymentSelection(methodCode, generation)
                    ) {
                        return false;
                    }
                    if (
                        pendingSelectedMethodCode &&
                        !paymentMethodCodesEqual(pendingSelectedMethodCode, methodCode)
                    ) {
                        return false;
                    }
                    return true;
                }

                function applySelectedMethod(methodCode, generation) {
                    var method,
                        renderer,
                        component,
                        activeCode,
                        activeMethod,
                        selectionGeneration = typeof generation === 'number'
                            ? generation
                            : (paymentMethodSync.getPaymentSelectionGeneration
                                ? paymentMethodSync.getPaymentSelectionGeneration()
                                : 0);

                    if (!methodCode) {
                        return false;
                    }

                    // Stale call for a previous method while a newer shopper pick is active.
                    if (!isPaymentSelectionStillWanted(methodCode, selectionGeneration)) {
                        return false;
                    }

                    component = getRendererComponentForMethod(methodCode);
                    if (component && !rendererManager.isLoaded(component)) {
                        loadRendererForMethod(methodCode).done(function () {
                            // Only continue if this method is still the intended selection.
                            if (!isPaymentSelectionStillWanted(methodCode, selectionGeneration)) {
                                return;
                            }
                            if (
                                pendingSelectedMethodCode === methodCode ||
                                paymentMethodCodesEqual(
                                    paymentMethodSync.getUserSelectedPaymentMethod
                                        ? paymentMethodSync.getUserSelectedPaymentMethod()
                                        : '',
                                    methodCode
                                ) ||
                                getSelectedMethodCode() === methodCode
                            ) {
                                if (pendingSelectedMethodCode !== methodCode) {
                                    pendingSelectedMethodCode = methodCode;
                                }
                                retryPendingSelectedMethod();
                            }
                        });
                    }

                    if (!isPaymentSelectionStillWanted(methodCode, selectionGeneration)) {
                        return false;
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

                    if (!isPaymentSelectionStillWanted(methodCode, selectionGeneration)) {
                        return false;
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
                    var code = pendingSelectedMethodCode;

                    if (!code || !domHasPaymentMethod(code)) {
                        return;
                    }
                    if (!isPaymentSelectionStillWanted(code)) {
                        pendingSelectedMethodCode = '';
                        return;
                    }

                    runPatchRenderers();
                    if (applySelectedMethod(code)) {
                        if (pendingSelectedMethodCode === code) {
                            pendingSelectedMethodCode = '';
                        }
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

                function schedulePaymentPanelOpenRetries(methodCode) {
                    var generation = paymentMethodSync.getPaymentSelectionGeneration
                        ? paymentMethodSync.getPaymentSelectionGeneration()
                        : 0;

                    pendingSelectedMethodCode = methodCode;
                    [80, 250, 700, 1500, 2500].forEach(function (delay) {
                        window.setTimeout(function () {
                            if (pendingSelectedMethodCode !== methodCode) {
                                return;
                            }
                            if (!isPaymentSelectionStillWanted(methodCode, generation)) {
                                if (pendingSelectedMethodCode === methodCode) {
                                    pendingSelectedMethodCode = '';
                                }
                                return;
                            }
                            if (isPaymentPanelOpen(methodCode, methodCode)) {
                                pendingSelectedMethodCode = '';
                                return;
                            }
                            retryPendingSelectedMethod();
                        }, delay);
                    });
                }

                function setSelectedMethod(methodCode) {
                    // Same method within a short window: avoid re-running full select if panel is open.
                    // If the panel is closed (common after shipping remap), fall through and open it.
                    if (methodCode && methodCode === lastSetSelectedMethodCode && Date.now() - lastSetSelectedMethodAt < 1500) {
                        runPatchRenderers();
                        if (isPaymentPanelOpen(methodCode, methodCode) || updateActiveRendererClass(methodCode, methodCode)) {
                            pendingSelectedMethodCode = '';
                            return;
                        }
                        // Panel still closed — continue into apply path below.
                    }
                    lastSetSelectedMethodCode = methodCode || '';
                    lastSetSelectedMethodAt = Date.now();
                    syncPaymentMethods();

                    checkoutLayoutBridge.activateDeferredPaymentListChildren(
                        methodCode,
                        getRendererComponentForMethod(methodCode)
                    );

                    if (!methodCode) {
                        pendingSelectedMethodCode = '';
                        // Ignore blank clears while a just-opened panel is settling.
                        if (paymentPanelHoldCode && Date.now() < paymentPanelHoldUntil) {
                            return;
                        }
                        holdPaymentPanel('');
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        clearActivePaymentClasses();
                        return;
                    }

                    // Already mirrored in quote + Magewire: refresh panel only when content is open.
                    // After shipping→payment remap markSynced runs before the KO panel is shown;
                    // early-return without apply left the radio checked and content closed.
                    if (paymentMethodSync.isSynced(methodCode)) {
                        runPatchRenderers();
                        if (isPaymentPanelOpen(methodCode, methodCode) || updateActiveRendererClass(methodCode, methodCode)) {
                            pendingSelectedMethodCode = '';
                            return;
                        }
                    } else if (
                        paymentMethodSync.getQuoteCode() === methodCode &&
                        document.querySelector(
                            'input[name="payment_method"]:checked:not([disabled])[value="' +
                            methodCode.replace(/"/g, '') + '"]'
                        )
                    ) {
                        paymentMethodSync.markSynced(methodCode);
                        runPatchRenderers();
                        if (isPaymentPanelOpen(methodCode, methodCode) || updateActiveRendererClass(methodCode, methodCode)) {
                            pendingSelectedMethodCode = '';
                            return;
                        }
                    }

                    if (!domHasPaymentMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                        if (
                            paymentPanelHoldCode &&
                            Date.now() < paymentPanelHoldUntil &&
                            paymentMethodCodesEqual(paymentPanelHoldCode, methodCode)
                        ) {
                            return;
                        }
                        if (paymentPanelHoldCode && Date.now() < paymentPanelHoldUntil) {
                            return;
                        }
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        clearActivePaymentClasses();
                        return;
                    }

                    pendingSelectedMethodCode = methodCode;
                    if (applySelectedMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                        return;
                    }

                    // Renderer still booting after shipping change — keep trying to open content.
                    schedulePaymentPanelOpenRetries(methodCode);

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
                        var targetMethod = target.getAttribute('data-fastcheckout-payment-method-ko-target');

                        Array.prototype.slice.call(target.querySelectorAll(
                            '.payment-method._active, [data-fastcheckout-active="true"], .fastcheckout-payment-method-ko-container:not(.hidden)'
                        )).forEach(addRoot);

                        if (selectedMethod && targetMethod === selectedMethod) {
                            addRoot(target);
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
                        var errorMessage,
                            nativeError;

                        if (!message || !window.fastcheckoutHyvaPayment || !window.fastcheckoutHyvaPayment.koOrderActive) {
                            return;
                        }

                        errorMessage = formatAsyncTokenizationErrorMessage(message) ||
                            translateFastcheckoutMessage('The selected payment method could not complete order placement. Please try again.');

                        if (String(message).trim() !== errorMessage) {
                            errorObserver(errorMessage);
                            return;
                        }

                        nativeError = new Error(errorMessage);
                        nativeError.fastcheckoutNativePaymentError = true;
                        window.fastcheckoutHyvaPayment.cleanupKoOrderState();
                        reject(nativeError);
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
                        clearUserPaymentSelection: function () {
                            if (paymentMethodSync.clearUserPaymentSelection) {
                                paymentMethodSync.clearUserPaymentSelection();
                            }
                        },
                        rememberUserPaymentSelection: function (methodCode) {
                            if (paymentMethodSync.rememberUserPaymentSelection) {
                                paymentMethodSync.rememberUserPaymentSelection(methodCode);
                            }
                        },
                        shouldAcceptPaymentSelection: function (paymentMethod, generation) {
                            if (paymentMethodSync.shouldAcceptPaymentSelection) {
                                return paymentMethodSync.shouldAcceptPaymentSelection(
                                    paymentMethod,
                                    generation
                                );
                            }
                            return true;
                        },

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
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '',
                                changed = false,
                                write;

                            // Equality-aware writes: raw wire.set always dirties Livewire and
                            // was the main driver of idle $set → selectPaymentMethod loops.
                            write = function (field, value) {
                                var result = setMagewireValue(wire, field, value, true);

                                if (result) {
                                    changed = true;
                                }

                                return Promise.resolve(result);
                            };

	                        return write('paymentAdditionalData', additionalData)
                                .then(function () {
                                    return write('paymentExtensionAttributes', extensionAttributes);
                                })
		                            .then(function () {
		                                if (methodCode === 'purchaseorder') {
		                                    return write('poNumber', poNumber);
		                                }
		                                return true;
		                            })
                                .then(function () {
                                    if (!hookData) {
                                        return false;
                                    }

                                    return syncPlaceOrderHookData(wire, hookData, true);
                                })
                                .then(function (hookChanged) {
                                    return changed || !!hookChanged;
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
                                input,
                                userPayment = paymentMethodSync.getUserSelectedPaymentMethod
                                    ? paymentMethodSync.getUserSelectedPaymentMethod()
                                    : '',
                                userPaymentFresh = paymentMethodSync.isUserPaymentSelectionFresh &&
                                    paymentMethodSync.isUserPaymentSelectionFresh();

                            if (!methodCode) {
                                persistPaymentMethodToCheckoutData(null);
                                syncPaymentMethodToMagewire(null);
                                hidePaymentPlaceholders();
                                return;
                            }

                            // Stale KO re-select of a previous method while shopper just picked another.
                            if (
                                userPaymentFresh &&
                                userPayment &&
                                !paymentMethodCodesEqual(methodCode, userPayment)
                            ) {
                                return;
                            }

                            // Re-selection of the already-synced method is a no-op for Magewire.
                            // Magento/KO often re-fire select with a new object reference after
                            // every totals/shipping morph; without this guard we spam XHR.
                            if (paymentMethodSync.isSynced(methodCode)) {
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
                                updateActiveRendererClass(methodCode, methodCode);
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
                                methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode(),
                                dataChanged = false,
                                methodChanged = false;

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
                                            .then(function (changed) {
                                                var currentMagewireMethod = getProperty(wire, 'paymentMethod');

                                                dataChanged = !!changed;
                                                if (
                                                    methodCode &&
                                                    methodCode !== currentMagewireMethod &&
                                                    !paymentMethodSync.isSynced(methodCode) &&
                                                    typeof wire.call === 'function'
                                                ) {
                                                    methodChanged = true;
                                                    paymentMethodSync.markSynced(methodCode);
                                                    return wire.call('selectPaymentMethod', methodCode);
                                                }
                                                if (methodCode) {
                                                    paymentMethodSync.markSynced(methodCode);
                                                }
                                                return true;
                                            })
                                            .then(function () {
                                                // Already on this payment with unchanged payload — skip idle refresh loop.
                                                if (!methodChanged && !dataChanged && paymentMethodSync.isSynced(methodCode || '')) {
                                                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                                        checkoutTotals.isLoading(false);
                                                    }
                                                    return true;
                                                }
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
                                }, 15000);

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
                                    if (!error || !error.fastcheckoutNativePaymentError) {
                                        handlePaymentError(error, component.messageContainer || getBridgeMessageContainer());
                                    }
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
                                }.bind(this), 15000);

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

                function rememberAndSelectPayment(methodCode) {
                    var generation;

                    if (!methodCode) {
                        return;
                    }
                    // Invalidate in-flight open retries for the previous method immediately.
                    pendingSelectedMethodCode = methodCode;
                    if (paymentMethodSync.rememberUserPaymentSelection) {
                        generation = paymentMethodSync.rememberUserPaymentSelection(methodCode);
                    }
                    // Drop hold on the previously loading method so its panel can close.
                    if (
                        paymentPanelHoldCode &&
                        !paymentMethodCodesEqual(paymentPanelHoldCode, methodCode)
                    ) {
                        holdPaymentPanel(methodCode, 2500);
                    }
                    // Reset debounce so a different method always applies even within 1.5s.
                    if (methodCode !== lastSetSelectedMethodCode) {
                        lastSetSelectedMethodAt = 0;
                    }
                    setSelectedMethod(methodCode);
                    return generation;
                }

                document.addEventListener('change', function (event) {
                    if (event.target && event.target.name === 'payment_method') {
                        rememberAndSelectPayment(event.target.value);
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
                        if (paymentMethodSync.rememberUserPaymentSelection) {
                            paymentMethodSync.rememberUserPaymentSelection(event.target.value);
                        }
                        window.setTimeout(function () {
                            rememberAndSelectPayment(event.target.value);
                        }, 0);
                        return;
                    }

                    if (option) {
                        input = option.querySelector('input[name="payment_method"]');
                        if (input && !input.disabled) {
                            input.checked = true;
                            if (paymentMethodSync.rememberUserPaymentSelection) {
                                paymentMethodSync.rememberUserPaymentSelection(input.value);
                            }
                            window.setTimeout(function () {
                                rememberAndSelectPayment(input.value);
                            }, 0);
                        }
                    }
                }, true);

                /**
                 * Snapshot of method codes only (not allowed/selected flags).
                 * Same codes ⇒ card structure is stable and can be patched in place.
                 */
                function getPaymentOptionCodesSignature(rootEl) {
                    return Array.from(rootEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                        return el.getAttribute('data-fastcheckout-payment-option') || '';
                    }).filter(Boolean).sort().join(',');
                }

                /**
                 * Copy allowed/selected flags from Livewire's incoming HTML onto the live card
                 * without morphing wire:ignore KO containers.
                 *
                 * Option show/hide is deferred to applyPaymentOptionVisibility() so the previously
                 * open KO panel is not collapsed before setSelectedMethod opens the next one.
                 */
                function applyPaymentCardStateInPlace(fromEl, toEl) {
                    var userPayment = paymentMethodSync.getUserSelectedPaymentMethod
                            ? paymentMethodSync.getUserSelectedPaymentMethod()
                            : '',
                        userPaymentFresh = paymentMethodSync.isUserPaymentSelectionFresh &&
                            paymentMethodSync.isUserPaymentSelectionFresh(),
                        liveChecked = fromEl.querySelector(
                            'input[name="payment_method"]:checked:not([disabled])'
                        ),
                        liveCheckedCode = liveChecked ? liveChecked.value : '',
                        preferredCode = '';

                    // Prefer shopper pick, then currently checked live radio, then server HTML.
                    if (userPaymentFresh && userPayment) {
                        preferredCode = userPayment;
                    } else if (liveCheckedCode) {
                        preferredCode = liveCheckedCode;
                    }

                    Array.from(toEl.querySelectorAll('[data-fastcheckout-payment-option]')).forEach(function (toOption) {
                        var methodCode = toOption.getAttribute('data-fastcheckout-payment-option'),
                            fromOption,
                            toInput,
                            fromInput,
                            allowed,
                            selected;

                        if (!methodCode) {
                            return;
                        }

                        fromOption = fromEl.querySelector(
                            '[data-fastcheckout-payment-option="' + methodCode + '"]'
                        );
                        if (!fromOption) {
                            return;
                        }

                        allowed = toOption.getAttribute('data-fastcheckout-payment-allowed') === '1';
                        toInput = toOption.querySelector('input[name="payment_method"]');
                        fromInput = fromOption.querySelector('input[name="payment_method"]');

                        if (preferredCode) {
                            selected = allowed && paymentMethodCodesEqual(methodCode, preferredCode);
                        } else {
                            selected = !!(toInput && toInput.checked && allowed);
                        }

                        // If preferred became disallowed, fall back to server-selected allowed method.
                        if (preferredCode && paymentMethodCodesEqual(methodCode, preferredCode) && !allowed) {
                            selected = false;
                        }

                        fromOption.setAttribute('data-fastcheckout-payment-allowed', allowed ? '1' : '0');

                        if (fromInput) {
                            fromInput.disabled = !allowed;
                            fromInput.checked = selected;
                        }
                    });

                    // If preferred was disallowed, apply server checked state for remaining options.
                    if (
                        preferredCode &&
                        !fromEl.querySelector(
                            'input[name="payment_method"]:checked:not([disabled])'
                        )
                    ) {
                        Array.from(toEl.querySelectorAll('[data-fastcheckout-payment-option]')).forEach(function (toOption) {
                            var methodCode = toOption.getAttribute('data-fastcheckout-payment-option'),
                                fromOption,
                                toInput,
                                fromInput,
                                allowed;

                            if (!methodCode) {
                                return;
                            }
                            fromOption = fromEl.querySelector(
                                '[data-fastcheckout-payment-option="' + methodCode + '"]'
                            );
                            toInput = toOption.querySelector('input[name="payment_method"]');
                            fromInput = fromOption
                                ? fromOption.querySelector('input[name="payment_method"]')
                                : null;
                            allowed = toOption.getAttribute('data-fastcheckout-payment-allowed') === '1';
                            if (fromInput && allowed && toInput && toInput.checked) {
                                fromInput.checked = true;
                            }
                        });
                    }
                }

                /**
                 * Apply option row visibility from data-fastcheckout-payment-allowed after the
                 * active KO panel has been switched (avoids empty gap during shipping remap).
                 */
                function applyPaymentOptionVisibility(rootEl) {
                    var root = rootEl || document.querySelector('[wire\\:key="checkout-payment-methods-card"]'),
                        hasAvailable = false,
                        emptyMessage,
                        grid;

                    if (!root) {
                        return false;
                    }

                    emptyMessage = root.querySelector('[data-fastcheckout-no-payment-methods]');
                    grid = root.querySelector('[wire\\:key="checkout-payment-methods-grid"]') ||
                        root.querySelector('.grid');

                    Array.from(root.querySelectorAll('[data-fastcheckout-payment-option]')).forEach(function (option) {
                        var allowed = option.getAttribute('data-fastcheckout-payment-allowed') === '1';

                        if (allowed) {
                            option.style.display = '';
                            option.removeAttribute('aria-hidden');
                            hasAvailable = true;
                        } else {
                            option.style.display = 'none';
                            option.setAttribute('aria-hidden', 'true');
                        }
                    });

                    if (grid) {
                        if (hasAvailable) {
                            grid.classList.remove('hidden');
                        } else {
                            grid.classList.add('hidden');
                        }
                    }

                    if (emptyMessage) {
                        if (hasAvailable) {
                            emptyMessage.classList.add('hidden');
                            emptyMessage.style.display = 'none';
                            emptyMessage.setAttribute('aria-hidden', 'true');
                        } else {
                            emptyMessage.classList.remove('hidden');
                            emptyMessage.style.display = '';
                            emptyMessage.removeAttribute('aria-hidden');
                        }
                    }

                    return hasAvailable;
                }

                /**
                 * Park non-active KO renderers in the off-DOM root before a structural morph.
                 * Keep the selected method's panel mounted to avoid content flicker.
                 */
                function moveRenderersBackToRoot(keepMethodCode) {
                    var root = document.getElementById('fastcheckout-ko-payment-root');

                    hidePaymentPlaceholders(keepMethodCode);
                    if (!root) {
                        return;
                    }

                    document.querySelectorAll('.payment-method').forEach(function (element) {
                        var host = element.closest('[data-fastcheckout-payment-method-ko-target]'),
                            hostMethod = host ? host.getAttribute('data-fastcheckout-payment-method-ko-target') : '';

                        if (
                            keepMethodCode &&
                            hostMethod &&
                            paymentMethodCodesEqual(hostMethod, keepMethodCode)
                        ) {
                            return;
                        }

                        if (element.parentNode !== root) {
                            root.appendChild(element);
                        }
                    });
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('element.updating', function (fromEl, toEl) {
                        if (fromEl.getAttribute('wire:key') !== 'checkout-payment-methods-card') {
                            return;
                        }

                        var fromMethodCodes = getPaymentOptionCodesSignature(fromEl),
                            toMethodCodes = getPaymentOptionCodesSignature(toEl),
                            keepCode = '',
                            toChecked,
                            fromChecked;

                        // Same payment options in the form — only allowed/selected flags changed.
                        // Patch attributes in place and skip morph so KO content stays open.
                        if (fromMethodCodes && fromMethodCodes === toMethodCodes) {
                            applyPaymentCardStateInPlace(fromEl, toEl);
                            return false;
                        }

                        toChecked = toEl.querySelector(
                            'input[name="payment_method"]:checked:not([disabled])'
                        );
                        if (toChecked && toChecked.value) {
                            keepCode = toChecked.value;
                        } else {
                            fromChecked = fromEl.querySelector(
                                'input[name="payment_method"]:checked:not([disabled])'
                            );
                            if (
                                fromChecked &&
                                fromChecked.value &&
                                toEl.querySelector(
                                    '[data-fastcheckout-payment-option="' + fromChecked.value + '"]' +
                                    '[data-fastcheckout-payment-allowed="1"]'
                                )
                            ) {
                                keepCode = fromChecked.value;
                            }
                        }

                        moveRenderersBackToRoot(keepCode);
                    });

                    window.Livewire.hook('message.processed', function () {
                        var magewireEl = document.querySelector('[wire\\:id]'),
                            wire = magewireEl && magewireEl.__livewire ? magewireEl.__livewire : null,
                            wirePayment = wire ? String(getProperty(wire, 'paymentMethod') || '') : '',
                            code = getSelectedMethodCode(),
                            quotePayment = paymentMethodSync.getQuoteCode(),
                            userPayment = paymentMethodSync.getUserSelectedPaymentMethod
                                ? paymentMethodSync.getUserSelectedPaymentMethod()
                                : '',
                            userPaymentFresh = paymentMethodSync.isUserPaymentSelectionFresh &&
                                paymentMethodSync.isUserPaymentSelectionFresh(),
                            preferUserPayment = !!(
                                userPaymentFresh &&
                                userPayment &&
                                domHasPaymentMethod(userPayment)
                            );

                        // Align KO quote with Magewire BEFORE syncPaymentMethods().
                        // Otherwise a stale quote method that is no longer allowed triggers
                        // hidePaymentPlaceholders() and causes open → close → open flicker.
                        // Prefer a fresh shopper payment pick over lagging wire state (reversion fix).
                        if (preferUserPayment) {
                            code = userPayment;
                            document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                                if (input.disabled) {
                                    input.checked = false;
                                    return;
                                }
                                input.checked = paymentMethodCodesEqual(input.value, userPayment);
                            });
                            setQuotePaymentMethodFromBridge({ method: userPayment });
                            if (wirePayment && paymentMethodCodesEqual(wirePayment, userPayment)) {
                                paymentMethodSync.markSynced(userPayment);
                            } else if (
                                paymentMethodSync.syncToMagewire &&
                                !paymentMethodSync.isSynced(userPayment)
                            ) {
                                // Push user choice if server still has the previous method.
                                paymentMethodSync.syncToMagewire({ method: userPayment });
                            }
                        } else if (
                            wirePayment &&
                            domHasPaymentMethod(wirePayment) &&
                            (
                                !paymentMethodSync.shouldAcceptPaymentSelection ||
                                paymentMethodSync.shouldAcceptPaymentSelection(wirePayment)
                            )
                        ) {
                            code = wirePayment;
                            document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                                if (input.disabled) {
                                    input.checked = false;
                                    return;
                                }
                                input.checked = paymentMethodCodesEqual(input.value, wirePayment);
                            });
                            paymentMethodSync.markSynced(wirePayment);
                            setQuotePaymentMethodFromBridge({ method: wirePayment });
                        } else if (!wirePayment) {
                            // Transient empty wire payment during morph — keep existing sync if quote still holds a method.
                            if (!quotePayment) {
                                paymentMethodSync.markSynced('');
                            } else if (domHasPaymentMethod(quotePayment)) {
                                code = quotePayment;
                            }
                        }

                        // User payment no longer available after shipping→payment remap — drop lock.
                        if (
                            userPayment &&
                            !domHasPaymentMethod(userPayment) &&
                            paymentMethodSync.clearUserPaymentSelection
                        ) {
                            paymentMethodSync.clearUserPaymentSelection();
                            if (wirePayment && domHasPaymentMethod(wirePayment)) {
                                code = wirePayment;
                            }
                        }

                        syncPaymentMethods();
                        syncQuoteTotalsFromDom();

                        runPatchRenderers();
                        // Reveal the selected option row before opening KO content. After a
                        // shipping→payment remap the new method may still be display:none from
                        // the previous filter, so content opened inside it would stay invisible.
                        if (code) {
                            document.querySelectorAll('[data-fastcheckout-payment-option]').forEach(function (option) {
                                var optionCode = option.getAttribute('data-fastcheckout-payment-option'),
                                    allowed = option.getAttribute('data-fastcheckout-payment-allowed') === '1';

                                if (allowed && paymentMethodCodesEqual(optionCode, code)) {
                                    option.style.display = '';
                                    option.removeAttribute('aria-hidden');
                                }
                            });
                        }
                        // Open/switch KO panel, then collapse remaining disallowed rows.
                        setSelectedMethod(code);
                        applyPaymentOptionVisibility();

                        if (wire) {
                            var currentMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod'),
                                userMethod = shippingMethodSync &&
                                    typeof shippingMethodSync.getUserSelectedShippingMethod === 'function'
                                    ? shippingMethodSync.getUserSelectedShippingMethod()
                                    : '',
                                userFresh = shippingMethodSync &&
                                    typeof shippingMethodSync.isUserShippingSelectionFresh === 'function' &&
                                    shippingMethodSync.isUserShippingSelectionFresh();

                            syncAddressToKnockout(wire);

                            // Keep KO on the locked user method. If a lagging Livewire response
                            // left wire on the previous rate, re-assert the lock once (coalesced).
                            if (userFresh && userMethod) {
                                syncSelectedShippingMethodToKnockout(userMethod);
                                if (
                                    currentMethod !== userMethod &&
                                    shippingMethodSync &&
                                    typeof shippingMethodSync.reassertLockedMethodToMagewireIfNeeded === 'function'
                                ) {
                                    shippingMethodSync.reassertLockedMethodToMagewireIfNeeded();
                                }
                            } else if (currentMethod) {
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
                        var namespace = String(scriptModule).split('/')[0];

                        if (!/^(Magento_|Kkkonrad_)/.test(namespace)) {
                            return;
                        }
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
