/**
 * Prevent Magento UI billing fields from showing as invalid the moment the user
 * unchecks "My billing and shipping address are the same".
 *
 * Magento form components stay component-visible while the billing fieldset is
 * KO-hidden; value sync / country-region rule updates can run validate() and
 * leave error state that only becomes visible when the form is revealed.
 * Suppress that until the shopper interacts with the form or explicitly
 * validates (Update / place-order data.validate).
 *
 * Also prefill the separate billing form from the current shipping address
 * (including street lines as UI object {0,1,...}) when same-as-shipping is unchecked.
 */
define([
    'jquery',
    'uiRegistry',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/address-converter',
    'Magento_Checkout/js/action/select-billing-address',
    'Magento_Checkout/js/checkout-data',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, registry, quote, addressConverter, selectBillingAddress, checkoutData, isFastcheckoutActive) {
    'use strict';

    var documentGuardRegistered = false;

    /**
     * Shared across every payment-method billing-address component instance.
     * Per-instance flags fail: unchecking on checkmo still lets banktransfer's
     * quote.billingAddress subscriber re-apply same-as-shipping.
     */
    var userChoseSeparateBilling = false;

    function isBillingFormElement(element) {
        return Boolean(
            element &&
            element.closest &&
            element.closest(
                '.payment-method-billing-address .billing-address-form, ' +
                '.payment-method-billing-address [data-form="billing-new-address"]'
            )
        );
    }

    function hasError(component) {
        var error;

        if (!component || typeof component.error !== 'function') {
            return false;
        }

        error = component.error();

        return Boolean(error && String(error).length);
    }

    function clearComponentError(component) {
        if (hasError(component)) {
            component.error(false);
        }
    }

    /**
     * Magento AttributeMerger puts attribute validation (incl. max_text_length: 255)
     * on every street line. Only line 0 is required. Empty optional lines often stay
     * `undefined`, and Magento's max_text_length rule fails on undefined — Polish UI
     * then shows "Podaj więcej lub dokładnie 255 symboli".
     */
    function isOptionalStreetLineField(component) {
        var name = component && component.name ? String(component.name) : '',
            parentName = component && component.parentName ? String(component.parentName) : '',
            dataScope = component && component.dataScope != null ? String(component.dataScope) : '',
            classes = component && component.additionalClasses,
            match;

        // Magento marks non-first street lines with additionalClasses "additional".
        if (
            classes &&
            typeof classes === 'object' &&
            (classes.additional === true || classes.additional === 'additional') &&
            (name.indexOf('street') !== -1 || parentName.indexOf('street') !== -1)
        ) {
            return true;
        }

        // Full component name: ...form-fields.street.1
        match = name.match(/(?:^|\.)street\.(\d+)(?:\.|$)/);
        if (match) {
            return parseInt(match[1], 10) > 0;
        }

        // Relative dataScope under street group: "1", "2", ...
        if (/^\d+$/.test(dataScope)) {
            if (
                parseInt(dataScope, 10) > 0 &&
                (name.indexOf('.street') !== -1 || parentName.indexOf('street') !== -1)
            ) {
                return true;
            }
        }

        return false;
    }

    function getFieldValue(component) {
        if (!component) {
            return undefined;
        }

        if (typeof component.value === 'function') {
            return component.value();
        }

        return component.value;
    }

    function isEmptyFieldValue(value) {
        return value === undefined || value === null || String(value).trim() === '';
    }

    function normalizeOptionalStreetLineField(component) {
        if (!component || !isOptionalStreetLineField(component)) {
            return;
        }

        if (component.validation && typeof component.validation === 'object') {
            delete component.validation['required-entry'];
            if (Object.prototype.hasOwnProperty.call(component.validation, 'min_text_length')) {
                component.validation.min_text_length = 0;
            }
            // Keep max_text_length only for non-empty values via validate wrapper;
            // Magento's stock rule treats undefined as invalid.
        }

        if (typeof component.required === 'function') {
            component.required(false);
        } else {
            component.required = false;
        }

        // Empty string avoids max_text_length failing on undefined/null.
        if (typeof component.value === 'function' && isEmptyFieldValue(component.value())) {
            if (component.value() !== '') {
                component.value('');
            }
        }

        clearComponentError(component);
    }

    /**
     * Optional street line: empty is always valid; only validate length when filled.
     */
    function validateOptionalStreetLineField(component, originalValidate) {
        var value;

        normalizeOptionalStreetLineField(component);
        value = getFieldValue(component);

        if (isEmptyFieldValue(value)) {
            if (typeof component.value === 'function' && value !== '') {
                component.value('');
            }
            clearComponentError(component);

            return {
                valid: true,
                target: component
            };
        }

        return originalValidate.apply(component, arguments);
    }

    function walkUiTree(component, visitor) {
        var children,
            i;

        if (!component) {
            return;
        }

        visitor(component);

        if (component.elems && typeof component.elems === 'function') {
            children = component.elems() || [];
            for (i = 0; i < children.length; i++) {
                walkUiTree(children[i], visitor);
            }
        }
    }

    function collectBillingFields(billingComponent) {
        var fields = [],
            namePrefix,
            seen = {};

        if (!billingComponent || !billingComponent.name) {
            return fields;
        }

        namePrefix = billingComponent.name + '.';

        function pushField(component) {
            if (
                !component ||
                !component.name ||
                seen[component.name] ||
                typeof component.error !== 'function' ||
                typeof component.validate !== 'function'
            ) {
                return;
            }

            seen[component.name] = true;
            fields.push(component);
        }

        if (registry && typeof registry.filter === 'function') {
            registry.filter(function (component) {
                return Boolean(
                    component &&
                    typeof component.name === 'string' &&
                    component.name.indexOf(namePrefix) === 0 &&
                    typeof component.error === 'function' &&
                    typeof component.validate === 'function'
                );
            }).forEach(pushField);
        }

        if (!fields.length) {
            walkUiTree(billingComponent, function (component) {
                if (component !== billingComponent) {
                    pushField(component);
                }
            });
        }

        return fields;
    }

    function clearBillingDomErrors(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }

        // Do not remove Magento UI / KO-managed error nodes from the DOM —
        // that can break bindings. Clearing component.error() is enough for
        // Knockout templates; only strip leftover jQuery-validator nodes.
        root.querySelectorAll('label.mage-error, div.mage-error').forEach(function (node) {
            if (node && node.parentNode && !node.classList.contains('admin__field-error')) {
                node.parentNode.removeChild(node);
            }
        });

        root.querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
            input.setAttribute('aria-invalid', 'false');
        });

        root.querySelectorAll('.field-error, .mage-error').forEach(function (node) {
            if (!node.classList.contains('admin__field-error')) {
                node.classList.remove('field-error', 'mage-error');
            }
        });
    }

    function forEachBillingValidationComponent(callback) {
        if (!registry || typeof registry.filter !== 'function') {
            return;
        }

        registry.filter(function (item) {
            return Boolean(item && item.fastcheckoutBillingValidation);
        }).forEach(callback);
    }

    return function (BillingAddress) {
        return BillingAddress.extend({
            /**
             * Magento core defaults isAddressSameAsShipping to false and flips it
             * off whenever billingAddress is null. Fastcheckout always starts with
             * "billing same as shipping" checked; shoppers may still uncheck later.
             *
             * @returns {Object}
             */
            initObservable: function () {
                this._super();

                if (
                    isFastcheckoutActive() &&
                    quote &&
                    !quote.isVirtual() &&
                    !userChoseSeparateBilling &&
                    this.isAddressSameAsShipping
                ) {
                    this.isAddressSameAsShipping(true);
                }

                return this;
            },

            /**
             * @returns {Object}
             */
            initialize: function () {
                var self = this;

                this._super();

                if (!isFastcheckoutActive()) {
                    return this;
                }

                this.fastcheckoutBillingValidation = {
                    suppress: false,
                    validationRequested: false,
                    interacted: false,
                    fieldGuards: {}
                };
                this._fastcheckoutSyncingSameAsShipping = false;

                this._fastcheckoutRegisterBillingDocumentGuard();
                // Honor a prior intentional uncheck (e.g. payment method swap remounts this component).
                if (userChoseSeparateBilling) {
                    if (this.isAddressSameAsShipping) {
                        this.isAddressSameAsShipping(false);
                    }
                    if (this.isAddressDetailsVisible) {
                        this.isAddressDetailsVisible(false);
                    }
                } else {
                    this._fastcheckoutApplySameAsShippingDefault();
                }

                if (this.isAddressSameAsShipping && typeof this.isAddressSameAsShipping.subscribe === 'function') {
                    this.isAddressSameAsShipping.subscribe(function (sameAsShipping) {
                        // Ignore intermediate flips while we re-sync shipping → billing.
                        if (self._fastcheckoutSyncingSameAsShipping) {
                            return;
                        }

                        // Shopper opted into a separate billing address — never re-check
                        // for them, and undo accidental true from Magento cache-key sync.
                        if (userChoseSeparateBilling) {
                            if (sameAsShipping) {
                                self._fastcheckoutSyncingSameAsShipping = true;
                                try {
                                    self.isAddressSameAsShipping(false);
                                    if (self.isAddressDetailsVisible) {
                                        self.isAddressDetailsVisible(false);
                                    }
                                } finally {
                                    self._fastcheckoutSyncingSameAsShipping = false;
                                }
                            } else {
                                self._fastcheckoutBeginBillingValidationSuppress();
                            }
                            return;
                        }

                        if (!sameAsShipping) {
                            // Magento core may set false because billing cache key still
                            // points at a placeholder while shipping was updated. Re-assert
                            // default asynchronously after Magento's billingAddress.subscribe.
                            window.setTimeout(function () {
                                if (!userChoseSeparateBilling) {
                                    self._fastcheckoutApplySameAsShippingDefault();
                                }
                            }, 0);
                        }
                    }, this);
                }

                if (this.isAddressDetailsVisible && typeof this.isAddressDetailsVisible.subscribe === 'function') {
                    this.isAddressDetailsVisible.subscribe(function (detailsVisible) {
                        var billing;

                        // Magento always sets detailsVisible=true in billingAddress.subscribe,
                        // including when billing was nulled for separate entry. While there is
                        // no selected billing address yet, keep the entry form open.
                        // After the shopper saves a separate billing address, details may show.
                        if (userChoseSeparateBilling && detailsVisible) {
                            billing = quote && typeof quote.billingAddress === 'function'
                                ? quote.billingAddress()
                                : null;
                            if (!billing) {
                                self._fastcheckoutSyncingSameAsShipping = true;
                                try {
                                    self.isAddressDetailsVisible(false);
                                } finally {
                                    self._fastcheckoutSyncingSameAsShipping = false;
                                }
                                return;
                            }
                        }
                        if (!detailsVisible && userChoseSeparateBilling) {
                            this._fastcheckoutBeginBillingValidationSuppress();
                        }
                    }, this);
                }

                // Magento sets isAddressSameAsShipping from cache-key equality:
                // billing placeholder key ≠ real shipping key → checkbox unchecked.
                // Keep billing mirrored to shipping unless the shopper opted out.
                if (quote && typeof quote.billingAddress === 'function' &&
                    typeof quote.billingAddress.subscribe === 'function') {
                    quote.billingAddress.subscribe(function (newAddress) {
                        if (self._fastcheckoutSyncingSameAsShipping) {
                            return;
                        }
                        if (!userChoseSeparateBilling) {
                            self._fastcheckoutApplySameAsShippingDefault();
                            return;
                        }
                        // Core may flip same-as-shipping from cache keys / set detailsVisible.
                        // Keep checkbox unchecked while the shopper wants a separate address.
                        // Only force the form open when billing was nulled (entry mode).
                        window.setTimeout(function () {
                            if (!userChoseSeparateBilling) {
                                return;
                            }
                            if (self.isAddressSameAsShipping && self.isAddressSameAsShipping()) {
                                self._fastcheckoutSyncingSameAsShipping = true;
                                try {
                                    self.isAddressSameAsShipping(false);
                                } finally {
                                    self._fastcheckoutSyncingSameAsShipping = false;
                                }
                            }
                            if (
                                !newAddress &&
                                self.isAddressDetailsVisible &&
                                self.isAddressDetailsVisible()
                            ) {
                                self.isAddressDetailsVisible(false);
                            }
                        }, 0);
                    });
                }

                if (quote && typeof quote.shippingAddress === 'function' &&
                    typeof quote.shippingAddress.subscribe === 'function') {
                    quote.shippingAddress.subscribe(function () {
                        if (self._fastcheckoutSyncingSameAsShipping) {
                            return;
                        }
                        if (!userChoseSeparateBilling) {
                            self._fastcheckoutApplySameAsShippingDefault();
                        }
                    });
                }

                // Payment renderer re-resolve often re-runs Magento resolver after method pick.
                if (quote && typeof quote.paymentMethod === 'function' &&
                    typeof quote.paymentMethod.subscribe === 'function') {
                    quote.paymentMethod.subscribe(function () {
                        if (!userChoseSeparateBilling) {
                            window.setTimeout(function () {
                                if (!userChoseSeparateBilling) {
                                    self._fastcheckoutApplySameAsShippingDefault();
                                }
                            }, 0);
                        }
                    });
                }

                return this;
            },

            /**
             * True when quote billing is already the shipping address (same cache key
             * or same object). Placeholder keys never match real Magento address keys.
             */
            _fastcheckoutBillingMatchesShipping: function (billing, shipping) {
                if (!billing || !shipping) {
                    return false;
                }
                if (billing === shipping) {
                    return true;
                }
                if (
                    typeof billing.getCacheKey === 'function' &&
                    typeof shipping.getCacheKey === 'function'
                ) {
                    return billing.getCacheKey() === shipping.getCacheKey();
                }
                return false;
            },

            /**
             * Expose the shared shopper intent to the checkout bridge.
             *
             * Magento creates one billing component per payment renderer. Their observables
             * can temporarily flip to false while checkout-data is restored, so the observable
             * alone cannot tell an intentional separate billing address from a renderer race.
             *
             * @returns {Boolean}
             */
            _fastcheckoutHasExplicitSeparateBilling: function () {
                return userChoseSeparateBilling;
            },

            /**
             * Force same-as-shipping checked and billing = shipping.
             * Re-run after shipping updates / payment select — Magento core compares
             * getCacheKey() and unchecks the box when billing is still a placeholder.
             */
            _fastcheckoutApplySameAsShippingDefault: function () {
                var shipping,
                    billing;

                if (!isFastcheckoutActive() || !quote || quote.isVirtual()) {
                    return;
                }
                if (userChoseSeparateBilling) {
                    return;
                }
                if (this._fastcheckoutSyncingSameAsShipping) {
                    return;
                }

                shipping = typeof quote.shippingAddress === 'function'
                    ? quote.shippingAddress()
                    : null;
                billing = typeof quote.billingAddress === 'function'
                    ? quote.billingAddress()
                    : null;

                this._fastcheckoutSyncingSameAsShipping = true;
                try {
                    if (this.isAddressSameAsShipping) {
                        this.isAddressSameAsShipping(true);
                    }

                    if (
                        shipping &&
                        typeof selectBillingAddress === 'function' &&
                        !this._fastcheckoutBillingMatchesShipping(billing, shipping)
                    ) {
                        try {
                            selectBillingAddress(shipping);
                        } catch (e) {
                            // ignore — shipping may still be incomplete
                        }
                    }

                    if (this.isAddressDetailsVisible) {
                        this.isAddressDetailsVisible(true);
                    }
                } finally {
                    this._fastcheckoutSyncingSameAsShipping = false;
                }
            },

            /**
             * Magento binds checked + click. Knockout's checked handler runs first and
             * updates the observable to the NEW value before click:useShippingAddress.
             * Magento core therefore branches on the post-toggle state:
             *   true  → shopper just checked same-as-shipping
             *   false → shopper just unchecked (wants separate billing)
             *
             * @returns {Boolean}
             */
            useShippingAddress: function () {
                var isSame = !!(this.isAddressSameAsShipping && this.isAddressSameAsShipping()),
                    result,
                    self = this;

                if (!isFastcheckoutActive()) {
                    return this._super();
                }

                if (!isSame) {
                    // Shopper just unchecked — mark shared intent BEFORE Magento nulls
                    // billing so other payment components' subscribers do not re-apply.
                    userChoseSeparateBilling = true;
                    result = this._super();
                    this._fastcheckoutSyncingSameAsShipping = true;
                    try {
                        if (this.isAddressSameAsShipping) {
                            this.isAddressSameAsShipping(false);
                        }
                        if (this.isAddressDetailsVisible) {
                            this.isAddressDetailsVisible(false);
                        }
                    } finally {
                        this._fastcheckoutSyncingSameAsShipping = false;
                    }
                    // Prefill form from shipping so street lines are visible.
                    this._fastcheckoutCopyShippingAddressToBillingForm();
                    this._fastcheckoutBeginBillingValidationSuppress();
                    this._fastcheckoutNormalizeBillingStreetLines();
                    this._fastcheckoutGuardBillingFields();
                    // Magento billingAddress.subscribe always sets detailsVisible=true after
                    // nulling billing — re-assert form open on the next tick.
                    window.setTimeout(function () {
                        if (!userChoseSeparateBilling) {
                            return;
                        }
                        self._fastcheckoutSyncingSameAsShipping = true;
                        try {
                            if (self.isAddressSameAsShipping && self.isAddressSameAsShipping()) {
                                self.isAddressSameAsShipping(false);
                            }
                            if (self.isAddressDetailsVisible && self.isAddressDetailsVisible()) {
                                self.isAddressDetailsVisible(false);
                            }
                        } finally {
                            self._fastcheckoutSyncingSameAsShipping = false;
                        }
                    }, 0);
                    return result;
                }

                // Shopper re-checks same-as-shipping.
                userChoseSeparateBilling = false;
                result = this._super();
                this._fastcheckoutEndBillingValidationSuppress();
                this._fastcheckoutApplySameAsShippingDefault();
                return result;
            },

            /**
             * Collect shipping address from quote + provider + DOM so fields that
             * are not yet flushed to quote (often telephone/street) still copy.
             */
            _fastcheckoutCollectShippingFormData: function () {
                var formData = {},
                    shipping,
                    providerData,
                    root,
                    streetObject = {};

                if (quote && typeof quote.shippingAddress === 'function') {
                    shipping = quote.shippingAddress();
                }

                if (
                    shipping &&
                    addressConverter &&
                    typeof addressConverter.quoteAddressToFormAddressData === 'function'
                ) {
                    formData = addressConverter.quoteAddressToFormAddressData(shipping) || {};
                } else if (shipping) {
                    formData = {
                        firstname: shipping.firstname || '',
                        lastname: shipping.lastname || '',
                        company: shipping.company || '',
                        street: shipping.street || [],
                        city: shipping.city || '',
                        postcode: shipping.postcode || '',
                        country_id: shipping.countryId || shipping.country_id || '',
                        region: shipping.region || '',
                        region_id: shipping.regionId || shipping.region_id || '',
                        telephone: shipping.telephone || ''
                    };
                }

                if (this.source && typeof this.source.get === 'function') {
                    providerData = this.source.get('shippingAddress');
                    if (providerData && typeof providerData === 'object') {
                        formData = $.extend(true, {}, formData, providerData);
                    }
                }

                root = document.querySelector('.fastcheckout-native-shipping-address');
                if (root) {
                    [
                        'firstname', 'lastname', 'company', 'city', 'postcode',
                        'telephone', 'country_id', 'region_id', 'region'
                    ].forEach(function (name) {
                        var el = root.querySelector('[name="' + name + '"]');
                        if (el && String(el.value || '').trim() !== '') {
                            formData[name] = el.value;
                        }
                    });

                    // Magento KO street inputs: street[0], street[1], ...
                    Array.prototype.slice.call(
                        root.querySelectorAll('input[name^="street"]')
                    ).forEach(function (el) {
                        var match = String(el.getAttribute('name') || '').match(/street\[(\d+)]/);
                        if (!match) {
                            return;
                        }
                        streetObject[match[1]] = el.value == null ? '' : String(el.value);
                    });
                    if (Object.keys(streetObject).length) {
                        formData.street = streetObject;
                    }
                }

                return formData;
            },

            /**
             * Copy current shipping address into this billing form's provider scope.
             */
            _fastcheckoutCopyShippingAddressToBillingForm: function () {
                var formData,
                    scope,
                    source,
                    streetObject = {},
                    current,
                    lineKey,
                    lineIndex;

                scope = this.dataScopePrefix;
                source = this.source;
                if (!scope || !source || typeof source.set !== 'function') {
                    return;
                }

                formData = this._fastcheckoutCollectShippingFormData() || {};

                // UI components bind street.0 / street.1 — always use an object map.
                if (Array.isArray(formData.street)) {
                    formData.street.forEach(function (line, index) {
                        streetObject[index] = line == null ? '' : String(line);
                    });
                } else if (formData.street && typeof formData.street === 'object') {
                    Object.keys(formData.street).forEach(function (key) {
                        streetObject[key] = formData.street[key] == null
                            ? ''
                            : String(formData.street[key]);
                    });
                }
                if (typeof streetObject[0] === 'undefined' && typeof streetObject['0'] === 'undefined') {
                    streetObject[0] = '';
                }
                if (typeof streetObject[1] === 'undefined' && typeof streetObject['1'] === 'undefined') {
                    streetObject[1] = '';
                }
                formData.street = streetObject;

                // Prefer non-empty country/region ids as strings for selects.
                if (formData.region_id != null && formData.region_id !== '') {
                    formData.region_id = String(formData.region_id);
                }
                if (formData.country_id != null && formData.country_id !== '') {
                    formData.country_id = String(formData.country_id);
                }

                current = typeof source.get === 'function' ? (source.get(scope) || {}) : {};
                source.set(scope, $.extend(true, {}, current, formData));

                for (lineKey in formData.street) {
                    if (Object.prototype.hasOwnProperty.call(formData.street, lineKey)) {
                        source.set(scope + '.street.' + lineKey, formData.street[lineKey]);
                    }
                }

                // Push values into already-mounted UI components (provider set alone
                // does not always refresh linked street children).
                collectBillingFields(this).forEach(function (field) {
                    var match,
                        value,
                        fieldName = field && field.name ? String(field.name) : '';

                    if (!field || !fieldName || typeof field.value !== 'function') {
                        return;
                    }

                    match = fieldName.match(/(?:^|\.)street\.(\d+)(?:\.|$)/);
                    if (match) {
                        lineIndex = match[1];
                        value = formData.street[lineIndex];
                        if (typeof value === 'undefined') {
                            value = formData.street[String(lineIndex)];
                        }
                        if (typeof value !== 'undefined') {
                            field.value(value == null ? '' : String(value));
                        }
                        return;
                    }

                    // Flat fields: firstname, lastname, city, telephone...
                    [
                        'firstname', 'lastname', 'company', 'city', 'postcode',
                        'telephone', 'country_id', 'region_id', 'region',
                        'prefix', 'middlename', 'suffix', 'fax', 'vat_id'
                    ].forEach(function (code) {
                        var suffix = '.' + code,
                            endsWithCode = fieldName.length >= suffix.length &&
                                fieldName.indexOf(suffix) === fieldName.length - suffix.length;

                        if (endsWithCode && typeof formData[code] !== 'undefined' && formData[code] !== null) {
                            field.value(formData[code]);
                        }
                    });
                });

                if (checkoutData && typeof checkoutData.setBillingAddressFromData === 'function') {
                    checkoutData.setBillingAddressFromData(formData);
                }

                // Mirror into shared / other payment billing scopes (same provider).
                ['billingAddress', 'billingAddressshared'].forEach(function (sharedScope) {
                    if (sharedScope === scope) {
                        return;
                    }
                    try {
                        source.set(sharedScope, $.extend(true, {}, formData));
                        Object.keys(formData.street).forEach(function (key) {
                            source.set(sharedScope + '.street.' + key, formData.street[key]);
                        });
                    } catch (e) {
                        // Scope may not exist yet for inactive payment methods.
                    }
                });
            },

            /**
             * Explicit update is intentional validation.
             */
            updateAddress: function () {
                if (isFastcheckoutActive()) {
                    this._fastcheckoutAllowBillingValidation();
                    this._fastcheckoutNormalizeBillingStreetLines();
                    this._fastcheckoutGuardBillingFields();
                }

                return this._super();
            },

            /**
             * Opening the form for edit must not show stale/premature errors.
             */
            editAddress: function () {
                var result = this._super();

                if (isFastcheckoutActive()) {
                    this._fastcheckoutBeginBillingValidationSuppress();
                }

                return result;
            },

            _fastcheckoutRegisterBillingDocumentGuard: function () {
                if (documentGuardRegistered) {
                    return;
                }

                documentGuardRegistered = true;

                ['pointerdown', 'keydown', 'change', 'input'].forEach(function (eventName) {
                    document.addEventListener(eventName, function (event) {
                        if (!isBillingFormElement(event && event.target)) {
                            return;
                        }

                        forEachBillingValidationComponent(function (billingComponent) {
                            if (billingComponent._fastcheckoutMarkBillingInteracted) {
                                billingComponent._fastcheckoutMarkBillingInteracted();
                            }
                        });
                    }, true);
                });

                // Place order / Update should always be allowed to show real errors.
                document.addEventListener('click', function (event) {
                    var target = event && event.target,
                        actionButton;

                    if (!target || !target.closest) {
                        return;
                    }

                    actionButton = target.closest(
                        '[data-role="review-save"], ' +
                        'button.action.primary.checkout, ' +
                        '#fastcheckout-checkout button[type="submit"], ' +
                        '#fastcheckout-checkout [data-fastcheckout-place-order], ' +
                        '.payment-method-billing-address .action-update'
                    );

                    if (!actionButton) {
                        return;
                    }

                    forEachBillingValidationComponent(function (billingComponent) {
                        if (billingComponent._fastcheckoutAllowBillingValidation) {
                            billingComponent._fastcheckoutAllowBillingValidation();
                        }
                    });
                }, true);
            },

            _fastcheckoutMarkBillingInteracted: function () {
                if (!this.fastcheckoutBillingValidation) {
                    return;
                }

                this.fastcheckoutBillingValidation.interacted = true;
                this.fastcheckoutBillingValidation.suppress = false;
            },

            _fastcheckoutAllowBillingValidation: function () {
                if (!this.fastcheckoutBillingValidation) {
                    return;
                }

                this.fastcheckoutBillingValidation.validationRequested = true;
                this.fastcheckoutBillingValidation.suppress = false;
            },

            _fastcheckoutEndBillingValidationSuppress: function () {
                if (!this.fastcheckoutBillingValidation) {
                    return;
                }

                this.fastcheckoutBillingValidation.suppress = false;
            },

            _fastcheckoutShouldSuppressBillingValidation: function () {
                var state = this.fastcheckoutBillingValidation;

                return Boolean(
                    state &&
                    state.suppress &&
                    !state.interacted &&
                    !state.validationRequested
                );
            },

            _fastcheckoutBeginBillingValidationSuppress: function () {
                var self = this,
                    state = this.fastcheckoutBillingValidation;

                if (!state) {
                    return;
                }

                state.suppress = true;
                state.interacted = false;
                state.validationRequested = false;

                this._fastcheckoutClearBillingFieldErrors();
                this._fastcheckoutGuardBillingFields();

                // Value/provider sync often lands a tick after the form is revealed.
                [0, 50, 200, 500].forEach(function (delay) {
                    setTimeout(function () {
                        if (self._fastcheckoutShouldSuppressBillingValidation()) {
                            self._fastcheckoutClearBillingFieldErrors();
                            self._fastcheckoutGuardBillingFields();
                        }
                    }, delay);
                });
            },

            _fastcheckoutClearBillingFieldErrors: function () {
                var root;

                collectBillingFields(this).forEach(function (field) {
                    clearComponentError(field);
                });

                if (this.source && typeof this.source.set === 'function') {
                    this.source.set('params.invalid', false);
                }

                root = document.querySelector(
                    '.payment-method._active .payment-method-billing-address, ' +
                    '.payment-method-billing-address'
                );
                clearBillingDomErrors(root);
            },

            _fastcheckoutGuardBillingFields: function () {
                var self = this,
                    state = this.fastcheckoutBillingValidation;

                if (!state) {
                    return;
                }

                collectBillingFields(this).forEach(function (field) {
                    var originalValidate;

                    if (!field || !field.name || state.fieldGuards[field.name]) {
                        return;
                    }

                    state.fieldGuards[field.name] = true;
                    normalizeOptionalStreetLineField(field);

                    if (field.error && typeof field.error.subscribe === 'function') {
                        field.error.subscribe(function () {
                            if (self._fastcheckoutShouldSuppressBillingValidation()) {
                                clearComponentError(field);
                            }
                        });
                    }

                    // Wrap validate so stock onUpdate / setValidation cannot paint errors yet.
                    if (typeof field.validate === 'function' && !field.fastcheckoutBillingValidateWrapped) {
                        field.fastcheckoutBillingValidateWrapped = true;
                        originalValidate = field.validate;

                        field.validate = function () {
                            if (self._fastcheckoutShouldSuppressBillingValidation()) {
                                clearComponentError(field);

                                return {
                                    valid: true,
                                    target: field
                                };
                            }

                            if (isOptionalStreetLineField(field)) {
                                return validateOptionalStreetLineField(field, originalValidate);
                            }

                            return originalValidate.apply(field, arguments);
                        };
                    }
                });
            },

            /**
             * Always install optional-street guards when the separate billing form
             * is shown — not only during premature-validation suppress.
             */
            _fastcheckoutNormalizeBillingStreetLines: function () {
                collectBillingFields(this).forEach(function (field) {
                    if (isOptionalStreetLineField(field)) {
                        normalizeOptionalStreetLineField(field);
                    }
                });
            }
        });
    };
});
