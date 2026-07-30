define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/hyva/region-country-guard',
    'Kkkonrad_Fastcheckout/js/hyva/renderer-manager',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-provider-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/address-attributes-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/form-data-collector',
    'Kkkonrad_Fastcheckout/js/hyva/payment-message-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/payment-validation-registry',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-compatibility-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-compatibility',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-data-persistence',
    'Kkkonrad_Fastcheckout/js/hyva/guest-address-snapshot',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-totals-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-layout-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-state-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/payment-dom-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/place-order-hooks-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-attributes-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-component-fallbacks',
    'Kkkonrad_Fastcheckout/js/hyva/payment-method-sync',
    'Kkkonrad_Fastcheckout/js/hyva/customer-email-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-agreements-fallback',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-method-sync',
    'Kkkonrad_Fastcheckout/js/hyva/shipping-error-bridge',
    'Kkkonrad_Fastcheckout/js/hyva/step-navigator-bridge'
], function (
    $,
    regionCountryGuard,
    createRendererManager,
    createCheckoutProviderBridge,
    createAddressAttributesBridge,
    formDataCollector,
    createPaymentMessageBridge,
    createPaymentValidationRegistry,
    createShippingCompatibilityBridge,
    checkoutCompatibility,
    createCheckoutDataPersistence,
    guestAddressSnapshot,
    createCheckoutTotalsSync,
    createCheckoutLayoutBridge,
    createCheckoutStateBridge,
    createPaymentDomBridge,
    createPlaceOrderHooksBridge,
    createShippingAttributesSync,
    createCheckoutComponentFallbacks,
    createPaymentMethodSync,
    createCustomerEmailSync,
    checkoutAgreementsFallback,
    createShippingMethodSync,
    createShippingErrorBridge,
    createStepNavigatorBridge
) {
    'use strict';

    // Third-party payment modules are written for Luma, where jQuery is a page global and
    // both `jQuery` and `$` are available to inline scripts and widget callbacks. Under
    // RequireJS jQuery registers as an AMD module and sets `window.jQuery` but not `window.$`,
    // so gateway snippets using the `$` shorthand break on Hyvä. Alias it once, without
    // clobbering anything a theme or another library may already own.
    if (typeof window.$ === 'undefined' && typeof window.jQuery !== 'undefined') {
        window.$ = window.jQuery;
    }

    return function (config) {
        if (window.fastcheckoutKoCheckoutBridgeInitialized || window.fastcheckoutKoPaymentBridgeInitialized) {
            return;
        }

        window.fastcheckoutKoCheckoutBridgeInitialized = true;
        window.fastcheckoutKoPaymentBridgeInitialized = true;
        
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
            }),
                persistedSeparateBillingRestored = false;

            if (
                guestAddressSnapshot &&
                typeof guestAddressSnapshot.bindAutoSnapshot === 'function'
            ) {
                guestAddressSnapshot.bindAutoSnapshot();
            }

            /**
             * Re-fill full shipping address from previous order snapshot into:
             * checkout-data → quote → checkoutProvider → visible form fields.
             *
             * Important: Magento country <select> loads ~200 options asynchronously.
             * Restoring (especially writing dictionaries / country_id) before that
             * leaves the country field permanently empty. Wait until options exist.
             */
            function restorePersistedSeparateBillingAddress() {
                var selectedBillingAddress,
                    billingAddressData,
                    billingAddress;

                if (persistedSeparateBillingRestored) {
                    return false;
                }

                if (!checkoutData || typeof checkoutData.getSelectedBillingAddress !== 'function') {
                    return false;
                }

                selectedBillingAddress = checkoutData.getSelectedBillingAddress();
                if (selectedBillingAddress !== 'new-customer-billing-address') {
                    return false;
                }

                billingAddressData = typeof checkoutData.getNewCustomerBillingAddress === 'function'
                    ? checkoutData.getNewCustomerBillingAddress()
                    : null;
                if (
                    (!billingAddressData || !Object.keys(billingAddressData).length) &&
                    typeof checkoutData.getBillingAddressFromData === 'function'
                ) {
                    billingAddressData = checkoutData.getBillingAddressFromData();
                }
                if (!billingAddressData || !Object.keys(billingAddressData).length) {
                    return false;
                }

                try {
                    billingAddress = addressConverter.formAddressDataToQuoteAddress(billingAddressData);
                    selectBillingAddressAction(billingAddress);
                    checkoutProviderBridge.syncAddressData(billingAddressData, 'billing');
                    persistedSeparateBillingRestored = true;

                    return true;
                } catch (billingRestoreError) {
                    return false;
                }
            }

            function restorePreviousGuestShippingAddress(forceQuote) {
                var restoredShipping = false;

                try {
                    restoredShipping = guestAddressSnapshot.restore({
                        quote: quote,
                        checkoutData: checkoutData,
                        selectShippingAddress: selectShippingAddressAction,
                        selectBillingAddress: selectBillingAddressAction,
                        addressConverter: addressConverter,
                        syncProvider: function (formData, type) {
                            if (checkoutProviderBridge &&
                                typeof checkoutProviderBridge.syncAddressData === 'function') {
                                checkoutProviderBridge.syncAddressData(formData, type);
                            }
                        },
                        force: forceQuote === true
                    });
                } catch (restoreErr) {
                    restoredShipping = false;
                }

                return restorePersistedSeparateBillingAddress() || restoredShipping;
            }

            function countryFieldReady() {
                try {
                    var countryComp = registry && typeof registry.get === 'function'
                        ? registry.get(
                            'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id'
                        )
                        : null;
                    var opts = countryComp && typeof countryComp.options === 'function'
                        ? (countryComp.options() || [])
                        : [];
                    if (opts.length > 10) {
                        return true;
                    }
                } catch (e) {
                    // fall through to DOM check
                }
                var el = document.querySelector(
                    '.fastcheckout-native-shipping-address select[name="country_id"], select[name="country_id"]'
                );
                return !!(el && el.options && el.options.length > 10);
            }

            function scheduleGuestAddressRestore() {
                var attempts = 0,
                    maxAttempts = 40, // ~20s
                    timer,
                    finished = false;

                function userStoppedRestore() {
                    return !!(
                        guestAddressSnapshot &&
                        typeof guestAddressSnapshot.hasUserTouchedDestination === 'function' &&
                        guestAddressSnapshot.hasUserTouchedDestination()
                    );
                }

                function tick() {
                    if (finished || userStoppedRestore()) {
                        return;
                    }
                    attempts += 1;
                    // Always try to repair country option list if something wiped it.
                    try {
                        if (checkoutProviderBridge &&
                            typeof checkoutProviderBridge.ensureCountryDictionary === 'function') {
                            checkoutProviderBridge.ensureCountryDictionary();
                        }
                    } catch (repairErr) {
                        // ignore
                    }
                    if (countryFieldReady()) {
                        if (userStoppedRestore()) {
                            return;
                        }
                        restorePreviousGuestShippingAddress(false);
                        // One more pass after KO finishes re-rendering — cancelled if
                        // the shopper changes country before this timer fires.
                        window.setTimeout(function () {
                            if (userStoppedRestore()) {
                                return;
                            }
                            restorePreviousGuestShippingAddress(false);
                            try {
                                if (checkoutProviderBridge &&
                                    typeof checkoutProviderBridge.ensureCountryDictionary === 'function') {
                                    checkoutProviderBridge.ensureCountryDictionary();
                                }
                            } catch (e2) {
                                // ignore
                            }
                        }, 400);
                        finished = true;
                        return;
                    }
                    if (attempts < maxAttempts) {
                        timer = window.setTimeout(tick, 500);
                    } else {
                        // Last resort: restore text fields even if country never loaded.
                        if (!userStoppedRestore()) {
                            restorePreviousGuestShippingAddress(false);
                        }
                        try {
                            if (checkoutProviderBridge &&
                                typeof checkoutProviderBridge.ensureCountryDictionary === 'function') {
                                checkoutProviderBridge.ensureCountryDictionary();
                            }
                        } catch (e3) {
                            // ignore
                        }
                        finished = true;
                    }
                }

                // Listen for country/region/postcode edits before delayed restore runs.
                if (
                    guestAddressSnapshot &&
                    typeof guestAddressSnapshot.bindDestinationTouchGuard === 'function'
                ) {
                    guestAddressSnapshot.bindDestinationTouchGuard();
                }

                // Do NOT restore immediately — wait for directory options.
                if (registry && typeof registry.async === 'function') {
                    registry.async(
                        'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id'
                    )(function () {
                        window.setTimeout(tick, 50);
                    });
                }
                window.setTimeout(tick, 300);
            }

            scheduleGuestAddressRestore();
            window.addEventListener('fastcheckout:address-fields-ready', function () {
                if (
                    guestAddressSnapshot &&
                    typeof guestAddressSnapshot.hasUserTouchedDestination === 'function' &&
                    guestAddressSnapshot.hasUserTouchedDestination()
                ) {
                    return;
                }
                if (countryFieldReady()) {
                    restorePreviousGuestShippingAddress(false);
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
                stepNavigator: stepNavigator,
                nativeShippingComponent: Boolean(
                    config.shippingAddress &&
                    config.shippingAddress.component === 'Magento_Checkout/js/view/shipping'
                )
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
                    getCheckoutErrorsComponent: getCheckoutErrorsComponent,
                    hasConfiguredEmailComponent: Boolean(
                        config.shippingAddressChildren && config.shippingAddressChildren['customer-email']
                    )
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
                var paymentDomBridge = createPaymentDomBridge({
                    compareMethodCodes: paymentMethodCodesEqual
                });
                var checkoutStateBridge = createCheckoutStateBridge({
                    config: config,
                    paymentService: paymentService,
                    methodConverter: methodConverter,
                    quote: quote,
                    shippingService: shippingService,
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
                        persistEmailToCheckoutData: persistEmailToCheckoutData
                    }
                });
                var placeOrderHooksBridge = createPlaceOrderHooksBridge({
                    placeOrderHooks: placeOrderHooks
                });
                var shippingAttributesSync = createShippingAttributesSync({
                    checkoutData: checkoutData,
                    quote: quote,
                    getShippingMethodCode: getShippingMethodCode,
                    collectStructuredFields: collectFastcheckoutStructuredFields,
                    getShippingFormRoots: getFastcheckoutShippingFormRoots,
                    getCheckoutProvider: getCheckoutProvider,
                    normalizeAddressAttributeMap: normalizeAddressAttributeMap,
                    getAddressAttributes: getAddressAttributes,
                    updateQuoteAddressAttributes: updateQuoteAddressAttributes
                });
                var paymentMethodSync = createPaymentMethodSync({
                    quote: quote,
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

                function loadShippingRatesValidationComponents(onLoaded) {
                    paymentValidationRegistry.loadShippingRatesValidationComponents(onLoaded);
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
                // Delayed KO callbacks can close the just-opened method
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
                    window.setTimeout(annotateStandardAddressFields, 0);
                }

                function annotateStandardAddressFields() {
                    var shippingMap = {
                            // Guest email uses name="email" (not username) for autofill safety.
                            email: 'email',
                            username: 'email',
                            firstname: 'firstname',
                            lastname: 'lastname',
                            company: 'company',
                            city: 'city',
                            postcode: 'postcode',
                            country_id: 'countryId',
                            region_id: 'regionId',
                            region: 'region',
                            telephone: 'telephone',
                            prefix: 'prefix',
                            middlename: 'middlename',
                            suffix: 'suffix',
                            fax: 'fax',
                            vat_id: 'vatId'
                        },
                        billingMap = {
                            firstname: 'billingFirstname',
                            lastname: 'billingLastname',
                            company: 'billingCompany',
                            city: 'billingCity',
                            postcode: 'billingPostcode',
                            country_id: 'billingCountryId',
                            region_id: 'billingRegionId',
                            region: 'billingRegion',
                            telephone: 'billingTelephone',
                            prefix: 'billingPrefix',
                            middlename: 'billingMiddlename',
                            suffix: 'billingSuffix',
                            fax: 'billingFax',
                            vat_id: 'billingVatId'
                        };

                    function annotate(root, map, streetPrefix) {
                        if (!root) {
                            return;
                        }

                        Array.prototype.slice.call(root.querySelectorAll('input[name], select[name], textarea[name]')).forEach(function (input) {
                            var name = input.getAttribute('name') || '',
                                streetMatch = name.match(/^street\[(\d+)]$/),
                                field = map[name] || '';

                            if (streetMatch) {
                                field = streetPrefix + (parseInt(streetMatch[1], 10) + 1);
                            }
                            if (field) {
                                input.setAttribute('data-fastcheckout-field', field);
                            }
                        });
                    }

                    annotate(
                        document.querySelector('.fastcheckout-native-shipping-address'),
                        shippingMap,
                        'street'
                    );
                    Array.prototype.slice.call(document.querySelectorAll('.payment-method-billing-address')).forEach(function (root) {
                        annotate(root, billingMap, 'billingStreet');
                    });

                    if (document.querySelector('.fastcheckout-native-shipping-address [data-fastcheckout-field="firstname"]')) {
                        window.fastcheckoutAddressFieldsReady = true;
                        window.dispatchEvent(new CustomEvent('fastcheckout:address-fields-ready'));
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

                function syncPaymentMethods() {
                    return checkoutStateBridge.syncPaymentMethods();
                }

                syncPaymentMethods();
                syncQuoteTotalsFromConfig();
                syncQuoteTotalsFromDom();
                // 1) Apply SSR rates immediately (no network).
                // 2) Defer any native estimate until KO has painted address fields.
                // shipping-rate-service re-estimates whenever quote.shippingAddress changes.
                var scheduleShippingRatesBootstrap = (function createShippingRatesBootstrap() {
                    var hadSsrRates = checkoutStateBridge.applyInitialShippingRates();
                    var refreshSingleSelectedSsrRate = hadSsrRates &&
                        Boolean(window.fastcheckoutInitialShippingMethod) &&
                        Array.isArray(window.fastcheckoutInitialShippingRates) &&
                        window.fastcheckoutInitialShippingRates.length === 1;
                    var seedCountry = (window.checkoutConfig && window.checkoutConfig.defaultCountryId) ||
                        (window.fastcheckoutDefaultDestination && window.fastcheckoutDefaultDestination.countryId) ||
                        '';
                    var dest = window.fastcheckoutDefaultDestination || {};

                    function seedQuoteShippingAddress(allowEstimate) {
                        if (
                            !seedCountry ||
                            !quote ||
                            typeof quote.shippingAddress !== 'function'
                        ) {
                            return;
                        }
                        // Already have a shopper address (restored snapshot or typed).
                        // Require more than bare country so default-destination seed does not
                        // block guest restore, and does not wipe a restored full address.
                        var existing = quote.shippingAddress();
                        if (
                            existing &&
                            (
                                String(existing.firstname || '').trim() ||
                                String(existing.postcode || '').trim() ||
                                String(existing.city || '').trim() ||
                                (existing.street && existing.street[0])
                            )
                        ) {
                            if (
                                allowEstimate &&
                                typeof quote.shippingAddress.valueHasMutated === 'function'
                            ) {
                                // An early restored address estimate was intentionally
                                // suppressed until the KO form painted. Re-notify the
                                // native rate service now with the complete address.
                                quote.shippingAddress.valueHasMutated();
                            }
                            return;
                        }
                        if (existing && existing.countryId && existing.firstname) {
                            return;
                        }
                        require([
                            'Magento_Checkout/js/model/address-converter',
                            'Magento_Checkout/js/action/select-shipping-address'
                        ], function (addressConverter, selectShippingAddressAction) {
                            var quoteAddress = addressConverter.formAddressDataToQuoteAddress({
                                country_id: seedCountry,
                                postcode: dest.postcode || '',
                                region_id: dest.regionId || '',
                                city: dest.city || '',
                                street: ['', '']
                            });
                            // When SSR already painted rates, lock the list so the seed
                            // address write does not flash a re-estimate; later real
                            // address edits re-estimate normally.
                            if (!allowEstimate) {
                                window.fastcheckoutLockShippingRatesList = true;
                            }
                            try {
                                selectShippingAddressAction(quoteAddress);
                            } finally {
                                if (!allowEstimate) {
                                    window.setTimeout(function () {
                                        window.fastcheckoutLockShippingRatesList = false;
                                    }, 100);
                                }
                            }
                        });
                    }

                    function startAfterAddressRender() {
                        // Magento can retain only the selected grouped quote rate. Keep it
                        // visible immediately, but refresh once so the full list returns.
                        if (hadSsrRates && !refreshSingleSelectedSsrRate) {
                            seedQuoteShippingAddress(false);
                            return;
                        }

                        // A restored shopper address is selected by the address-ready
                        // handler and already triggers the native rate processor. Only
                        // seed the default destination when no full address exists.
                        seedQuoteShippingAddress(true);
                    }

                    return function schedule() {
                        var queued = false,
                            fallbackTimer;

                        function queueAfterPaint() {
                            if (queued) {
                                return;
                            }
                            queued = true;
                            if (fallbackTimer) {
                                window.clearTimeout(fallbackTimer);
                            }

                            window.setTimeout(startAfterAddressRender, 0);
                        }

                        window.addEventListener(
                            'fastcheckout:address-fields-ready',
                            queueAfterPaint,
                            { once: true }
                        );
                        fallbackTimer = window.setTimeout(queueAfterPaint, 1500);
                    };
                })();
                loadShippingRatesValidationComponents(function () {
                    // In the two-phase bootstrap the shipping component can initialize
                    // before carrier validator modules register their observable fields.
                    // Re-running initFields after registration binds country/region/city
                    // changes while the validator's shared timers still coalesce requests.
                    shippingRatesValidator.initFields(
                        'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset'
                    );
                });

                /**
                 * The standard Magento UI layout can start hundreds of AMD modules and
                 * text! template requests. Mounting payment, CAPTCHA and discount
                 * components together with shipping makes their requests compete with
                 * the address field templates, especially over HTTP/1.1.
                 *
                 * Give the shipping fieldset one paint of its own. Payment components
                 * still start automatically as soon as the address inputs exist, so no
                 * user interaction is required and the payment area is ready while the
                 * shopper fills the form.
                 */
                function scheduleDeferredPaymentComponents() {
                    var queued = false,
                        startedAt = Date.now(),
                        readinessTimer;

                    function startPaymentComponents() {
                        if (window.fastcheckoutDeferredPaymentComponentsStarted) {
                            return;
                        }

                        window.fastcheckoutDeferredPaymentComponentsStarted = true;
                        loadPaymentValidationComponents();
                        app({
                            components: {
                                [scope]: {
                                    component: 'uiComponent',
                                    children: checkoutLayoutBridge.paymentRegionChildren
                                }
                            }
                        });
                        window.dispatchEvent(
                            new CustomEvent('fastcheckout:payment-components-started')
                        );
                    }

                    function queueAfterShippingPaint() {
                        if (queued) {
                            return;
                        }
                        queued = true;
                        if (readinessTimer) {
                            window.clearTimeout(readinessTimer);
                        }

                        window.setTimeout(startPaymentComponents, 0);
                    }

                    function pollShippingReadiness() {
                        var hasShippingInput = !!document.querySelector(
                            '.fastcheckout-native-shipping-address input[name="firstname"]'
                        );

                        if (
                            window.fastcheckoutAddressFieldsReady ||
                            hasShippingInput ||
                            Date.now() - startedAt >= 10000
                        ) {
                            queueAfterShippingPaint();
                            return;
                        }
                        readinessTimer = window.setTimeout(pollShippingReadiness, 250);
                    }

                    window.addEventListener(
                        'fastcheckout:address-fields-ready',
                        queueAfterShippingPaint,
                        { once: true }
                    );
                    readinessTimer = window.setTimeout(pollShippingReadiness, 250);
                }

                scheduleShippingRatesBootstrap();
                scheduleDeferredPaymentComponents();

                [0, 50, 250, 750, 1500, 3000].forEach(function (delay) {
                    window.setTimeout(checkoutLayoutBridge.aliasStandardShippingRegistryPaths, delay);
                    window.setTimeout(annotateStandardAddressFields, delay);
                    window.setTimeout(function () {
                        getCheckoutProvider();
                        if (delay === 750) {
                            getShippingAddressComponent();
                            getBillingAddressComponent();
                        }
                        registerCheckoutProviderAddressAttributeSync();
                    }, delay);
                });

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

                /**
                 * True when an address actually carries shopper-entered data. The billing
                 * form embedded in Magento payment renderers exists but is never exposed by
                 * Fastcheckout, so it stays an empty address object — which must not be read
                 * as a real "separate billing address".
                 */
                function hasMeaningfulAddressData(addressData) {
                    var street;

                    if (!addressData) {
                        return false;
                    }

                    street = addressData.street;
                    if (Array.isArray(street)) {
                        street = street.join('').trim();
                    } else {
                        street = street ? String(street).trim() : '';
                    }

                    return Boolean(
                        String(addressData.firstname || '').trim() ||
                        String(addressData.lastname || '').trim() ||
                        String(addressData.postcode || '').trim() ||
                        String(addressData.city || '').trim() ||
                        street
                    );
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

                    return {};
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

                function syncShippingAttributes() {
                    return shippingAttributesSync.sync();
                }

                function registerKoStateAdapter() {
                    if (!quote || window.fastcheckoutKoStateAdapterRegistered) {
                        return;
                    }

                    window.fastcheckoutKoStateAdapterRegistered = true;

                    if (typeof quote.paymentMethod === 'function') {
                        quote.paymentMethod.subscribe(function (method) {
                            var methodCode,
                                userPayment;

                            if (paymentMethodSync.isApplyingFromBridge() || !method) {
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

                            if (!methodCode || paymentMethodSync.isSynced(methodCode)) {
                                return;
                            }

                            paymentMethodSync.persistSelection(method);
                            paymentMethodSync.markSynced(methodCode);
                        });
                    }
                }
                registerKoStateAdapter();

                function normalizeStreetForCompare(street) {
                    var lines = Array.isArray(street) ? street.slice() : (street ? [street] : []);

                    // Drop trailing empty lines so ["Foo 1", ""] matches ["Foo 1"].
                    while (lines.length && String(lines[lines.length - 1] || '').trim() === '') {
                        lines.pop();
                    }

                    return lines.map(function (line) {
                        return String(line || '').trim();
                    });
                }

                function addressesMatch(currentAddress, newAddress) {
                    if (!currentAddress || !newAddress) {
                        return false;
                    }

                    return String(currentAddress.countryId || '') === String(newAddress.countryId || '') &&
                        String(currentAddress.postcode || '') === String(newAddress.postcode || '') &&
                        String(currentAddress.city || '') === String(newAddress.city || '') &&
                        JSON.stringify(normalizeStreetForCompare(currentAddress.street)) ===
                            JSON.stringify(normalizeStreetForCompare(newAddress.street)) &&
                        String(currentAddress.regionId || '') === String(newAddress.regionId || '') &&
                        String(currentAddress.region || '') === String(newAddress.region || '') &&
                        String(currentAddress.firstname || '') === String(newAddress.firstname || '') &&
                        String(currentAddress.lastname || '') === String(newAddress.lastname || '') &&
                        String(currentAddress.telephone || '') === String(newAddress.telephone || '');
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

                function persistShippingMethodNow(methodCode) {
                    return shippingMethodSync.persistSelectionNow(methodCode);
                }

                function persistShippingMethod(methodCode) {
                    shippingMethodSync.persistSelection(methodCode);
                }

                function rememberUserShippingSelection(methodCode) {
                    if (shippingMethodSync && typeof shippingMethodSync.rememberUserShippingSelection === 'function') {
                        shippingMethodSync.rememberUserShippingSelection(methodCode);
                    }
                }

                function resolveShippingInformationAction(originalAction) {
                    return originalAction();
                }

                var lastShippingRateEstimateKey = '';
                var shippingRateEstimatePromise = null;
                var lastShippingRateEstimateRates = [];

                /**
                 * REST AddressInterface requires an integer region_id. Undefined is
                 * intentionally used for countries without directory regions because
                 * JSON.stringify then omits the optional property.
                 */
                function normalizeRegionIdForRest(value) {
                    var normalized = String(value == null ? '' : value).trim(),
                        parsed;

                    if (!/^\d+$/.test(normalized)) {
                        return undefined;
                    }

                    parsed = parseInt(normalized, 10);

                    return parsed > 0 ? parsed : undefined;
                }

                /**
                 * Native Magento estimate-shipping-methods (REST).
                 * Used by processors / bridge callers that still hit onEstimateShippingRatesAction.
                 */
                function resolveShippingRatesEstimate(address) {
                    var addressData = getCurrentShippingAddressData(address),
                        estimateKey = JSON.stringify({
                            countryId: addressData.countryId || addressData.country_id || '',
                            regionId: addressData.regionId || addressData.region_id || '',
                            region: addressData.region || '',
                            postcode: addressData.postcode || '',
                            city: addressData.city || '',
                            street: addressData.street || []
                        }),
                        estimatePromise;

                    if (!validateShippingRatesAddress(address, false)) {
                        if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                            shippingService.isLoading(false);
                        }
                        if (shippingService && typeof shippingService.setShippingRates === 'function') {
                            shippingService.setShippingRates([]);
                        }

                        return Promise.resolve([]);
                    }

                    if (estimateKey === lastShippingRateEstimateKey) {
                        if (shippingRateEstimatePromise) {
                            return shippingRateEstimatePromise;
                        }

                        return Promise.resolve(
                            shippingService.getShippingRates()().length
                                ? shippingService.getShippingRates()()
                                : lastShippingRateEstimateRates
                        );
                    }

                    lastShippingRateEstimateKey = estimateKey;

                    // Direct Magento REST estimate (same contract as shipping-rate-processor/new-address).
                    estimatePromise = new Promise(function (resolve, reject) {
                        require([
                            'jquery',
                            'mage/storage',
                            'mage/url',
                            'Magento_Checkout/js/model/resource-url-manager',
                            'Magento_Checkout/js/model/quote',
                            'Magento_Checkout/js/model/shipping-rate-registry',
                            'Magento_Checkout/js/model/shipping-service'
                        ], function ($, storage, urlBuilder, resourceUrlManager, quoteModel, rateRegistry, shippingSvc) {
                            var serviceUrl,
                                payload,
                                cacheKey,
                                cache,
                                settled = false;

                            function done(rates) {
                                if (settled) {
                                    return;
                                }
                                settled = true;
                                rates = Array.isArray(rates) ? rates : [];
                                lastShippingRateEstimateRates = rates;
                                if (shippingSvc && typeof shippingSvc.setShippingRates === 'function') {
                                    shippingSvc.setShippingRates(rates);
                                }
                                if (shippingSvc && shippingSvc.isLoading) {
                                    shippingSvc.isLoading(false);
                                }
                                resolve(rates);
                            }

                            function fail(response) {
                                if (settled) {
                                    return;
                                }
                                settled = true;
                                if (shippingSvc && typeof shippingSvc.setShippingRates === 'function') {
                                    shippingSvc.setShippingRates([]);
                                }
                                if (shippingSvc && shippingSvc.isLoading) {
                                    shippingSvc.isLoading(false);
                                }
                                reject(response || new Error('Could not estimate shipping rates.'));
                            }

                            try {
                                cacheKey = address && typeof address.getCacheKey === 'function'
                                    ? address.getCacheKey()
                                    : estimateKey;
                                cache = cacheKey && rateRegistry ? rateRegistry.get(cacheKey) : false;
                                if (cache) {
                                    done(cache);
                                    return;
                                }

                                if (shippingSvc && shippingSvc.isLoading) {
                                    shippingSvc.isLoading(true);
                                }

                                serviceUrl = resourceUrlManager.getUrlForEstimationShippingMethodsForNewAddress(quoteModel);
                                payload = JSON.stringify({
                                    address: {
                                        street: address.street || addressData.street || [],
                                        city: address.city || addressData.city || '',
                                        region_id: normalizeRegionIdForRest(
                                            address.regionId || addressData.regionId
                                        ),
                                        region: address.region || addressData.region || '',
                                        country_id: address.countryId || addressData.countryId || '',
                                        postcode: address.postcode || addressData.postcode || '',
                                        email: address.email || '',
                                        customer_id: address.customerId || '',
                                        firstname: address.firstname || '',
                                        lastname: address.lastname || '',
                                        middlename: address.middlename || '',
                                        prefix: address.prefix || '',
                                        suffix: address.suffix || '',
                                        vat_id: address.vatId || '',
                                        company: address.company || '',
                                        telephone: address.telephone || '',
                                        fax: address.fax || '',
                                        custom_attributes: address.customAttributes || {},
                                        save_in_address_book: address.saveInAddressBook || 0
                                    }
                                });

                                storage.post(serviceUrl, payload, false, 'application/json')
                                    .done(function (result) {
                                        result = Array.isArray(result) ? result : [];
                                        if (cacheKey && rateRegistry) {
                                            rateRegistry.set(cacheKey, result);
                                        }
                                        done(result);
                                    })
                                    .fail(function (response) {
                                        fail(response);
                                    });
                            } catch (e) {
                                fail(e);
                            }
                        }, function (err) {
                            reject(err || new Error('Shipping estimate modules unavailable'));
                        });
                    }).finally(function () {
                        if (shippingRateEstimatePromise === estimatePromise) {
                            shippingRateEstimatePromise = null;
                        }
                    });
                    shippingRateEstimatePromise = estimatePromise;

                    return estimatePromise;
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

                function persistPaymentMethodSelection(paymentMethod) {
                    paymentMethodSync.persistSelection(paymentMethod);
                }

                function prepareCheckoutState() {
                    syncQuoteCustomerData();

                    return syncShippingAttributes().then(function () {
                        if (
                            !(quote.isVirtual && quote.isVirtual()) &&
                            (!quote.shippingAddress() || !quote.shippingMethod())
                        ) {
                            return true;
                        }

                        syncPaymentMethods();
                        return true;
                    });
                }

                function clearShippingFieldError() {
                    shippingErrorBridge.clear();
                }

                function showShippingFieldError(methodCode, carrierCode, errorMessage) {
                    shippingErrorBridge.show(methodCode, carrierCode, errorMessage);
                }

                function focusShippingValidationError(scrollStart) {
                    var errors = document.querySelectorAll(
                            '.fastcheckout-native-shipping-address [aria-invalid="true"], ' +
                            '.fastcheckout-native-shipping-address .admin__field._error input:not([type="hidden"]), ' +
                            '.fastcheckout-native-shipping-address .admin__field._error select, ' +
                            '.fastcheckout-native-shipping-address .field._error input:not([type="hidden"]), ' +
                            '.fastcheckout-native-shipping-address .field._error select, ' +
                            '.fastcheckout-native-shipping-address .admin__field-error, ' +
                            '.fastcheckout-native-shipping-address .field-error, ' +
                            '.fastcheckout-native-shipping-address .mage-error, ' +
                            '[data-fastcheckout-shipping-methods] .field-error, ' +
                            '[data-fastcheckout-shipping-methods] .mage-error, ' +
                            '[data-fastcheckout-shipping-methods] [role="alert"]'
                        ),
                        target = Array.prototype.filter.call(errors, function (element) {
                            return element.offsetParent !== null && (
                                element.matches('[aria-invalid="true"]') ||
                                String(element.textContent || '').trim() !== ''
                            );
                        }).shift(),
                        start = Number.isFinite(Number(scrollStart))
                            ? Number(scrollStart)
                            : window.pageYOffset,
                        startedAt = Date.now(),
                        rect,
                        destination;

                    if (!target) {
                        return;
                    }

                    rect = target.getBoundingClientRect();
                    destination = Math.max(
                        0,
                        window.pageYOffset + rect.top -
                            ((window.innerHeight - rect.height) / 2)
                    );
                    window.scrollTo(0, start);

                    if (typeof target.focus === 'function') {
                        try {
                            target.focus({ preventScroll: true });
                        } catch (e) {
                            // Error labels are valid scroll targets but may not be focusable.
                        }
                    }

                    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                        window.scrollTo(0, destination);
                        return;
                    }

                    startedAt = Date.now();
                    window.setTimeout(function animate() {
                        var progress;

                        progress = Math.min((Date.now() - startedAt) / 400, 1);
                        window.scrollTo(
                            0,
                            start + (destination - start) * progress * (2 - progress)
                        );

                        if (progress < 1) {
                            window.setTimeout(animate, 16);
                        }
                    }, 0);
                }

                window.fastcheckoutHyvaShipping = {
                    syncShippingMethod: syncSelectedShippingMethodToKnockout,
                    persistShippingMethod: persistShippingMethod,
                    persistShippingMethodNow: persistShippingMethodNow,
                    applyPaymentRemapForShipping: function (methodCode) {
                        if (
                            shippingMethodSync &&
                            typeof shippingMethodSync.applyPaymentRemapForShipping === 'function'
                        ) {
                            return shippingMethodSync.applyPaymentRemapForShipping(methodCode);
                        }
                    },
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
                        var addressData,
                            addressType = shippingAddress &&
                                typeof shippingAddress.getType === 'function'
                                ? shippingAddress.getType()
                                : '';

                        // The quote address object survives a country change, so it can still
                        // carry the previous country's region_id. Everything downstream is built
                        // from it — checkout-data, the provider and, crucially, the REST payloads
                        // for estimate-shipping-methods / shipping-information. Sanitise it in
                        // place (this is the same object selectShippingAddressAction just stored
                        // on the quote) so no request goes out with a region from another country.
                        regionCountryGuard.dropRegionFromOtherCountry(shippingAddress);

                        addressData = normalizeKoAddressData(shippingAddress);

                        if (addressType && addressType !== 'new-customer-address') {
                            if (
                                checkoutData &&
                                typeof checkoutData.setSelectedShippingAddress === 'function' &&
                                typeof shippingAddress.getKey === 'function'
                            ) {
                                checkoutData.setSelectedShippingAddress(shippingAddress.getKey());
                            }
                        } else {
                            persistAddressToCheckoutData(addressData, 'shipping');
                        }
                        syncAddressDataToCheckoutProvider(addressData, 'shipping');
                        syncCheckoutProviderAddressAttributes();

                        return syncShippingAttributes();
                    },
                    onSelectBillingAddressAction: function (billingAddress) {
                        var addressData = normalizeKoAddressData(billingAddress);

                        if (!billingAddress) {
                            return Promise.resolve(false);
                        }

                        persistAddressToCheckoutData(addressData, 'billing');
                        syncAddressDataToCheckoutProvider(addressData, 'billing');
                        syncCheckoutProviderAddressAttributes();

                        return Promise.resolve(true);
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

                        persistShippingMethod(code);
                        // Avoid standard shipping-view select side-effects (extra rate
                        // recollect / setShippingInformation races that bounced the radio).
                    },
                    onSetShippingInformationAction: function (originalAction) {
                        return resolveShippingInformationAction(originalAction);
                    },
                    onEstimateShippingRatesAction: function (address) {
                        return resolveShippingRatesEstimate(address);
                    },
                    syncDomAttributes: function () {
                        return syncShippingAttributes();
                    },
                    registerValidator: registerShippingValidator,
                    focusFirstInvalidField: focusShippingValidationError,
                    onRecollectShippingRatesAction: function (originalAction) {
                        if (
                            window.fastcheckoutLockShippingRatesList ||
                            window.fastcheckoutSelectingShippingMethod
                        ) {
                            return Promise.resolve(null);
                        }

                        return originalAction();
                    },
                    setError: function (methodCode, message) {
                        showShippingFieldError(methodCode, '', message);
                    },
                    clearError: clearShippingFieldError,
                    validate: function () {
                        var activeMethod = quote.shippingMethod();

                        // ----------------------------------------------------------------
                        // Phase 1: Run address/KO validators FIRST (shipping-compatibility-
                        // bridge registers the standard Magento shipping view validator here,
                        // which validates email + address fields and sets inline KO errors).
                        // Running address validation before the shipping-method check ensures
                        // that on a fresh/empty session the shopper sees address field errors,
                        // not "Please select a shipping method." Additionally, when an address
                        // validator already returns false it produces its own inline KO error
                        // messages so we must NOT also call showShippingFieldError -- that
                        // would create a second, duplicate error banner.
                        // ----------------------------------------------------------------
                        if (window.fastcheckoutCustomShippingValidators && window.fastcheckoutCustomShippingValidators.length > 0) {
                            for (var j = 0; j < window.fastcheckoutCustomShippingValidators.length; j++) {
                                var preValidator = window.fastcheckoutCustomShippingValidators[j];
                                // Only run address-oriented validators first (flagged with
                                // .fastcheckoutKoShippingView === true by shipping-compatibility-bridge).
                                if (
                                    preValidator &&
                                    preValidator.fastcheckoutKoShippingView === true &&
                                    typeof preValidator === 'function'
                                ) {
                                    try {
                                        if (preValidator(activeMethod) === false) {
                                            // Address validation failed. Do NOT show a shipping-method
                                            // error on top -- the KO form fields already paint inline
                                            // errors. Signal failure back to handleSubmit.
                                            return false;
                                        }
                                    } catch (preErr) {
                                        if (window.console && typeof window.console.error === 'function') {
                                            window.console.error('Kkkonrad Fastcheckout: Address validator error:', preErr);
                                        }
                                    }
                                }
                            }
                        }

                        // ----------------------------------------------------------------
                        // Phase 2: Validate shipping method selection + shipping-specific
                        // rules (InPost locker, etc.).
                        // ----------------------------------------------------------------
                        try {
                            clearShippingFieldError();
                            syncShippingAttributes();
                            var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked:not(:disabled)');

                            var carrierCode = '';
                            var methodCode = '';

                            // Require an explicit shipping-method radio selection in the Fastcheckout UI.
                            if (!checkedDomRadio || !checkedDomRadio.value) {
                                var missingMethodMessage = $t('Please select a shipping method.');

                                showShippingFieldError('', '', missingMethodMessage);

                                // Expose for the checkout submit fallback banner.
                                window.fastcheckoutLastShippingValidationError = missingMethodMessage;

                                return false;
                            }

                            window.fastcheckoutLastShippingValidationError = '';

                            if (checkedDomRadio && checkedDomRadio.value) {
                                var parsedMethod = splitShippingMethodCode(checkedDomRadio.value);
                                carrierCode = parsedMethod.carrier_code;
                                methodCode = parsedMethod.method_code;
                            } else if (activeMethod) {
                                carrierCode = activeMethod.carrier_code || '';
                                methodCode = activeMethod.method_code || '';
                            }

                            // InPost locker point selection validation
                            var fullMethodCode = (methodCode + '_' + carrierCode).toLowerCase();
                            var isInPostLocker = carrierCode && (
                                fullMethodCode.indexOf('inpostlocker') !== -1 ||
                                fullMethodCode.indexOf('paczkomat') !== -1 ||
                                (
                                    fullMethodCode.indexOf('inpost') !== -1 &&
                                    (
                                        fullMethodCode.indexOf('locker') !== -1 ||
                                        fullMethodCode.indexOf('box') !== -1 ||
                                        fullMethodCode.indexOf('point') !== -1
                                    )
                                )
                            );
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

                        // ----------------------------------------------------------------
                        // Phase 3: Remaining (non-address) custom shipping validators.
                        // ----------------------------------------------------------------
                        if (window.fastcheckoutCustomShippingValidators && window.fastcheckoutCustomShippingValidators.length > 0) {
                            for (var i = 0; i < window.fastcheckoutCustomShippingValidators.length; i++) {
                                var validator = window.fastcheckoutCustomShippingValidators[i];
                                // Skip address validators already executed in Phase 1.
                                if (validator && validator.fastcheckoutKoShippingView === true) {
                                    continue;
                                }
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
                    // instead of letting the radio bounce.
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
                    persistShippingMethod(code);
                });

                shippingService.getShippingRates().subscribe(function () {
                    var userMethod,
                        currentMethod,
                        preferred = '';

                    // Prefer the user's fresh choice while rates rebind.
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

                    currentMethod = quote && typeof quote.shippingMethod === 'function'
                        ? getShippingMethodCode(quote.shippingMethod())
                        : '';
                    if (!preferred && currentMethod) {
                        preferred = currentMethod;
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

                    bindNativePaymentValidationFields(root);

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
                        '.fastcheckout-actions-toolbar-hidden'
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
                var sharedAfterMethodsObserver = null;
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

                function isSharedBillingAddressEnabled() {
                    return Boolean(
                        window.checkoutConfig &&
                        window.checkoutConfig.displayBillingOnPaymentMethod === false
                    );
                }

                function updateSharedAfterMethodsVisibility(billingAddress, target) {
                    if (!target) {
                        return;
                    }

                    target.classList.toggle('hidden', !billingAddress);
                    target.style.display = billingAddress ? 'block' : 'none';
                    target.setAttribute('aria-hidden', billingAddress ? 'false' : 'true');
                }

                /**
                 * Magento mounts the shared billing address in payment.afterMethods when
                 * checkout/options/display_billing_address_on is set to the payment page.
                 * The KO renderer root stays hidden because it also owns inactive payment
                 * renderers. Move only the already-bound billing element: afterMethods can
                 * also contain discount or third-party components rendered elsewhere.
                 */
                function mountSharedAfterMethodsRegion() {
                    var region = document.querySelector(
                            '[data-fastcheckout-ko-after-methods-region]'
                        ),
                        target = document.querySelector(
                            '[data-fastcheckout-shared-billing-target]'
                        ),
                        billingAddress;

                    if (!region || !target || !isSharedBillingAddressEnabled()) {
                        updateSharedAfterMethodsVisibility(null, target);
                        return false;
                    }

                    if (!sharedAfterMethodsObserver && typeof window.MutationObserver === 'function') {
                        sharedAfterMethodsObserver = new MutationObserver(function () {
                            mountSharedAfterMethodsRegion();
                        });
                        sharedAfterMethodsObserver.observe(region, {
                            childList: true,
                            subtree: true
                        });
                    }

                    // Wait until KO has processed the virtual foreach. Moving the element
                    // before binding would detach it from the uiComponent scope.
                    billingAddress = target.querySelector('.checkout-billing-address') ||
                        region.querySelector('.checkout-billing-address');
                    if (!billingAddress) {
                        updateSharedAfterMethodsVisibility(null, target);
                        return false;
                    }

                    if (billingAddress.parentNode !== target) {
                        target.appendChild(billingAddress);
                    }

                    updateSharedAfterMethodsVisibility(billingAddress, target);
                    return true;
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
                            mountSharedAfterMethodsRegion();
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

                    // Already mirrored in the quote: refresh the panel only when content is open.
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
                    var selectedMethod = getSelectedMethodCode(),
                        selectedTarget,
                        roots = getActivePaymentFormRoots(),
                        input = null;

                    if (selectedMethod) {
                        Array.prototype.slice.call(document.querySelectorAll(
                            '[data-fastcheckout-payment-method-ko-target]'
                        )).some(function (target) {
                            if (!paymentMethodCodesEqual(
                                target.getAttribute('data-fastcheckout-payment-method-ko-target'),
                                selectedMethod
                            )) {
                                return false;
                            }

                            input = target.querySelector('input[name="payment[po_number]"], #po_number');
                            if (input) {
                                selectedTarget = target;
                            }

                            return !!input;
                        });
                        if (selectedTarget && input) {
                            return input;
                        }
                    }

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
                            (
                                dataValidate &&
                                /(?:required(?:-entry|-number)?|validate-one-required(?:-by-name)?)['"]?\s*:\s*true/.test(
                                    dataValidate
                                )
                            )
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
                    errorElement.style.visibility = 'visible';
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

                /**
                 * KO inserts payment forms after Magento's global validation bootstrap.
                 * Bind their declared validation rules when a renderer is annotated.
                 */
                function bindNativePaymentValidationFields(root) {
                    if (!root || typeof root.querySelectorAll !== 'function') {
                        return;
                    }

                    Array.prototype.slice.call(root.querySelectorAll(
                        'input[data-validate], select[data-validate], textarea[data-validate], ' +
                        'input[required], select[required], textarea[required], ' +
                        '[aria-required="true"]'
                    )).forEach(function (input) {
                        if (input.getAttribute('data-fastcheckout-validation-bound') === 'true') {
                            return;
                        }

                        input.setAttribute('data-fastcheckout-validation-bound', 'true');
                        input.addEventListener('blur', function () {
                            validateNativeMagentoField(input);
                        });
                        input.addEventListener('input', function () {
                            if (
                                input.getAttribute('aria-invalid') === 'true' &&
                                !isNativeFieldEmpty(input)
                            ) {
                                validateNativeMagentoField(input);
                            }
                        });
                    });
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
                            input.classList.remove('mage-error');
                            input.setAttribute('aria-invalid', 'false');
                            clearNativeFieldErrorFallback(input);
                        }

                        return isValid;
                    }

                    if (
                        $.validator &&
                        typeof $.validator.validateSingleElement === 'function'
                    ) {
                        isValid = $.validator.validateSingleElement(input);
                        if (!isValid) {
                            scheduleNativeFieldErrorMessage(input, getRequiredFieldMessage(input));
                        }

                        return isValid;
                    }

                    if (isNativeRequiredField(input) && isNativeFieldEmpty(input)) {
                        ensureNativeFieldErrorMessage(input, getRequiredFieldMessage(input));
                        return false;
                    }

                    input.removeAttribute('aria-invalid');
                    clearNativeFieldErrorFallback(input);
                    return true;
                }

                function validateActivePaymentFields() {
                    var fields = [],
                        isValid = true;

                    getActivePaymentFormRoots().forEach(function (root) {
                        Array.prototype.slice.call(root.querySelectorAll(
                            'input[data-validate], select[data-validate], textarea[data-validate], ' +
                            'input[required], select[required], textarea[required], ' +
                            '[aria-required="true"]'
                        )).forEach(function (field) {
                            if (fields.indexOf(field) === -1) {
                                fields.push(field);
                            }
                        });
                    });

                    fields.forEach(function (field) {
                        if (!validateNativeMagentoField(field)) {
                            isValid = false;
                        }
                    });

                    return isValid;
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

                /**
                 * Magento billing-address components for the active (or any separate) payment form.
                 */
                function getBillingAddressComponentsForValidation() {
                    var methodCode = getSelectedMethodCode(),
                        components = [],
                        preferred = [],
                        shared = [];

                    if (!registry || typeof registry.filter !== 'function') {
                        return components;
                    }

                    components = registry.filter(function (component) {
                        return Boolean(
                            component &&
                            component.source &&
                            component.dataScopePrefix &&
                            String(component.dataScopePrefix).indexOf('billingAddress') === 0 &&
                            typeof component.isAddressSameAsShipping === 'function' &&
                            typeof component.updateAddress === 'function' &&
                            // Skip Fastcheckout fallback stub (no real form fields).
                            component.name !== 'fastcheckout.billingAddress'
                        );
                    }) || [];

                    if (isSharedBillingAddressEnabled()) {
                        shared = components.filter(function (component) {
                            return component.dataScopePrefix === 'billingAddressshared' ||
                                (
                                    component.name &&
                                    String(component.name).indexOf('billing-address-form') !== -1 &&
                                    String(component.name).indexOf('afterMethods') !== -1
                                );
                        });

                        if (shared.length) {
                            return shared;
                        }
                    }

                    if (methodCode) {
                        preferred = components.filter(function (component) {
                            return component.dataScopePrefix === 'billingAddress' + methodCode ||
                                (component.name && String(component.name).indexOf(methodCode) !== -1);
                        });

                        if (preferred.length) {
                            return preferred;
                        }
                    }

                    return components;
                }

                /**
                 * Resolve the real billing component owned by the selected payment method.
                 *
                 * @returns {Object|null}
                 */
                function getActiveBillingAddressComponent() {
                    var components = getBillingAddressComponentsForValidation();

                    return components.length ? components[0] : null;
                }

                /**
                 * Return the visible shared billing DOM or the form mounted for the
                 * active payment renderer. Never fall back to an arbitrary hidden
                 * renderer: each payment method owns a separate provider scope.
                 *
                 * @returns {HTMLElement|null}
                 */
                function getActiveBillingAddressRoot() {
                    var activeRoot = document.querySelector(
                            '.payment-method._active .payment-method-billing-address'
                        ),
                        sharedTarget = document.querySelector(
                            '[data-fastcheckout-shared-billing-target]'
                        ),
                        methodCode = getSelectedMethodCode(),
                        targets,
                        i,
                        root;

                    if (
                        isSharedBillingAddressEnabled() &&
                        sharedTarget &&
                        !sharedTarget.classList.contains('hidden') &&
                        sharedTarget.style.display !== 'none'
                    ) {
                        root = sharedTarget.querySelector(
                            '.checkout-billing-address, .payment-method-billing-address'
                        );
                        if (root) {
                            return root;
                        }
                    }

                    if (activeRoot) {
                        return activeRoot;
                    }

                    if (!methodCode) {
                        return null;
                    }

                    targets = document.querySelectorAll(
                        '[data-fastcheckout-payment-method-ko-target]'
                    );
                    for (i = 0; i < targets.length; i++) {
                        if (
                            !paymentMethodCodesEqual(
                                targets[i].getAttribute('data-fastcheckout-payment-method-ko-target'),
                                methodCode
                            ) ||
                            targets[i].classList.contains('hidden')
                        ) {
                            continue;
                        }

                        root = targets[i].querySelector('.payment-method-billing-address');
                        if (root) {
                            return root;
                        }
                    }

                    return null;
                }

                function isSeparateBillingAddressRequired(component) {
                    var explicitSeparate;

                    if (!component || typeof component.isAddressSameAsShipping !== 'function') {
                        return false;
                    }

                    // Same as shipping — no separate form validation needed.
                    if (component.isAddressSameAsShipping()) {
                        return false;
                    }

                    explicitSeparate = Boolean(
                        typeof component._fastcheckoutHasExplicitSeparateBilling === 'function' &&
                        component._fastcheckoutHasExplicitSeparateBilling()
                    );

                    // An intentional uncheck always owns the active form, even before the
                    // shopper edits a prefilled field. This makes Update/Place Order run
                    // Magento's standard billing validation and create a complete quote address.
                    if (explicitSeparate) {
                        return true;
                    }

                    // A renderer may transiently expose an unchecked, untouched form while
                    // checkout-data is restored. Only an explicit uncheck (handled above) or
                    // a genuinely used form should activate separate billing validation.
                    if (
                        component.fastcheckoutBillingValidation &&
                        component.fastcheckoutBillingValidation.interacted !== true
                    ) {
                        return false;
                    }

                    // Saved address selected without new-address form.
                    if (
                        typeof component.isAddressFormVisible === 'function' &&
                        !component.isAddressFormVisible() &&
                        typeof component.selectedAddress === 'function' &&
                        component.selectedAddress()
                    ) {
                        return true;
                    }

                    // New billing form is shown (details hidden after uncheck / edit).
                    if (
                        typeof component.isAddressDetailsVisible === 'function' &&
                        !component.isAddressDetailsVisible()
                    ) {
                        return true;
                    }

                    // Fallback: form visible in the active payment method only.
                    var activeBillingRoot = getActiveBillingAddressRoot();

                    return Boolean(
                        activeBillingRoot &&
                        activeBillingRoot.querySelector(
                            '.billing-address-form:not([style*="display: none"]), ' +
                            '[data-form="billing-new-address"]'
                        )
                    );
                }

                function isElementVisibleForFocus(element) {
                    if (!element || element.disabled) {
                        return false;
                    }

                    if (element.getClientRects && element.getClientRects().length > 0) {
                        return true;
                    }

                    return element.offsetParent !== null;
                }

                function focusElementCentered(element) {
                    if (!element) {
                        return false;
                    }

                    if (typeof element.scrollIntoView === 'function') {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    if (typeof element.focus === 'function') {
                        try {
                            element.focus({ preventScroll: true });
                        } catch (e) {
                            element.focus();
                        }
                    }

                    return true;
                }

                function focusInvalidBillingField() {
                    var root = getActiveBillingAddressRoot(),
                        invalid;

                    if (!root) {
                        return false;
                    }

                    invalid = root.querySelector(
                        '[aria-invalid="true"], ' +
                        '.admin__field._error input, ' +
                        '.admin__field._error select, ' +
                        '.field._error input, ' +
                        '.field._error select, ' +
                        '.admin__field-error, ' +
                        '.field-error'
                    );

                    return focusElementCentered(invalid);
                }

                /**
                 * Focus the first invalid checkout field in document order
                 * (shipping/email before billing/payment).
                 *
                 * @returns {Boolean}
                 */
                function focusFirstInvalidCheckoutField() {
                    var root = document.getElementById('fastcheckout-checkout') ||
                            document.getElementById('co-checkout-form') ||
                            document,
                        candidates,
                        i,
                        element;

                    candidates = root.querySelectorAll(
                        // Prefer real form controls with Magento/native invalid state.
                        'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], ' +
                        '.admin__field._error input:not([type="hidden"]), ' +
                        '.admin__field._error select, ' +
                        '.admin__field._error textarea, ' +
                        '.field._error input:not([type="hidden"]), ' +
                        '.field._error select, ' +
                        '.field._error textarea, ' +
                        'input.mage-error, select.mage-error, textarea.mage-error'
                    );

                    for (i = 0; i < candidates.length; i++) {
                        element = candidates[i];
                        if (isElementVisibleForFocus(element)) {
                            return focusElementCentered(element);
                        }
                    }

                    // Fallback: error labels / messages (scroll only).
                    candidates = root.querySelectorAll(
                        '.admin__field-error, .field-error, label.mage-error, div.mage-error, [role="alert"]'
                    );

                    for (i = 0; i < candidates.length; i++) {
                        element = candidates[i];
                        if (isElementVisibleForFocus(element)) {
                            return focusElementCentered(element);
                        }
                    }

                    return false;
                }

                /**
                 * Validate (and when valid, apply) the separate billing address form.
                 * Used on Place Order together with shipping validation.
                 *
                 * @param {Object} [options]
                 * @param {Boolean} [options.focus=true] Scroll/focus first invalid billing field.
                 * @returns {Boolean}
                 */
                /**
                 * Magento max_text_length fails on undefined street lines. Ensure optional
                 * billing street lines are empty strings before KO validation runs.
                 */
                function normalizeBillingStreetProviderData(component) {
                    var streetPath,
                        streetData,
                        key,
                        line;

                    if (!component || !component.source || !component.dataScopePrefix) {
                        return;
                    }

                    streetPath = component.dataScopePrefix + '.street';

                    if (typeof component.source.get !== 'function' || typeof component.source.set !== 'function') {
                        return;
                    }

                    streetData = component.source.get(streetPath);

                    if (Array.isArray(streetData)) {
                        for (line = 0; line < streetData.length; line++) {
                            if (streetData[line] == null) {
                                streetData[line] = '';
                            }
                        }
                        // Ensure at least two lines exist as empty strings.
                        if (streetData.length < 2) {
                            streetData.push('');
                        }
                        component.source.set(streetPath, streetData);
                        return;
                    }

                    if (streetData && typeof streetData === 'object') {
                        for (key in streetData) {
                            if (Object.prototype.hasOwnProperty.call(streetData, key) && streetData[key] == null) {
                                streetData[key] = '';
                            }
                        }
                        if (typeof streetData[0] === 'undefined' && typeof streetData['0'] === 'undefined') {
                            streetData[0] = '';
                        }
                        if (typeof streetData[1] === 'undefined' && typeof streetData['1'] === 'undefined') {
                            streetData[1] = '';
                        }
                        component.source.set(streetPath, streetData);
                    }
                }

                function validateBillingAddressForm(options) {
                    var components = getBillingAddressComponentsForValidation(),
                        isValid = true,
                        validatedSeparate = false,
                        shouldFocus = !(options && options.focus === false),
                        i,
                        component,
                        needsUpdate;

                    for (i = 0; i < components.length; i++) {
                        component = components[i];

                        if (!isSeparateBillingAddressRequired(component)) {
                            continue;
                        }

                        validatedSeparate = true;

                        if (typeof component._fastcheckoutAllowBillingValidation === 'function') {
                            component._fastcheckoutAllowBillingValidation();
                        }

                        if (typeof component._fastcheckoutNormalizeBillingStreetLines === 'function') {
                            component._fastcheckoutNormalizeBillingStreetLines();
                        }

                        if (typeof component._fastcheckoutGuardBillingFields === 'function') {
                            component._fastcheckoutGuardBillingFields();
                        }

                        normalizeBillingStreetProviderData(component);

                        if (component.source && typeof component.source.set === 'function') {
                            component.source.set('params.invalid', false);
                        }

                        // Magento updateAddress validates the form fields and, when valid,
                        // selects the quote billing address so place-order can continue.
                        if (typeof component.updateAddress === 'function') {
                            component.updateAddress();
                        } else if (
                            component.source &&
                            component.dataScopePrefix &&
                            typeof component.source.trigger === 'function'
                        ) {
                            component.source.trigger(component.dataScopePrefix + '.data.validate');

                            if (component.source.get(component.dataScopePrefix + '.custom_attributes')) {
                                component.source.trigger(
                                    component.dataScopePrefix + '.custom_attributes.data.validate'
                                );
                            }
                        }

                        needsUpdate = component.source &&
                            typeof component.source.get === 'function' &&
                            component.source.get('params.invalid') === true;

                        if (needsUpdate) {
                            isValid = false;
                        }
                    }

                    // DOM fallback when KO components are not registered yet but the
                    // shopper unchecked same-as-shipping and the form is empty/invalid.
                    if (!validatedSeparate) {
                        var activeBillingRoot = getActiveBillingAddressRoot(),
                            sameAsCheckbox = activeBillingRoot
                                ? activeBillingRoot.querySelector(
                                    'input[name="billing-address-same-as-shipping"]'
                                )
                                : null;

                        if (sameAsCheckbox && !sameAsCheckbox.checked) {
                            var requiredBillingInputs = activeBillingRoot.querySelectorAll(
                                '.billing-address-form input[name="firstname"], ' +
                                '.billing-address-form input[name="lastname"]'
                            );

                            Array.prototype.slice.call(requiredBillingInputs).forEach(function (input) {
                                if (input && !String(input.value || '').trim()) {
                                    isValid = false;
                                    input.setAttribute('aria-invalid', 'true');
                                }
                            });
                        }
                    }

                    if (!isValid && shouldFocus) {
                        focusInvalidBillingField();
                    }

                    // When the form is valid (or same-as-shipping), Magento payment
                    // renderers require quote.billingAddress() so isPlaceOrderActionAllowed
                    // becomes true. Unchecking same-as-shipping nulls it until Update.
                    if (isValid && !ensureQuoteBillingAddressForPlaceOrder()) {
                        isValid = false;
                    }

                    return isValid;
                }

                /**
                 * Active method checkbox: same-as-shipping (default true when missing).
                 */
                function isActiveBillingSameAsShipping() {
                    var component = getActiveBillingAddressComponent(),
                        explicitSeparate,
                        root,
                        checkbox;

                    if (component && typeof component.isAddressSameAsShipping === 'function') {
                        explicitSeparate = Boolean(
                            typeof component._fastcheckoutHasExplicitSeparateBilling === 'function' &&
                            component._fastcheckoutHasExplicitSeparateBilling()
                        );

                        if (!explicitSeparate) {
                            if (typeof component._fastcheckoutApplySameAsShippingDefault === 'function') {
                                component._fastcheckoutApplySameAsShippingDefault();
                            } else {
                                component.isAddressSameAsShipping(true);
                            }

                            return true;
                        }

                        return !!component.isAddressSameAsShipping();
                    }

                    root = getActiveBillingAddressRoot();
                    if (!root) {
                        return true;
                    }

                    checkbox = root.querySelector('input[name="billing-address-same-as-shipping"]');
                    if (!checkbox) {
                        return true;
                    }

                    return !!checkbox.checked;
                }

                function allowPlaceOrderOnActivePayment() {
                    var component = getActiveRenderer();

                    if (
                        component &&
                        component.isPlaceOrderActionAllowed &&
                        typeof component.isPlaceOrderActionAllowed === 'function'
                    ) {
                        try {
                            component.isPlaceOrderActionAllowed(true);
                        } catch (e) {
                            // ignore non-writable flags
                        }
                    }
                }

                /**
                 * Collect address fields from a form root (shipping or billing).
                 * Magento UI uses name="firstname", street[0], region_id, etc.
                 *
                 * @param {Element|null} root
                 * @returns {Object|null}
                 */
                function collectAddressFormDataFromRoot(root) {
                    var data = {},
                        street = {},
                        map = {
                            firstname: 'firstname',
                            lastname: 'lastname',
                            company: 'company',
                            city: 'city',
                            postcode: 'postcode',
                            telephone: 'telephone',
                            country_id: 'country_id',
                            region_id: 'region_id',
                            region: 'region'
                        },
                        key,
                        el,
                        street0,
                        street1;

                    if (!root || typeof root.querySelector !== 'function') {
                        return null;
                    }

                    for (key in map) {
                        if (!Object.prototype.hasOwnProperty.call(map, key)) {
                            continue;
                        }
                        el = root.querySelector(
                            'input[name="' + key + '"], select[name="' + key + '"], ' +
                            'input[name="' + map[key] + '"], select[name="' + map[key] + '"], ' +
                            // Magento UI component namespaced fields
                            'input[name$=".' + key + '"], select[name$=".' + key + '"], ' +
                            'input[name$="[' + key + ']"], select[name$="[' + key + ']"]'
                        );
                        if (el && String(el.value || '').trim() !== '') {
                            data[key] = el.value;
                        }
                    }

                    street0 = root.querySelector(
                        'input[name="street[0]"], input[name="street.0"], ' +
                        'input[name$=".street[0]"], input[name$=".street.0"], ' +
                        'input[name*="street"][name$="[0]"]'
                    );
                    street1 = root.querySelector(
                        'input[name="street[1]"], input[name="street.1"], ' +
                        'input[name$=".street[1]"], input[name$=".street.1"], ' +
                        'input[name*="street"][name$="[1]"]'
                    );
                    if (street0) {
                        street[0] = street0.value || '';
                    }
                    if (street1) {
                        street[1] = street1.value || '';
                    }
                    // Fallback: first visible street input if indexed names not found
                    if (!street[0]) {
                        el = root.querySelector(
                            'input[name="street"], input[name*="street"]:not([type="hidden"])'
                        );
                        if (el && String(el.value || '').trim() !== '') {
                            street[0] = el.value;
                        }
                    }
                    if (Object.keys(street).length) {
                        data.street = street;
                    }

                    if (
                        !data.firstname &&
                        !data.lastname &&
                        !data.postcode &&
                        !data.city &&
                        !(street[0] && String(street[0]).trim())
                    ) {
                        return null;
                    }

                    return data;
                }

                function collectBillingFormDataFromDom() {
                    var billingRoot = getActiveBillingAddressRoot(),
                        root = billingRoot
                            ? billingRoot.querySelector(
                                '.billing-address-form, [data-form="billing-new-address"]'
                            )
                            : null;

                    return collectAddressFormDataFromRoot(root);
                }

                function getAddressStreetLineOne(address) {
                    var street = address ? address.street : null;

                    if (Array.isArray(street)) {
                        return street.length ? street[0] : '';
                    }
                    if (street && typeof street === 'object') {
                        return typeof street[0] !== 'undefined' ? street[0] : street['0'];
                    }

                    return street || '';
                }

                function isRegionRequiredForBillingCountry(component, countryId) {
                    var countries,
                        match,
                        i;

                    if (
                        !countryId ||
                        !component ||
                        !component.source ||
                        typeof component.source.get !== 'function'
                    ) {
                        return false;
                    }

                    countries = component.source.get('dictionaries.country_id') || [];
                    for (i = 0; i < countries.length; i++) {
                        if (countries[i] && String(countries[i].value) === String(countryId)) {
                            match = countries[i];
                            break;
                        }
                    }

                    return Boolean(
                        match &&
                        (
                            match.is_region_required === true ||
                            match.is_region_required === 1 ||
                            match.is_region_required === '1'
                        )
                    );
                }

                /**
                 * QuoteValidator requires the complete billing identity, not merely countryId.
                 * The active UI component remains the authority for country-specific rules.
                 */
                function isCompleteQuoteBillingAddress(address, component) {
                    var countryId,
                        regionId,
                        region;

                    if (!address) {
                        return false;
                    }

                    countryId = address.countryId || address.country_id || '';
                    regionId = address.regionId || address.region_id || '';
                    region = address.region || '';

                    if (
                        !String(address.firstname || '').trim() ||
                        !String(address.lastname || '').trim() ||
                        !String(getAddressStreetLineOne(address) || '').trim() ||
                        !String(address.city || '').trim() ||
                        !String(address.postcode || '').trim() ||
                        !String(address.telephone || '').trim() ||
                        !String(countryId || '').trim()
                    ) {
                        return false;
                    }

                    if (
                        isRegionRequiredForBillingCountry(component, countryId) &&
                        !String(regionId || region || '').trim()
                    ) {
                        return false;
                    }

                    if (
                        component &&
                        component.source &&
                        typeof component.source.get === 'function' &&
                        component.source.get('params.invalid') === true
                    ) {
                        return false;
                    }

                    return true;
                }

                function collectShippingFormDataFromDom() {
                    var selectors = [
                            '.fastcheckout-native-shipping-address',
                            '#shipping',
                            '.checkout-shipping-address',
                            'form#co-shipping-form',
                            '[id="shipping"]',
                            '.opc-wrapper .shipping-address-item',
                            // Magento UI scope host used by Fastcheckout
                            '[data-bind*="shipping-step.shippingAddress"]'
                        ],
                        data = null,
                        i,
                        root,
                        emailEl;

                    for (i = 0; i < selectors.length; i++) {
                        root = document.querySelector(selectors[i]);
                        data = collectAddressFormDataFromRoot(root);
                        if (data) {
                            break;
                        }
                    }

                    if (data) {
                        emailEl = document.getElementById('customer-email') ||
                            document.getElementById('co-shipping-email') ||
                            document.querySelector(
                                '.fastcheckout-native-shipping-address input[type="email"], ' +
                                '#shipping input[type="email"], ' +
                                'input[name="username"], input[name="email"]'
                            );
                        if (emailEl && emailEl.value) {
                            data.email = emailEl.value;
                        }
                    }

                    return data;
                }

                function collectShippingFormDataFromProvider() {
                    var provider = getCheckoutProvider && getCheckoutProvider(),
                        data,
                        fromCheckoutData;

                    if (provider && typeof provider.get === 'function') {
                        data = provider.get('shippingAddress');
                        if (data && typeof data === 'object' && hasMeaningfulAddressData(data)) {
                            return $.extend(true, {}, data);
                        }
                    }

                    try {
                        if (checkoutData && typeof checkoutData.getShippingAddressFromData === 'function') {
                            fromCheckoutData = checkoutData.getShippingAddressFromData();
                            if (
                                fromCheckoutData &&
                                typeof fromCheckoutData === 'object' &&
                                hasMeaningfulAddressData(fromCheckoutData)
                            ) {
                                return $.extend(true, {}, fromCheckoutData);
                            }
                        }
                    } catch (e) {
                        // ignore
                    }

                    return null;
                }

                /**
                 * Merge address sources: form DOM / checkoutProvider win over sparse
                 * quote defaults (country-only seed from Magento destination).
                 *
                 * @returns {Object|null} form-style address data
                 */
                function collectShippingAddressDataForPlaceOrder() {
                    var quoteData = quote && typeof quote.shippingAddress === 'function'
                            ? normalizeKoAddressData(quote.shippingAddress())
                            : null,
                        providerData = collectShippingFormDataFromProvider(),
                        domData = collectShippingFormDataFromDom(),
                        merged = {};

                    // Start from quote so we keep country seed, then overlay real form data.
                    if (quoteData && typeof quoteData === 'object') {
                        $.extend(true, merged, quoteData);
                    }
                    if (providerData) {
                        $.extend(true, merged, providerData);
                    }
                    if (domData) {
                        $.extend(true, merged, domData);
                    }

                    // Normalize street to form-style object/array Magento converter accepts.
                    if (merged.street && Array.isArray(merged.street)) {
                        merged.street = {
                            0: merged.street[0] || '',
                            1: merged.street[1] || ''
                        };
                    }

                    // country_id aliases
                    if (merged.countryId && !merged.country_id) {
                        merged.country_id = merged.countryId;
                    }
                    if (merged.regionId && !merged.region_id) {
                        merged.region_id = merged.regionId;
                    }

                    if (!hasMeaningfulAddressData(merged)) {
                        return null;
                    }

                    return merged;
                }

                /**
                 * Push shopper shipping form into quote.shippingAddress before place-order.
                 * Without this, Magento placeOrder validates an empty server shipping address
                 * (only default country seed) and rejects firstname/lastname/street/etc.
                 *
                 * @returns {Boolean}
                 */
                function ensureQuoteShippingAddressForPlaceOrder() {
                    var current = quote && typeof quote.shippingAddress === 'function'
                            ? quote.shippingAddress()
                            : null,
                        currentType = current && typeof current.getType === 'function'
                            ? current.getType()
                            : '',
                        formData,
                        newAddress,
                        currentKey;

                    // A saved Magento address is authoritative. Merging the hidden new-address
                    // form into it turns it into a new-customer-address and deselects its card.
                    if (
                        currentType &&
                        currentType !== 'new-customer-address' &&
                        hasMeaningfulAddressData(normalizeKoAddressData(current))
                    ) {
                        currentKey = typeof current.getKey === 'function' ? current.getKey() : '';
                        if (
                            currentKey &&
                            checkoutData &&
                            typeof checkoutData.setSelectedShippingAddress === 'function'
                        ) {
                            checkoutData.setSelectedShippingAddress(currentKey);
                        }

                        return true;
                    }

                    formData = collectShippingAddressDataForPlaceOrder();

                    if (!formData) {
                        return !!(
                            quote &&
                            typeof quote.shippingAddress === 'function' &&
                            quote.shippingAddress() &&
                            hasMeaningfulAddressData(normalizeKoAddressData(quote.shippingAddress()))
                        );
                    }

                    try {
                        newAddress = addressConverter.formAddressDataToQuoteAddress(
                            $.extend(true, {}, formData)
                        );
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn(
                                'Kkkonrad Fastcheckout: could not convert shipping form data.',
                                e
                            );
                        }
                        return false;
                    }

                    if (!newAddress) {
                        return false;
                    }

                    if (!addressesMatch(current, newAddress) && typeof selectShippingAddressAction === 'function') {
                        selectShippingAddressAction(newAddress);
                    }

                    try {
                        persistAddressToCheckoutData(formData, 'shipping');
                        syncAddressDataToCheckoutProvider(normalizeKoAddressData(newAddress), 'shipping');
                    } catch (persistErr) {
                        // non-fatal
                    }

                    return !!(quote && quote.shippingAddress && quote.shippingAddress());
                }

                /**
                 * Resolve shipping method for place-order from quote, locked user
                 * selection, or checked DOM radio. Applies it to the quote when missing.
                 *
                 * @returns {Object|null} Magento rate-like object or null
                 */
                function ensureQuoteShippingMethodForPlaceOrder() {
                    var method = quote && typeof quote.shippingMethod === 'function'
                            ? quote.shippingMethod()
                            : null,
                        code = getShippingMethodCode(method),
                        radio,
                        rates,
                        found = null,
                        parts,
                        carrier;

                    if (!code) {
                        code = window.fastcheckoutHyvaShipping &&
                            typeof window.fastcheckoutHyvaShipping.getUserSelectedShippingMethod === 'function'
                            ? window.fastcheckoutHyvaShipping.getUserSelectedShippingMethod()
                            : '';
                    }

                    if (!code) {
                        radio = document.querySelector(
                            'input[name="shipping_method"]:checked, input[name="shipping_method"][checked]'
                        );
                        if (radio && radio.value) {
                            code = String(radio.value);
                        }
                    }

                    if (!code) {
                        return method && (method.method_code || method.methodCode) ? method : null;
                    }

                    rates = shippingService && typeof shippingService.getShippingRates === 'function'
                        ? (shippingService.getShippingRates()() || [])
                        : [];
                    rates.some(function (rate) {
                        if (rate && (rate.carrier_code + '_' + rate.method_code) === code) {
                            found = rate;
                            return true;
                        }
                        return false;
                    });

                    if (!found && window.fastcheckoutInitialShippingRates) {
                        (window.fastcheckoutInitialShippingRates || []).some(function (rate) {
                            if (rate && (rate.carrier_code + '_' + rate.method_code) === code) {
                                found = rate;
                                return true;
                            }
                            return false;
                        });
                    }

                    if (!found) {
                        parts = code.split('_');
                        carrier = parts.shift() || '';
                        found = {
                            carrier_code: carrier,
                            method_code: parts.length ? parts.join('_') : carrier
                        };
                    }

                    if (typeof selectShippingMethodAction === 'function') {
                        try {
                            selectShippingMethodAction(found);
                        } catch (e) {
                            // ignore
                        }
                    }

                    if (
                        window.fastcheckoutHyvaShipping &&
                        typeof window.fastcheckoutHyvaShipping.rememberUserShippingSelection === 'function'
                    ) {
                        window.fastcheckoutHyvaShipping.rememberUserShippingSelection(code);
                    }

                    return quote && typeof quote.shippingMethod === 'function'
                        ? quote.shippingMethod()
                        : found;
                }

                /**
                 * Persist shipping address + method on the server quote.
                 * Place-order validates the server-side shipping address, not only the
                 * client payload — so set-shipping-information must succeed first.
                 *
                 * @returns {Promise}
                 */
                function ensureShippingInformationForPlaceOrder() {
                    var shipping,
                        method;

                    ensureQuoteShippingAddressForPlaceOrder();
                    method = ensureQuoteShippingMethodForPlaceOrder();

                    shipping = quote && typeof quote.shippingAddress === 'function'
                        ? quote.shippingAddress()
                        : null;

                    if (!shipping || !hasMeaningfulAddressData(normalizeKoAddressData(shipping))) {
                        return Promise.reject(new Error(
                            translateFastcheckoutMessage(
                                'Please check the shipping address and try again.'
                            )
                        ));
                    }

                    if (!method || !(method.method_code || method.methodCode)) {
                        return Promise.reject(new Error(
                            translateFastcheckoutMessage(
                                'Please select a shipping method and try again.'
                            )
                        ));
                    }

                    // Billing must be present for set-shipping-information payload.
                    if (!ensureQuoteBillingAddressForPlaceOrder()) {
                        return Promise.reject(new Error(
                            translateFastcheckoutMessage(
                                'Please check the billing address and try again.'
                            )
                        ));
                    }

                    return new Promise(function (resolve, reject) {
                        var deferred;

                        try {
                            deferred = setShippingInformationAction();
                        } catch (e) {
                            reject(e);
                            return;
                        }

                        if (deferred && typeof deferred.done === 'function') {
                            deferred.done(function (result) {
                                resolve(result);
                            }).fail(function (response) {
                                var msg = response && response.responseJSON && response.responseJSON.message
                                    ? response.responseJSON.message
                                    : translateFastcheckoutMessage(
                                        'Please check the shipping address and try again.'
                                    );
                                reject(new Error(msg));
                            });
                            return;
                        }

                        Promise.resolve(deferred).then(resolve, reject);
                    });
                }

                /**
                 * Ensure quote.billingAddress is set before Magento payment placeOrder.
                 * - same as shipping → select shipping as billing
                 * - separate form → use address already selected by updateAddress, or
                 *   build from the active billing form provider data
                 *
                 * @returns {Boolean}
                 */
                function ensureQuoteBillingAddressForPlaceOrder() {
                    var shipping = quote && typeof quote.shippingAddress === 'function'
                            ? quote.shippingAddress()
                            : null,
                        billing,
                        sameAsShipping = isActiveBillingSameAsShipping(),
                        component = getActiveBillingAddressComponent(),
                        addressData,
                        newAddress,
                        domBilling;

                    if (sameAsShipping) {
                        if (shipping && typeof selectBillingAddressAction === 'function') {
                            selectBillingAddressAction(shipping);
                        }
                        billing = quote && typeof quote.billingAddress === 'function'
                            ? quote.billingAddress()
                            : null;
                        if (!isCompleteQuoteBillingAddress(billing, null)) {
                            return false;
                        }
                        allowPlaceOrderOnActivePayment();
                        return true;
                    }

                    if (!component || !isSeparateBillingAddressRequired(component)) {
                        return false;
                    }

                    if (
                        component.source &&
                        typeof component.source.set === 'function'
                    ) {
                        component.source.set('params.invalid', false);
                    }

                    if (typeof component._fastcheckoutAllowBillingValidation === 'function') {
                        component._fastcheckoutAllowBillingValidation();
                    }
                    if (typeof component._fastcheckoutNormalizeBillingStreetLines === 'function') {
                        component._fastcheckoutNormalizeBillingStreetLines();
                    }
                    normalizeBillingStreetProviderData(component);

                    if (typeof component.updateAddress === 'function') {
                        component.updateAddress();
                    } else if (
                        component.source &&
                        component.dataScopePrefix &&
                        typeof component.source.trigger === 'function'
                    ) {
                        component.source.trigger(component.dataScopePrefix + '.data.validate');
                    }

                    billing = quote && typeof quote.billingAddress === 'function'
                        ? quote.billingAddress()
                        : null;

                    if (isCompleteQuoteBillingAddress(billing, component)) {
                        allowPlaceOrderOnActivePayment();
                        return true;
                    }

                    // Provider fallback for renderers whose updateAddress does not select quote.
                    if (
                        component.source &&
                        component.dataScopePrefix &&
                        typeof component.source.get === 'function'
                    ) {
                        addressData = component.source.get(component.dataScopePrefix);
                        if (
                            addressData &&
                            typeof addressData === 'object' &&
                            component.source.get('params.invalid') !== true
                        ) {
                            try {
                                newAddress = addressConverter.formAddressDataToQuoteAddress(
                                    $.extend(true, {}, addressData)
                                );
                                if (newAddress && typeof selectBillingAddressAction === 'function') {
                                    selectBillingAddressAction(newAddress);
                                }
                            } catch (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn(
                                        'Kkkonrad Fastcheckout: could not apply billing form data to quote.',
                                        e
                                    );
                                }
                            }
                        }
                    }

                    billing = quote && typeof quote.billingAddress === 'function'
                        ? quote.billingAddress()
                        : null;
                    if (isCompleteQuoteBillingAddress(billing, component)) {
                        allowPlaceOrderOnActivePayment();
                        return true;
                    }

                    // Last resort: build billing from the active visible form only.
                    domBilling = collectBillingFormDataFromDom();
                    if (domBilling && typeof selectBillingAddressAction === 'function') {
                        try {
                            newAddress = addressConverter.formAddressDataToQuoteAddress(domBilling);
                            if (newAddress) {
                                selectBillingAddressAction(newAddress);
                            }
                        } catch (domErr) {
                            // ignore
                        }
                    }

                    billing = quote && typeof quote.billingAddress === 'function'
                        ? quote.billingAddress()
                        : null;

                    // Never silently replace an explicitly separate address with shipping.
                    if (isCompleteQuoteBillingAddress(billing, component)) {
                        allowPlaceOrderOnActivePayment();
                        return true;
                    }

                    return false;
                }

                loadOptionalValidationComponents();
                loadPaymentValidationComponents();

                function clonePaymentPayload(paymentData) {
                    return placeOrderHooksBridge.clonePaymentPayload(paymentData);
                }

                function runPlaceOrderAfterRequestListeners() {
                    placeOrderHooksBridge.runAfterRequestListeners();
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
                                persistPaymentMethodSelection(null);
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

                            // Magento/KO can re-fire select with a new object reference after
                            // every totals or shipping update.
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
                            persistPaymentMethodSelection(paymentMethod);
                        },

                        onSetBillingAddressAction: function (messageContainer, originalAction) {
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            return originalAction(messageContainer);
                        },

                        onSetPaymentInformationAction: function (messageContainer, paymentData, skipBilling, originalAction) {
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            return originalAction(messageContainer, paymentData, skipBilling);
                        },

                        onGetPaymentInformationAction: function (deferred, messageContainer, originalAction) {
                            return originalAction(deferred, messageContainer);
                        },

                        onGetTotalsAction: function (callbacks, deferred, originalAction) {
                            return originalAction(callbacks, deferred);
                        },

		                    placeOrder: function (unused, selectedMethod) {
		                        var component,
		                            paymentData,
                                    methodCode,
                                    nativeSubmitAction;

                            clearPaymentMessages();

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

	                        return ensureRendererForMethod(selectedMethod || getSelectedMethodCode()).then(function () {
                                // Always push guest email into quote before REST place-order.
                                try {
                                    if (customerEmailSync && typeof customerEmailSync.sync === 'function') {
                                        customerEmailSync.sync();
                                    }
                                } catch (emailSyncErr) {
                                    // non-fatal
                                }

                                // Push shipping form → quote → server (set-shipping-information).
                                // Magento placeOrder validates the server-side shipping address;
                                // client-only KO address is not enough.
                                return ensureShippingInformationForPlaceOrder().catch(function (shipErr) {
                                    handlePaymentError(
                                        shipErr,
                                        getBridgeMessageContainer()
                                    );
                                    return Promise.reject(shipErr);
                                }).then(function () {
                                    if (!ensureQuoteBillingAddressForPlaceOrder()) {
                                        throw new Error(
                                            translateFastcheckoutMessage(
                                                'Please check the billing address and try again.'
                                            )
                                        );
                                    }
                                    return prepareCheckoutState();
                                });
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
                                        // Native Magento place-order action (REST).
                                        return new Promise(function (resolve, reject) {
                                            require([
                                                'Magento_Checkout/js/action/place-order',
                                                'Magento_Checkout/js/model/quote'
                                            ], function (placeOrderAction, quoteModel) {
                                                var pm = paymentData || { method: methodCode };
                                                if (quoteModel && typeof quoteModel.paymentMethod === 'function') {
                                                    quoteModel.paymentMethod(pm);
                                                }
                                                placeOrderAction(pm).done(function (orderResult) {
                                                    window.fastcheckoutLastPlaceOrderResult = orderResult || {};
                                                    runPlaceOrderAfterRequestListeners();
                                                    resolve(orderResult);
                                                }).fail(function (response) {
                                                    var err = new Error(
                                                        (response && response.responseJSON && response.responseJSON.message) ||
                                                        translateFastcheckoutMessage('The order was not placed.')
                                                    );
                                                    runPlaceOrderAfterRequestListeners();
                                                    handlePaymentError(err, getBridgeMessageContainer());
                                                    reject(err);
                                                });
                                            }, function () {
                                                reject(new Error(translateFastcheckoutMessage('Checkout session is not ready. Please refresh the page and try again.')));
                                            });
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
                                        return new Promise(function (resolve, reject) {
                                            require(['Magento_Checkout/js/action/place-order'], function (placeOrderAction) {
                                                placeOrderAction(paymentData || { method: methodCode }).done(function (orderResult) {
                                                    window.fastcheckoutLastPlaceOrderResult = orderResult || {};
                                                    runPlaceOrderAfterRequestListeners();
                                                    resolve(orderResult);
                                                }).fail(function (response) {
                                                    var err = new Error(
                                                        (response && response.responseJSON && response.responseJSON.message) ||
                                                        translateFastcheckoutMessage('The order was not placed.')
                                                    );
                                                    runPlaceOrderAfterRequestListeners();
                                                    handlePaymentError(err, component.messageContainer || getBridgeMessageContainer());
                                                    reject(err);
                                                });
                                            }, reject);
                                        });
                                    }
			                            if (methodCode !== 'purchaseorder' && !this.validate()) {
		                                    var activeValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
		                                    handlePaymentError(activeValidationError, component.messageContainer || getBridgeMessageContainer());
			                                return Promise.reject(activeValidationError);
		                            }

                            // Magento payment renderers set isPlaceOrderActionAllowed from
                            // quote.billingAddress(). Unchecking same-as-shipping nulls it;
                            // re-apply shipping or form billing before the readiness check.
                            if (!ensureQuoteBillingAddressForPlaceOrder()) {
                                var billingNotReadyError = new Error(
                                    translateFastcheckoutMessage(
                                        'Please check the billing address and try again.'
                                    )
                                );
                                handlePaymentError(
                                    billingNotReadyError,
                                    component.messageContainer || getBridgeMessageContainer()
                                );
                                return Promise.reject(billingNotReadyError);
                            }
                            allowPlaceOrderOnActivePayment();

		                            if (
	                                typeof component.isPlaceOrderActionAllowed === 'function' &&
	                                !component.isPlaceOrderActionAllowed() &&
                                    !(quote && typeof quote.billingAddress === 'function' && quote.billingAddress())
	                            ) {
                                    var notReadyError = new Error(translateFastcheckoutMessage('The selected payment method is not ready. Please try again.'));
                                    handlePaymentError(notReadyError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(notReadyError);
	                            }

                            // Hidden Magento place-order buttons stay disabled while billing
                            // was null; once quote billing is set, do not block on that flag.
                                if (
                                    nativeSubmitAction &&
                                    nativeSubmitAction.button &&
                                    (
                                        nativeSubmitAction.button.disabled ||
                                        nativeSubmitAction.button.classList.contains('disabled') ||
                                        nativeSubmitAction.button.getAttribute('aria-disabled') === 'true'
                                    ) &&
                                    !(quote && typeof quote.billingAddress === 'function' && quote.billingAddress())
                                ) {
                                    var nativeActionNotReadyError = new Error(translateFastcheckoutMessage('The selected payment method is not ready. Please try again.'));
                                    handlePaymentError(nativeActionNotReadyError, component.messageContainer || getBridgeMessageContainer());
                                    return Promise.reject(nativeActionNotReadyError);
                                }

                                return new Promise(function (resolve, reject) {
                                    require([
                                        'Magento_Checkout/js/action/place-order',
                                        'Magento_Checkout/js/model/quote',
                                        'Magento_Checkout/js/action/redirect-on-success'
                                    ], function (placeOrderAction, quoteModel, redirectOnSuccess) {
                                        var pm = paymentData || { method: methodCode };

                                        if (!ensureQuoteBillingAddressForPlaceOrder()) {
                                            reject(new Error(
                                                translateFastcheckoutMessage(
                                                    'Please check the billing address and try again.'
                                                )
                                            ));
                                            return;
                                        }
                                        allowPlaceOrderOnActivePayment();

                                        if (quoteModel && typeof quoteModel.paymentMethod === 'function') {
                                            quoteModel.paymentMethod(pm);
                                        }

                                        try {
                                            placeOrderAction(pm)
                                                .done(function (orderResult) {
                                                    window.fastcheckoutLastPlaceOrderResult = orderResult || {};
                                                    runPlaceOrderAfterRequestListeners();
                                                    try {
                                                        if (redirectOnSuccess && typeof redirectOnSuccess.execute === 'function') {
                                                            redirectOnSuccess.execute();
                                                        } else if (window.checkoutConfig && window.checkoutConfig.defaultSuccessPageUrl) {
                                                            window.location.replace(window.checkoutConfig.defaultSuccessPageUrl);
                                                        }
                                                    } catch (redirErr) {
                                                        // order placed even if redirect helper fails
                                                    }
                                                    resolve(orderResult);
                                                })
                                                .fail(function (response) {
                                                    var err = new Error(
                                                        (response && response.responseJSON && response.responseJSON.message) ||
                                                        translateFastcheckoutMessage('The order was not placed.')
                                                    );
                                                    runPlaceOrderAfterRequestListeners();
                                                    handlePaymentError(err, component.messageContainer || getBridgeMessageContainer());
                                                    reject(err);
                                                });
                                        } catch (e) {
                                            handlePaymentError(e, component.messageContainer || getBridgeMessageContainer());
                                            reject(e);
                                        }
                                    }, function () {
                                        reject(new Error(translateFastcheckoutMessage('Checkout session is not ready. Please refresh the page and try again.')));
                                    });
                                });
		                        }.bind(this));
		                    },

	                    onPlaceOrderAction: function (paymentData, messageContainer, originalAction) {
	                        var billingError;
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();
                            clearPaymentMessages();

                            if (!ensureQuoteBillingAddressForPlaceOrder()) {
                                billingError = new Error(
                                    translateFastcheckoutMessage(
                                        'Please check the billing address and try again.'
                                    )
                                );
                                handlePaymentError(billingError, messageContainer);

                                var deferred = $.Deferred();
                                deferred.reject(billingError);
                                return deferred.promise();
                            }

                            allowPlaceOrderOnActivePayment();
                            return originalAction(paymentData, messageContainer);
		                    },

	                    validate: function () {
	                        var component = getActiveRenderer(),
	                            methodCode = getSelectedMethodCode(),
	                            billingValid,
	                            paymentValid;

                            // Separate billing form (same-as-shipping unchecked) must validate
                            // together with payment method fields on place order.
                            billingValid = validateBillingAddressForm();
                            paymentValid = validateActivePaymentFields();

                            if (methodCode === 'purchaseorder') {
                                paymentValid = validatePurchaseOrderWithNativeValidation() &&
                                    validateAdditionalValidators(false);

                                return billingValid && paymentValid;
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
                                    paymentValid = false;
                                }
                            }

	                        if (paymentValid && component && typeof component.validate === 'function') {
	                            paymentValid = component.validate() !== false;
                            }

                            if (paymentValid) {
                                paymentValid = validateAdditionalValidators(false);
                            }

                            return billingValid && paymentValid;
                    },

                    /**
                     * Public: validate separate billing address on place order.
                     *
                     * @param {Object} [options]
                     * @param {Boolean} [options.focus=true]
                     * @returns {Boolean}
                     */
                    validateBillingAddress: function (options) {
                        return validateBillingAddressForm(options);
                    },

                    /**
                     * Public: focus first invalid field in document order (shipping before billing).
                     * @returns {Boolean}
                     */
                    focusFirstInvalidField: function () {
                        return focusFirstInvalidCheckoutField();
                    },

                    afterPlaceOrder: function () {
                        var component,
                            shouldRunRendererAfterPlaceOrder;

                        if (window.fastcheckoutSuccessRedirectStarted) {
                            return;
                        }

                        window.fastcheckoutSuccessRedirectStarted = true;
                        component = getActiveRenderer();
                        shouldRunRendererAfterPlaceOrder = !window.fastcheckoutKoSuccessRedirectInProgress;

                        // Snapshot guest address for the next order, then clear cart cache only.
                        // Do not wipe mage-cache-storage entirely — that left only email on re-order.
                        try {
                            guestAddressSnapshot.snapshot({
                                quote: quote,
                                checkoutData: checkoutData
                            });
                        } catch (snapErr) {
                            // non-fatal
                        }
                        try {
                            require(['Magento_Customer/js/customer-data'], function (customerDataModule) {
                                try {
                                    guestAddressSnapshot.clearCartBrowserCache(customerDataModule);
                                } catch (cdErr) {
                                    // non-fatal
                                }
                            });
                        } catch (reqErr) {
                            // ignore
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
                mountSharedAfterMethodsRegion();
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
                 * Apply option row visibility from data-fastcheckout-payment-allowed after the
                 * active KO panel has been switched (avoids empty gap during shipping remap).
                 */
                function applyPaymentOptionVisibility(rootEl) {
                    var root = rootEl ||
                            document.querySelector('[data-fastcheckout-payment-methods-card]') ||
                            document.querySelector('.fc-container-3 .card'),
                        hasAvailable = false,
                        emptyMessage,
                        grid;

                    if (!root) {
                        return false;
                    }

                    emptyMessage = root.querySelector('[data-fastcheckout-no-payment-methods]');
                    grid = root.querySelector('[data-fastcheckout-payment-methods-grid]') ||
                        root.querySelector('.grid');

                    Array.from(root.querySelectorAll('[data-fastcheckout-payment-option]')).forEach(function (option) {
                        var allowed = option.getAttribute('data-fastcheckout-payment-allowed') === '1',
                            input = option.querySelector('input[name="payment_method"]');

                        if (allowed) {
                            option.style.display = '';
                            option.removeAttribute('aria-hidden');
                            if (input) {
                                input.disabled = false;
                            }
                            hasAvailable = true;
                        } else {
                            option.style.display = 'none';
                            option.setAttribute('aria-hidden', 'true');
                            if (input) {
                                input.disabled = true;
                            }
                        }
                    });

                    if (grid) {
                        if (hasAvailable) {
                            grid.classList.remove('hidden');
                            grid.style.display = '';
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

                // Expose for shipping→payment remap after method pick.
                window.fastcheckoutHyvaPayment = window.fastcheckoutHyvaPayment || {};
                window.fastcheckoutHyvaPayment.applyPaymentOptionVisibility = applyPaymentOptionVisibility;

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
