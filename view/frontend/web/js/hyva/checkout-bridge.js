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
    'Kkkonrad_Fastcheckout/js/hyva/shipping-attributes-sync',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-component-fallbacks',
    'Kkkonrad_Fastcheckout/js/hyva/payment-method-sync',
    'Kkkonrad_Fastcheckout/js/hyva/customer-email-sync',
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
    createShippingAttributesSync,
    createCheckoutComponentFallbacks,
    createPaymentMethodSync,
    createCustomerEmailSync,
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

        // Same factory the inline bootstrap uses (Kkkonrad_Fastcheckout::js/requirejs-base.js).
        if (typeof window.fastcheckoutInitPaymentProxy === 'function') {
            window.checkoutConfig.payment = window.fastcheckoutInitPaymentProxy(
                window.checkoutConfig.payment,
                window.checkoutConfig.paymentMethods
            );
        }
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

            // Guest form snapshot only — never for logged-in customers. Restoring a
            // guest snapshot while an address-book entry exists writes
            // newCustomerShippingAddress + selectShippingAddress(new-customer-address),
            // which adds a second list item and leaves the default card unselected.
            if (
                !window.isCustomerLoggedIn &&
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

                // Logged-in shoppers own Magento address-book selection; never inject
                // a guest session snapshot into their shipping quote/list.
                if (window.isCustomerLoggedIn) {
                    return restorePersistedSeparateBillingAddress();
                }

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
                    checkoutData: checkoutData,
                    quote: quote,
                    normalizeAddress: normalizeKoAddressData,
                    addressesMatch: addressesMatch
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
                var shippingAttributesSync = createShippingAttributesSync({
                    checkoutData: checkoutData,
                    quote: quote,
                    getShippingMethodCode: getShippingMethodCode,
                    collectStructuredFields: formDataCollector.collectStructuredFields,
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

                function handlePaymentError(error, messageContainer, methodCode) {
                    return paymentMessageBridge.handleError(error, messageContainer, methodCode);
                }

                subscribePaymentMessageContainer(globalMessageList);
                getCheckoutErrorsComponent();

                function syncEmailCompatibilityComponent(value, triggerChange) {
                    shippingCompatibilityBridge.syncEmailCompatibilityComponent(value, triggerChange);
                }

                shippingCompatibilityBridge.init();

                function registerPaymentValidator(validator) {
                    paymentValidationRegistry.registerPaymentValidator(validator);
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
                /**
                 * Mount Magento stock sidebar summary (cart items + tax-aware totals)
                 * into #fastcheckout-ko-summary-root. Layout includes Magento_Tax overrides.
                 */
                function startNativeSummaryComponents() {
                    var summaryConfig;

                    if (window.fastcheckoutNativeSummaryComponentsStarted) {
                        return;
                    }

                    summaryConfig = checkoutLayoutBridge.checkoutSidebarSummary;
                    if (!summaryConfig || !summaryConfig.component) {
                        return;
                    }

                    window.fastcheckoutNativeSummaryComponentsStarted = true;

                    // Ensure quote.totals is seeded before summary components read it.
                    try {
                        if (checkoutTotalsSync && typeof checkoutTotalsSync.syncFromConfig === 'function') {
                            checkoutTotalsSync.syncFromConfig();
                        }
                    } catch (e) {
                        // non-fatal
                    }

                    // Hyvä card already has the heading; keep Magento Tax total children.
                    summaryConfig = $.extend(true, {}, summaryConfig);
                    summaryConfig.config = $.extend(true, {}, summaryConfig.config || {}, {
                        template: 'Kkkonrad_Fastcheckout/hyva/summary'
                    });
                    // uiLayout accepts template on the node and/or under config.
                    summaryConfig.template = 'Kkkonrad_Fastcheckout/hyva/summary';

                    app({
                        components: {
                            'checkout.sidebar.summary': summaryConfig
                        }
                    });

                    window.setTimeout(function () {
                        var ssr = document.querySelector('[data-fastcheckout-summary-ssr]');
                        var root = document.getElementById('fastcheckout-ko-summary-root');

                        if (root) {
                            root.classList.remove('hidden');
                            root.style.display = '';
                        }
                        if (ssr) {
                            ssr.classList.add('hidden');
                            ssr.setAttribute('aria-hidden', 'true');
                        }
                        window.dispatchEvent(
                            new CustomEvent('fastcheckout:native-summary-started')
                        );
                    }, 0);
                }

                /**
                 * Mount Magento_SalesRule payment discount (coupon) into the visible
                 * Fastcheckout card. Stock OPC places it under payment.afterMethods.
                 */
                function startNativeDiscountComponent() {
                    var discountConfig,
                        root;

                    if (window.fastcheckoutNativeDiscountStarted) {
                        return;
                    }

                    root = document.getElementById('fastcheckout-ko-discount-root');
                    if (!root) {
                        return;
                    }

                    discountConfig = checkoutLayoutBridge.paymentDiscount;
                    if (!discountConfig || !discountConfig.component) {
                        // Fallback: still show a minimal native component when SalesRule
                        // is present but layout extraction failed.
                        discountConfig = {
                            component: 'Magento_SalesRule/js/view/payment/discount',
                            children: {
                                errors: {
                                    component: 'Magento_SalesRule/js/view/payment/discount-messages',
                                    displayArea: 'messages',
                                    sortOrder: 0
                                }
                            }
                        };
                    }

                    window.fastcheckoutNativeDiscountStarted = true;

                    discountConfig = $.extend(true, {}, discountConfig);
                    discountConfig.config = $.extend(true, {}, discountConfig.config || {}, {
                        template: 'Kkkonrad_Fastcheckout/hyva/payment/discount'
                    });
                    discountConfig.template = 'Kkkonrad_Fastcheckout/hyva/payment/discount';

                    app({
                        components: {
                            'checkout.steps.billing-step.payment.afterMethods.discount': discountConfig
                        }
                    });

                    window.setTimeout(function () {
                        var ssr = document.querySelector('[data-fastcheckout-discount-ssr]');

                        root.classList.remove('hidden');
                        root.style.display = '';
                        if (ssr) {
                            ssr.classList.add('hidden');
                            ssr.setAttribute('aria-hidden', 'true');
                        }
                        window.dispatchEvent(
                            new CustomEvent('fastcheckout:native-discount-started')
                        );
                    }, 0);
                }

                /**
                 * Order comment — Magento has no storefront OPC comment component;
                 * mount a Magento-UI-style field that place-order still reads from DOM.
                 */
                function startOrderCommentComponent() {
                    var root;

                    if (window.fastcheckoutOrderCommentStarted) {
                        return;
                    }

                    root = document.getElementById('fastcheckout-ko-comment-root');
                    if (!root) {
                        return;
                    }

                    window.fastcheckoutOrderCommentStarted = true;

                    app({
                        components: {
                            'fastcheckout.order-comment': {
                                component: 'Kkkonrad_Fastcheckout/js/view/order-comment',
                                config: {
                                    template: 'Kkkonrad_Fastcheckout/hyva/order-comment',
                                    // PHP-translated via data-* on #fastcheckout-ko-comment-root
                                    // (read in component initialize); keep English defaults here.
                                    label: root.getAttribute('data-label') || 'Order Comment',
                                    placeholder: root.getAttribute('data-placeholder') ||
                                        'Optional comment for this order'
                                },
                                template: 'Kkkonrad_Fastcheckout/hyva/order-comment',
                                label: root.getAttribute('data-label') || 'Order Comment',
                                placeholder: root.getAttribute('data-placeholder') ||
                                    'Optional comment for this order'
                            }
                        }
                    });

                    window.setTimeout(function () {
                        var ssr = document.querySelector('[data-fastcheckout-comment-ssr]');

                        root.classList.remove('hidden');
                        root.style.display = '';
                        if (ssr) {
                            ssr.classList.add('hidden');
                            ssr.setAttribute('aria-hidden', 'true');
                        }
                    }, 0);
                }

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
                        // Summary / coupon / comment share the payment bootstrap window:
                        // totals refresh after shipping-information; native Tax + SalesRule
                        // components need the checkout registry.
                        startNativeSummaryComponents();
                        startNativeDiscountComponent();
                        startOrderCommentComponent();
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
                    window.setTimeout(function () {
                        try {
                            refreshNativePaymentActions();
                        } catch (eRefreshPo) {
                            // non-fatal during early boot
                        }
                    }, delay);
                });

                window.addEventListener('fastcheckout:payment-selection-changed', function () {
                    window.setTimeout(function () {
                        try {
                            refreshNativePaymentActions();
                        } catch (e) {
                            // ignore
                        }
                    }, 50);
                    window.setTimeout(function () {
                        try {
                            refreshNativePaymentActions();
                        } catch (e2) {
                            // ignore
                        }
                    }, 400);
                });

                function persistEmailToCheckoutData(email) {
                    checkoutDataPersistence.persistEmail(email);
                }

                function persistAddressToCheckoutData(addressData, type) {
                    return checkoutDataPersistence.persistAddress(addressData, type);
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
                    selectShippingMethod: function (shippingMethod) {
                        var component = getShippingAddressComponent();

                        if (component && typeof component.selectShippingMethod === 'function') {
                            return component.selectShippingMethod(shippingMethod);
                        }

                        return selectShippingMethodAction(shippingMethod);
                    },
                    prepareForPlaceOrder: function (messageContainer) {
                        return ensureShippingInformationForPlaceOrder().catch(function (error) {
                            handlePaymentError(
                                error,
                                messageContainer || getBridgeMessageContainer()
                            );
                            return Promise.reject(error);
                        });
                    },
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
                                : '',
                            isSavedCustomerAddress = addressType &&
                                addressType !== 'new-customer-address';

                        // The quote address object survives a country change, so it can still
                        // carry the previous country's region_id. Everything downstream is built
                        // from it — checkout-data, the provider and, crucially, the REST payloads
                        // for estimate-shipping-methods / shipping-information. Sanitise it in
                        // place (this is the same object selectShippingAddressAction just stored
                        // on the quote) so no request goes out with a region from another country.
                        regionCountryGuard.dropRegionFromOtherCountry(shippingAddress);

                        addressData = normalizeKoAddressData(shippingAddress);

                        if (isSavedCustomerAddress) {
                            if (
                                checkoutData &&
                                typeof checkoutData.setSelectedShippingAddress === 'function' &&
                                typeof shippingAddress.getKey === 'function'
                            ) {
                                checkoutData.setSelectedShippingAddress(shippingAddress.getKey());
                            }
                            // Do NOT push address-book data into checkoutProvider / form fields.
                            // Magento's shipping-rates-validator listens to those fields and would
                            // re-selectShippingAddress as a new-customer-address — first "Ship Here"
                            // click only deselects the previous card. Rates use quote address
                            // (customer-address processor) without form sync.
                            return syncShippingAttributes();
                        }

                        persistAddressToCheckoutData(addressData, 'shipping');
                        syncAddressDataToCheckoutProvider(addressData, 'shipping');
                        syncCheckoutProviderAddressAttributes();

                        return syncShippingAttributes();
                    },
                    onSelectBillingAddressAction: function (billingAddress) {
                        var addressData;

                        if (!billingAddress) {
                            return Promise.resolve(false);
                        }

                        addressData = normalizeKoAddressData(billingAddress);
                        if (!persistAddressToCheckoutData(addressData, 'billing')) {
                            return Promise.resolve(false);
                        }

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
                    if (component && component.messageContainer) {
                        subscribePaymentMessageContainer(component.messageContainer);
                    }
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

                function getPlaceOrderHost() {
                    return document.querySelector('[data-fastcheckout-place-order-host]') ||
                        document.getElementById('fastcheckout-place-order-host');
                }

                function getPlaceOrderSsrButtons() {
                    return Array.prototype.slice.call(
                        document.querySelectorAll('[data-fastcheckout-place-order-ssr]')
                    );
                }

                /**
                 * Magento payment templates render .actions-toolbar with
                 * button.action.primary.checkout (click: placeOrder). Host that
                 * toolbar in the summary column and style it like FC primary.
                 * Click still goes through Magento KO placeOrder after FC prep
                 * (form submit → placeOrderViaKo → renderer.placeOrder).
                 */
                function wireNativePlaceOrderButton(button) {
                    if (!button || button.getAttribute('data-fastcheckout-place-order-wired') === '1') {
                        return;
                    }

                    button.setAttribute('data-fastcheckout-place-order-wired', '1');
                    // Avoid double submit with the outer #co-checkout-form.
                    button.setAttribute('type', 'button');
                    button.classList.add(
                        'btn',
                        'btn-primary',
                        'fastcheckout-native-place-order-btn'
                    );
                    button.removeAttribute('disabled');
                    button.removeAttribute('aria-hidden');
                    button.removeAttribute('tabindex');

                    // Capture phase: FC prep (shipping/billing) then Magento workflow.
                    button.addEventListener('click', function (event) {
                        var formEl = document.getElementById('co-checkout-form');

                        // Let Magento KO click: placeOrder run only after FC prep.
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }

                        if (formEl && typeof formEl.requestSubmit === 'function') {
                            formEl.requestSubmit();
                        } else if (formEl) {
                            formEl.dispatchEvent(
                                new Event('submit', { bubbles: true, cancelable: true })
                            );
                        }
                    }, true);
                }

                function resolveSelectedPaymentMethodCode() {
                    var code = '',
                        checked;

                    try {
                        code = getSelectedMethodCode() || '';
                    } catch (e) {
                        code = '';
                    }

                    if (code) {
                        return String(code);
                    }

                    checked = document.querySelector(
                        'input[name="payment_method"]:checked:not([disabled])'
                    );
                    if (checked && checked.value) {
                        return String(checked.value);
                    }

                    return '';
                }

                function toolbarHasPlaceOrderButton(toolbar) {
                    var buttons = getNativeCheckoutActionButtons(toolbar);

                    if (!buttons.length) {
                        return false;
                    }

                    return buttons.some(function (btn) {
                        var handler = getKoClickHandlerName(btn);
                        return !handler || handler === 'placeOrder';
                    });
                }

                function findActivePlaceOrderToolbar() {
                    var roots = getActivePaymentFormRoots(),
                        found = null,
                        methodCode = resolveSelectedPaymentMethodCode(),
                        selectors = [],
                        i;

                    roots.some(function (root) {
                        var toolbars = root.querySelectorAll('.actions-toolbar'),
                            t;

                        for (t = 0; t < toolbars.length; t += 1) {
                            if (toolbarHasPlaceOrderButton(toolbars[t])) {
                                found = toolbars[t];
                                return true;
                            }
                        }

                        return false;
                    });

                    // Prefer the KO target for the currently selected Fastcheckout radio.
                    if (!found && methodCode) {
                        document.querySelectorAll(
                            '[data-fastcheckout-payment-method-ko-target="' +
                            String(methodCode).replace(/"/g, '') +
                            '"] .actions-toolbar'
                        ).forEach(function (toolbar) {
                            if (!found && toolbarHasPlaceOrderButton(toolbar)) {
                                found = toolbar;
                            }
                        });
                    }

                    // Any place-order toolbar already in the summary host.
                    if (!found) {
                        document.querySelectorAll(
                            '[data-fastcheckout-place-order-host] .actions-toolbar'
                        ).forEach(function (toolbar) {
                            if (!found && toolbarHasPlaceOrderButton(toolbar)) {
                                found = toolbar;
                            }
                        });
                    }

                    // Match Magento payment[method] radio inside .payment-method to FC selection.
                    if (!found && methodCode) {
                        document.querySelectorAll(
                            '.payment-method-content .actions-toolbar, ' +
                            '#fastcheckout-ko-payment-root .actions-toolbar, ' +
                            '[data-fastcheckout-payment-method-ko-target] .actions-toolbar'
                        ).forEach(function (toolbar) {
                            var methodEl,
                                input;

                            if (found || !toolbarHasPlaceOrderButton(toolbar)) {
                                return;
                            }

                            methodEl = toolbar.closest('.payment-method');
                            if (!methodEl) {
                                // Toolbar may live under KO target without .payment-method wrapper.
                                if (
                                    toolbar.closest(
                                        '[data-fastcheckout-payment-method-ko-target="' +
                                        String(methodCode).replace(/"/g, '') + '"]'
                                    )
                                ) {
                                    found = toolbar;
                                }
                                return;
                            }
                            input = methodEl.querySelector(
                                'input[name="payment[method]"], input[type="radio"]'
                            );
                            if (
                                input &&
                                paymentMethodCodesEqual(
                                    input.value || input.getAttribute('value') || input.id,
                                    methodCode
                                )
                            ) {
                                found = toolbar;
                            }
                        });
                    }

                    // Absolute last resort: any place-order toolbar (prefer one whose
                    // Magento radio is checked / method is selected on quote).
                    if (!found) {
                        document.querySelectorAll('.actions-toolbar').forEach(function (toolbar) {
                            var methodEl,
                                input,
                                isChecked = false;

                            if (found || !toolbarHasPlaceOrderButton(toolbar)) {
                                return;
                            }
                            if (toolbar.closest('[data-fastcheckout-place-order-host]')) {
                                found = toolbar;
                                return;
                            }

                            methodEl = toolbar.closest('.payment-method');
                            input = methodEl
                                ? methodEl.querySelector('input[type="radio"]')
                                : null;
                            if (input) {
                                isChecked = !!input.checked ||
                                    (methodCode &&
                                        paymentMethodCodesEqual(
                                            input.value || input.id,
                                            methodCode
                                        ));
                            }
                            if (isChecked || (!methodCode && !found)) {
                                found = toolbar;
                            }
                        });
                    }

                    return found;
                }

                function mountNativePlaceOrderToolbar() {
                    var host = getPlaceOrderHost(),
                        toolbar = findActivePlaceOrderToolbar(),
                        ssrButtons = getPlaceOrderSsrButtons(),
                        buttons;

                    if (!host) {
                        return false;
                    }

                    // Restore any previously hosted toolbars that belong to inactive methods
                    // back into their payment content (leave host empty until we mount active).
                    Array.prototype.slice.call(
                        host.querySelectorAll('.actions-toolbar')
                    ).forEach(function (hosted) {
                        if (toolbar && hosted === toolbar) {
                            return;
                        }
                        // Detach inactive hosted toolbars; payment panel re-renders on switch.
                        if (hosted.parentNode === host) {
                            hosted.parentNode.removeChild(hosted);
                        }
                    });

                    if (!toolbar) {
                        host.classList.add('hidden');
                        ssrButtons.forEach(function (btn) {
                            btn.classList.remove('hidden');
                            btn.classList.add('md:flex');
                        });
                        return false;
                    }

                    if (toolbar.parentNode !== host) {
                        host.appendChild(toolbar);
                    }

                    host.classList.remove('hidden');
                    buttons = getNativeCheckoutActionButtons(toolbar);
                    buttons.forEach(wireNativePlaceOrderButton);

                    // Magento toolbar is live — hide FC SSR fallback on desktop.
                    ssrButtons.forEach(function (btn) {
                        btn.classList.add('hidden');
                        btn.classList.remove('md:flex');
                    });

                    toolbar.classList.remove('fastcheckout-actions-toolbar-hidden');
                    toolbar.classList.add('fastcheckout-place-order-toolbar');

                    // Magento binds enable/isPlaceOrderActionAllowed to billing —
                    // re-allow after mount so the hosted button is clickable.
                    try {
                        if (typeof allowPlaceOrderOnActivePayment === 'function') {
                            allowPlaceOrderOnActivePayment();
                        }
                    } catch (eAllow) {
                        // non-fatal
                    }

                    return true;
                }

                function annotateNativePaymentActions(root) {
                    if (!root || typeof root.querySelectorAll !== 'function') {
                        return;
                    }

                    // Custom gateway actions (not placeOrder) stay in the payment panel.
                    // Stock placeOrder toolbars are relocated to the summary host.
                    Array.prototype.slice.call(root.querySelectorAll('.actions-toolbar')).forEach(function (toolbar) {
                        var actionButtons = getNativeCheckoutActionButtons(toolbar),
                            hasOnlyPlaceOrder,
                            hasCustomAction;

                        if (!actionButtons.length) {
                            return;
                        }

                        hasCustomAction = actionButtons.some(function (button) {
                            var handlerName = getKoClickHandlerName(button);
                            return handlerName && handlerName !== 'placeOrder';
                        });
                        hasOnlyPlaceOrder = actionButtons.every(function (button) {
                            var handlerName = getKoClickHandlerName(button);
                            return !handlerName || handlerName === 'placeOrder';
                        });

                        if (hasOnlyPlaceOrder && !hasCustomAction) {
                            // Will be moved by mountNativePlaceOrderToolbar; keep visible for move.
                            toolbar.classList.remove('fastcheckout-actions-toolbar-hidden');
                            actionButtons.forEach(function (button) {
                                button.classList.remove('fastcheckout-native-place-order-hidden');
                                button.removeAttribute('disabled');
                                button.removeAttribute('aria-hidden');
                            });
                        }
                    });

                    mountNativePlaceOrderToolbar();
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

                function isPaymentRendererReady(methodCode) {
                    var component = getRendererByMethod(methodCode),
                        target,
                        options,
                        selectors;

                    if (!component || !isPaymentPanelOpen(methodCode, methodCode)) {
                        return false;
                    }

                    options = component.secureFormOptions;
                    if (!options || typeof options !== 'object') {
                        return true;
                    }
                    if (typeof component.useNewCard === 'function') {
                        try {
                            if (!component.useNewCard()) {
                                return true;
                            }
                        } catch (error) {
                            return false;
                        }
                    }

                    selectors = [
                        options.elementFormNumber,
                        options.elementFormDate,
                        options.elementFormCvv
                    ].filter(function (selector) {
                        return typeof selector === 'string' && selector !== '';
                    });
                    if (!selectors.length) {
                        return true;
                    }

                    target = document.querySelector(
                        '[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]'
                    );
                    return !!target && selectors.every(function (selector) {
                        var field = target.querySelector(selector);

                        return !!field && (
                            String(field.tagName).toLowerCase() === 'iframe' ||
                            !!field.querySelector('iframe')
                        );
                    });
                }

                function activateDeferredPaymentChildren(methodCode) {
                    window.setTimeout(function () {
                        checkoutLayoutBridge.activateDeferredPaymentListChildren(
                            methodCode,
                            getRendererComponentForMethod(methodCode)
                        );
                    }, 0);
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

                    // Already open for this method — skip hide/show cycle, but always
                    // keep the radio checked (shipping remap can open content while
                    // leaving the input unchecked).
                    if (isPaymentPanelOpen(methodCode, activeCode)) {
                        existingInTarget = target ? target.querySelector('.payment-method') : null;
                        if (existingInTarget) {
                            annotateNativePaymentActions(existingInTarget);
                        }
                        document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                            if (
                                paymentMethodCodesEqual(input.value, methodCode) ||
                                paymentMethodCodesEqual(input.value, activeCode)
                            ) {
                                if (!input.disabled) {
                                    input.checked = true;
                                }
                            }
                        });
                        holdPaymentPanel(methodCode);
                        hidePaymentPlaceholders(methodCode);
                        activateDeferredPaymentChildren(methodCode);
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

                    // Keep the matching payment radio checked whenever we open/activate a panel.
                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        if (
                            paymentMethodCodesEqual(input.value, methodCode) ||
                            paymentMethodCodesEqual(input.value, activeCode)
                        ) {
                            if (!input.disabled) {
                                input.checked = true;
                            }
                        }
                    });

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

                    if (opened || movedToTarget) {
                        activateDeferredPaymentChildren(methodCode);
                    }

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
                        // The renderer owns selection just like in Magento's stock checkout.
                        // Gateways use this hook to initialize hosted fields, wallets and
                        // method-specific state, so replacing it breaks otherwise compatible modules.
                        renderer.selectPaymentMethod();
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
                    document.dispatchEvent(new CustomEvent('fastcheckout:payment-selection-changed', {
                        detail: {method: methodCode || ''}
                    }));

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
                    mountNativePlaceOrderToolbar();
                }

                function getActiveNativeSubmitActionName() {
                    var action = getRendererNativeSubmitAction(getActiveRenderer());

                    return action ? action.name : '';
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

                /**
                 * Run Magento payment renderer placeOrder so gateways can show their own
                 * validation (PayU Secure Form tokenize errors on secureFormError, etc.).
                 *
                 * @param {Object} component
                 * @param {String} methodCode
                 * @returns {Promise}
                 */
                function invokeRendererPlaceOrder(component, methodCode) {
                    return new Promise(function (resolve, reject) {
                        var settled = false,
                            errorSub = null,
                            messageErrorSub = null,
                            asyncSafetyTimer = null,
                            placeOrderResult,
                            defaultPaymentError = translateFastcheckoutMessage(
                                'Please check the selected payment method and try again.'
                            ),
                            fakeEvent = {
                                preventDefault: function () {},
                                stopPropagation: function () {},
                                type: 'click'
                            };

                        function cleanup() {
                            if (asyncSafetyTimer) {
                                window.clearTimeout(asyncSafetyTimer);
                                asyncSafetyTimer = null;
                            }

                            if (errorSub && typeof errorSub.dispose === 'function') {
                                try {
                                    errorSub.dispose();
                                } catch (e) {
                                    // ignore
                                }
                            }
                            errorSub = null;

                            if (messageErrorSub && typeof messageErrorSub.dispose === 'function') {
                                try {
                                    messageErrorSub.dispose();
                                } catch (e) {
                                    // ignore
                                }
                            }
                            messageErrorSub = null;
                        }

                        function getVisiblePaymentInlineError() {
                            if (
                                paymentMessageBridge &&
                                typeof paymentMessageBridge.getInlineErrorText === 'function'
                            ) {
                                return paymentMessageBridge.getInlineErrorText(methodCode) || '';
                            }

                            return '';
                        }

                        function scrollActivePaymentIntoView() {
                            var target,
                                inlineError;

                            try {
                                target = document.querySelector(
                                    '[data-fastcheckout-payment-method-ko-target="' +
                                    String(methodCode || '').replace(/"/g, '') + '"]'
                                ) || document.querySelector('.payment-method._active');

                                // Prefer the painted gateway error so PayU .payu-msg is not
                                // left below the fold under long agreement copy.
                                if (target && typeof target.querySelector === 'function') {
                                    inlineError = target.querySelector(
                                        '.payu-msg, .msg__error, .message-error, .message.error, .field-error, [role="alert"]'
                                    );
                                }

                                if (inlineError && typeof inlineError.scrollIntoView === 'function') {
                                    inlineError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                } else if (target && typeof target.scrollIntoView === 'function') {
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            } catch (e) {
                                // ignore
                            }
                        }

                        function fail(message, inlineHandled) {
                            var text,
                                err;

                            if (settled) {
                                return;
                            }
                            settled = true;
                            cleanup();
                            window.setTimeout(function () {
                                text = paymentMessageBridge.normalize(message) ||
                                    getVisiblePaymentInlineError() ||
                                    defaultPaymentError;
                                err = new Error(text);
                                // Always run handlePaymentError so the full-screen loader is
                                // stopped; it skips the top banner when inline PayU errors exist.
                                err.fastcheckoutInlineHandled = inlineHandled === true ||
                                    handlePaymentError(
                                        err,
                                        component && component.messageContainer || getBridgeMessageContainer(),
                                        methodCode
                                    ) === true ||
                                    !!getVisiblePaymentInlineError();
                                scrollActivePaymentIntoView();
                                reject(err);
                            }, 0);
                        }

                        function isGatewayAsyncInProgress() {
                            try {
                                // PayU (and similar) flip isPlaceOrderActionAllowed(false) while
                                // tokenization / deferred placeOrder runs.
                                return typeof component.isPlaceOrderActionAllowed === 'function' &&
                                    component.isPlaceOrderActionAllowed() === false;
                            } catch (e) {
                                return false;
                            }
                        }

                        /**
                         * Magento renderers return false both for sync validation failures and
                         * while async tokenization has started. Never leave the promise hanging:
                         * settle from painted inline errors, component.validate(), focusable
                         * fields, or a short async safety timeout for gateways like PayU.
                         */
                        function settleFalsePlaceOrderResult() {
                            var inlineText;

                            if (settled) {
                                return;
                            }

                            inlineText = getVisiblePaymentInlineError();
                            if (inlineText) {
                                fail(inlineText, true);
                                return;
                            }

                            if (
                                component.secureFormError &&
                                typeof component.secureFormError === 'function' &&
                                component.secureFormError()
                            ) {
                                fail(component.secureFormError(), true);
                                return;
                            }

                            if (focusFirstInvalidCheckoutField()) {
                                fail(defaultPaymentError, true);
                                return;
                            }

                            if (typeof component.validate === 'function' && !component.validate()) {
                                // PayU agreement / stored-card checks fail without secureFormError.
                                // Agreement text is already in the template when payuAgreement is false.
                                inlineText = getVisiblePaymentInlineError();
                                fail(inlineText || defaultPaymentError, !!inlineText);
                                return;
                            }

                            if (isGatewayAsyncInProgress()) {
                                // Tokenize in progress — secureFormError / deferred will settle.
                                // Safety net if the gateway never reports (network hang, SDK drop).
                                asyncSafetyTimer = window.setTimeout(function () {
                                    var lateInline;

                                    if (settled) {
                                        return;
                                    }

                                    lateInline = getVisiblePaymentInlineError();
                                    if (lateInline) {
                                        fail(lateInline, true);
                                        return;
                                    }

                                    if (
                                        component.secureFormError &&
                                        typeof component.secureFormError === 'function' &&
                                        component.secureFormError()
                                    ) {
                                        fail(component.secureFormError(), true);
                                        return;
                                    }

                                    fail(defaultPaymentError, false);
                                }, 15000);
                                return;
                            }

                            // Synchronous false with nothing painted (e.g. additionalValidators).
                            fail(defaultPaymentError, false);
                        }

                        if (!component || typeof component.placeOrder !== 'function') {
                            fail(translateFastcheckoutMessage(
                                'The selected payment method is not ready. Please try again.'
                            ));
                            return;
                        }

                        subscribePaymentMessageContainer(component.messageContainer);
                        messageErrorSub = paymentMessageBridge.watchErrors(
                            component.messageContainer,
                            fail
                        );

                        // PayU Secure Form (and similar) publish field errors here after tokenize.
                        if (
                            component.secureFormError &&
                            typeof component.secureFormError === 'function' &&
                            typeof component.secureFormError.subscribe === 'function'
                        ) {
                            try {
                                component.secureFormError('');
                            } catch (clearErr) {
                                // ignore
                            }
                            errorSub = component.secureFormError.subscribe(function (msg) {
                                if (msg) {
                                    fail(msg);
                                }
                            });
                        }

                        try {
                            if (
                                typeof component.isPlaceOrderActionAllowed === 'function' &&
                                !component.isPlaceOrderActionAllowed() &&
                                !(quote && typeof quote.billingAddress === 'function' && quote.billingAddress())
                            ) {
                                fail(translateFastcheckoutMessage(
                                    'The selected payment method is not ready. Please try again.'
                                ));
                                return;
                            }

                            // The renderer owns component.validate() and Magento's additional
                            // validators, exactly as it does in the standard checkout.
                            placeOrderResult = component.placeOrder({}, fakeEvent);
                            paymentMessageBridge.observeFailure(placeOrderResult, fail);

                            // Magento's default renderer returns false for synchronous inline
                            // validation failures. Hosted gateways also return false while
                            // asynchronous tokenization has started.
                            if (placeOrderResult === false) {
                                // Let KO paint agreement / secureFormError nodes before reading DOM.
                                window.setTimeout(settleFalsePlaceOrderResult, 50);
                            }

                            // Keep the observers until an error, safety timeout, or navigation.
                        } catch (placeErr) {
                            fail(placeErr && placeErr.message ? placeErr.message : placeErr);
                        }
                    });
                }

                /**
                 * Ensure quote.shippingAddress has countryId so Magento
                 * PaymentMethodManagement::set does not throw "shipping address is missing".
                 * Seeds from the shipping form, default destination, or checkoutConfig.
                 *
                 * @returns {Boolean}
                 */
                function ensureShippingCountryOnQuote() {
                    var shipping = quote && typeof quote.shippingAddress === 'function'
                            ? quote.shippingAddress()
                            : null,
                        country = '',
                        formCountry,
                        field;

                    if (shipping) {
                        country = String(shipping.countryId || shipping.country_id || '').trim();
                    }
                    if (country) {
                        return true;
                    }

                    field = document.querySelector(
                        '.fastcheckout-native-shipping-address select[name="country_id"], ' +
                        'select[name="country_id"]'
                    );
                    formCountry = field && field.value ? String(field.value).trim() : '';
                    country = formCountry ||
                        String(
                            (window.fastcheckoutDefaultDestination &&
                                window.fastcheckoutDefaultDestination.countryId) ||
                            (window.checkoutConfig && window.checkoutConfig.defaultCountryId) ||
                            ''
                        ).trim();

                    if (!country) {
                        return false;
                    }

                    if (shipping && typeof shipping === 'object') {
                        shipping.countryId = country;
                        shipping.country_id = country;
                        try {
                            quote.shippingAddress(shipping);
                        } catch (e) {
                            // ignore
                        }
                        return true;
                    }

                    // No quote address object yet — try building from form/default seed.
                    try {
                        if (typeof ensureQuoteShippingAddressForPlaceOrder === 'function') {
                            ensureQuoteShippingAddressForPlaceOrder();
                        }
                    } catch (e2) {
                        // ignore
                    }

                    shipping = quote && typeof quote.shippingAddress === 'function'
                        ? quote.shippingAddress()
                        : null;
                    if (shipping) {
                        shipping.countryId = shipping.countryId || country;
                        shipping.country_id = shipping.country_id || country;
                        try {
                            quote.shippingAddress(shipping);
                        } catch (e3) {
                            // ignore
                        }
                    }

                    return !!(shipping && (shipping.countryId || shipping.country_id));
                }

                window.fastcheckoutHyvaPayment = $.extend(window.fastcheckoutHyvaPayment || {}, {
                        registerValidator: registerPaymentValidator,
                        ensureShippingCountryOnQuote: ensureShippingCountryOnQuote,
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
	                            methodCode,
	                            rendererNotReadyError;

                            clearPaymentMessages();

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

                            methodCode = selectedMethod || getSelectedMethodCode();
                            if (!isPaymentRendererReady(methodCode)) {
                                rendererNotReadyError = new Error(translateFastcheckoutMessage(
                                    'The selected payment method is not ready. Please try again.'
                                ));
                                handlePaymentError(rendererNotReadyError, getBridgeMessageContainer());
                                return Promise.reject(rendererNotReadyError);
                            }

	                        return ensureRendererForMethod(methodCode).then(function () {
                                // Always push guest email into quote before REST place-order.
                                try {
                                    if (customerEmailSync && typeof customerEmailSync.sync === 'function') {
                                        customerEmailSync.sync();
                                    }
                                } catch (emailSyncErr) {
                                    // non-fatal
                                }

                                if (!ensureQuoteBillingAddressForPlaceOrder()) {
                                    throw new Error(
                                        translateFastcheckoutMessage(
                                            'Please check the billing address and try again.'
                                        )
                                    );
                                }

                                return prepareCheckoutState();
                            }).then(function () {
		                            component = getActiveRenderer();
                                if (!component || typeof component.placeOrder !== 'function') {
                                    rendererNotReadyError = new Error(translateFastcheckoutMessage(
                                        'The selected payment method is not ready. Please try again.'
                                    ));
                                    handlePaymentError(rendererNotReadyError, getBridgeMessageContainer());
                                    return Promise.reject(rendererNotReadyError);
                                }

                                refreshNativePaymentActions();
                                methodCode = getRendererCode(component, selectedMethod || getSelectedMethodCode());

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

                            // The active Magento renderer is the only place-order entry point.
                            // It owns validate(), additional validators, tokenization and redirects.
                            return invokeRendererPlaceOrder(component, methodCode);
		                        });
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
	                            billingValid;

                            // Separate billing form (same-as-shipping unchecked) must validate
                            // before the renderer starts order placement.
                            billingValid = validateBillingAddressForm();

                            // Renderer.validate() and Magento additional validators are called
                            // by renderer.placeOrder(), exactly as in the stock checkout.
                            return billingValid && !!component &&
                                typeof component.placeOrder === 'function';
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
                    isRendererReady: isPaymentRendererReady,
                    hasInlineError: function (message, methodCode) {
                        return paymentMessageBridge.hasInlineError(
                            methodCode || getSelectedMethodCode(),
                            message
                        );
                    },
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
                                // Disallowed method must not keep a checked radio.
                                input.checked = false;
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

                /**
                 * Magento payment modules register renderers by side-effect when their
                 * "payments" / "offline-payments" / "payu_gateway" components load
                 * (they push into Magento_Checkout/js/model/payment/renderer-list).
                 * Without that list, payment-list.createRenderer never builds
                 * .payment-method nodes — radio stays checked, panel stays empty.
                 *
                 * layoutScripts alone is not enough: some stores only collect third-party
                 * extras (e.g. InPost) and omit OfflinePayments. Always load the payment
                 * renderer registration components discovered from jsLayout.
                 */
                function loadPaymentRegistrationModules() {
                    var modules = [],
                        seen = {},
                        list = config.rendererComponents || [];

                    list.forEach(function (scriptModule) {
                        if (!scriptModule || seen[scriptModule]) {
                            return;
                        }
                        seen[scriptModule] = true;
                        modules.push(scriptModule);
                    });

                    // Fallback when PHP map only exposes group codes (offline-payments)
                    // without expanding active method codes into rendererComponents.
                    [
                        'Magento_OfflinePayments/js/view/payment/offline-payments',
                        'Magento_Payment/js/view/payment/payments'
                    ].forEach(function (scriptModule) {
                        if (!seen[scriptModule]) {
                            seen[scriptModule] = true;
                            modules.push(scriptModule);
                        }
                    });

                    modules.forEach(function (scriptModule) {
                        require([scriptModule], function () {
                            if (
                                window.fastcheckoutHyvaPaymentList &&
                                typeof window.fastcheckoutHyvaPaymentList.syncRenderers === 'function'
                            ) {
                                window.fastcheckoutHyvaPaymentList.syncRenderers();
                            }
                            runPatchRenderers();
                            // If a sole payment is already checked, re-open its panel now
                            // that KO renderers exist.
                            if (
                                window.fastcheckoutHyvaShipping &&
                                typeof window.fastcheckoutHyvaShipping.applyPaymentRemapForShipping === 'function'
                            ) {
                                var shipCode = '';
                                try {
                                    var sm = quote && quote.shippingMethod && quote.shippingMethod();
                                    if (sm && sm.carrier_code) {
                                        shipCode = sm.carrier_code + '_' + sm.method_code;
                                    }
                                } catch (e) { /* */ }
                                if (!shipCode) {
                                    var radio = document.querySelector(
                                        'input[name="shipping_method"]:checked'
                                    );
                                    shipCode = radio ? radio.value : '';
                                }
                                if (shipCode) {
                                    window.fastcheckoutHyvaShipping.applyPaymentRemapForShipping(shipCode);
                                }
                            } else {
                                var checkedPay = document.querySelector(
                                    'input[name="payment_method"]:checked:not([disabled])'
                                );
                                if (checkedPay && checkedPay.value) {
                                    setSelectedMethod(checkedPay.value);
                                }
                            }
                        }, function (err) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn(
                                    'Kkkonrad Fastcheckout: payment registration module could not load',
                                    scriptModule,
                                    err
                                );
                            }
                        });
                    });
                }

                loadPaymentRegistrationModules();

                // Load discovered layout scripts dynamically via RequireJS
                var layoutScripts = config.layoutScripts || [];
                if (layoutScripts.length > 0) {
                    layoutScripts.forEach(function (scriptModule) {
                        var namespace = String(scriptModule).split('/')[0];

                        // Allow Magento_ / Kkkonrad_ and known payment vendors that register
                        // into renderer-list (PayU/Tpay/Braintree/Mollie/InPost extras).
                        if (
                            !/^(Magento_|Kkkonrad_|PayU_|Tpay_|PayPal_|Mollie_|Smartmage_)/.test(namespace)
                        ) {
                            return;
                        }
                        require([scriptModule], function () {
                            if (
                                window.fastcheckoutHyvaPaymentList &&
                                typeof window.fastcheckoutHyvaPaymentList.syncRenderers === 'function'
                            ) {
                                window.fastcheckoutHyvaPaymentList.syncRenderers();
                            }
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
