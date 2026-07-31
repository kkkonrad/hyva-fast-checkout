/**
 * Snapshot / restore guest shipping address across reloads and successful place-order.
 *
 * Magento customer-data initialization can replace the client-side checkout-data section
 * before the shipping component consumes it. Fastcheckout keeps an independent session
 * snapshot so a reload (and the next checkout after place-order) can re-fill the form.
 */
define([], function () {
    'use strict';

    var STORAGE_KEY = 'fastcheckout_last_guest_address';
    var EMAIL_KEY = 'fastcheckout_email';
    var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    /**
     * Delayed snapshot restore (country options arrive async) used to re-force the
     * previous country for up to ~7s. That fought the first shopper country change:
     * select DE → delayed restore writes PL back → only the second change sticks.
     * Bump this generation (and set the touch flag) on any destination field edit.
     */
    var restoreGeneration = 0,
        userTouchedDestination = false,
        destinationTouchBound = false,
        autoSnapshotBound = false,
        autoSnapshotTimer = null,
        // True while forceUiSelectComponents is writing snapshot values (ignore those).
        restoreWriteInProgress = false,
        lastRestoredCountryId = '',
        countryWatchBound = false;

    function markUserTouchedDestination() {
        if (restoreWriteInProgress) {
            return;
        }
        userTouchedDestination = true;
        restoreGeneration += 1;
    }

    function hasUserTouchedDestination() {
        return userTouchedDestination === true;
    }

    function bindDestinationTouchGuard() {
        if (destinationTouchBound || typeof document === 'undefined') {
            return;
        }
        destinationTouchBound = true;

        document.addEventListener('change', function (event) {
            var target = event && event.target,
                name;

            // Ignore programmatic restores (dispatchEvent / jQuery.trigger → isTrusted false).
            // Real shopper gestures set isTrusted=true.
            if (!event || event.isTrusted === false) {
                return;
            }
            if (!target || !target.getAttribute) {
                return;
            }
            name = String(target.getAttribute('name') || target.name || '');
            if (
                name !== 'country_id' &&
                name !== 'region_id' &&
                name !== 'region' &&
                name !== 'postcode'
            ) {
                return;
            }
            // Only shipping form — not billing embedded in payment methods.
            if (
                target.closest &&
                target.closest(
                    '.payment-method-billing-address, [data-form="billing-new-address"]'
                )
            ) {
                return;
            }
            markUserTouchedDestination();
        }, true);
    }

    /**
     * Magento UI country select sometimes updates the KO observable without a trusted
     * DOM change (or Playwright tests set values programmatically). Treat a value that
     * diverges from the last restored snapshot country as a shopper edit.
     */
    function bindCountryValueWatch(snapshotCountryId) {
        if (countryWatchBound || typeof require !== 'function') {
            return;
        }
        countryWatchBound = true;
        lastRestoredCountryId = snapshotCountryId ? String(snapshotCountryId) : '';

        require(['uiRegistry'], function (registry) {
            var name =
                    'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id',
                field;

            function attach(comp) {
                if (!comp || typeof comp.value !== 'function' || !comp.value.subscribe) {
                    return;
                }
                comp.value.subscribe(function (newVal) {
                    var next = newVal == null ? '' : String(newVal);

                    if (restoreWriteInProgress || hasUserTouchedDestination()) {
                        return;
                    }
                    // Ignore empty / still-on-snapshot values during initial paint.
                    if (!next || (lastRestoredCountryId && next === lastRestoredCountryId)) {
                        return;
                    }
                    markUserTouchedDestination();
                });
            }

            try {
                field = registry.get(name);
            } catch (e) {
                field = null;
            }
            if (field) {
                attach(field);
                return;
            }
            if (registry && typeof registry.async === 'function') {
                registry.async(name)(attach);
            }
        });
    }

    function readJson(key) {
        try {
            var raw = window.sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            window.sessionStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // ignore quota / private mode
        }
    }

    function removeSnapshot() {
        try {
            window.sessionStorage.removeItem(STORAGE_KEY);
            [
                'email', 'firstname', 'lastname', 'company',
                'street1', 'street2', 'city', 'postcode',
                'countryId', 'regionId', 'region', 'telephone'
            ].forEach(function (field) {
                window.sessionStorage.removeItem('fastcheckout_' + field);
            });
        } catch (e) {
            // ignore storage failures
        }
    }

    function streetLines(street) {
        if (Array.isArray(street)) {
            return street;
        }
        if (street && typeof street === 'object') {
            return [street[0] || street['0'] || '', street[1] || street['1'] || ''];
        }
        if (street) {
            return [String(street), ''];
        }
        return ['', ''];
    }

    function normalizeValues(source) {
        var street,
            values;

        if (!source || typeof source !== 'object') {
            return null;
        }

        street = streetLines(source.street || source.street1 ? {
            0: source.street1 || (source.street && (source.street[0] || source.street['0'])) || '',
            1: source.street2 || (source.street && (source.street[1] || source.street['1'])) || ''
        } : source.street);

        values = {
            email: String(source.email || '').trim(),
            firstname: String(source.firstname || '').trim(),
            lastname: String(source.lastname || '').trim(),
            company: String(source.company || '').trim(),
            street1: String(street[0] || '').trim(),
            street2: String(street[1] || '').trim(),
            city: String(source.city || '').trim(),
            postcode: String(source.postcode || '').trim(),
            countryId: String(source.countryId || source.country_id || '').trim(),
            regionId: source.regionId || source.region_id || '',
            region: String(source.region || '').trim(),
            telephone: String(source.telephone || '').trim(),
            prefix: String(source.prefix || '').trim(),
            middlename: String(source.middlename || '').trim(),
            suffix: String(source.suffix || '').trim(),
            fax: String(source.fax || '').trim(),
            vatId: String(source.vatId || source.vat_id || '').trim()
        };

        if (
            !values.firstname &&
            !values.lastname &&
            !values.street1 &&
            !values.city &&
            !values.postcode &&
            !values.telephone &&
            !values.email
        ) {
            return null;
        }

        return values;
    }

    function collectFromDom() {
        var root = document.querySelector(
                '.fastcheckout-native-shipping-address, #shipping, form#co-shipping-form'
            ) || document,
            get = function (sel) {
                var el = root.querySelector(sel) || document.querySelector(sel);
                return el && el.value ? String(el.value).trim() : '';
            };

        return normalizeValues({
            email: get('#customer-email') || get('input[type="email"]') || get('input[name="username"]') || get('input[name="email"]'),
            firstname: get('input[name="firstname"]'),
            lastname: get('input[name="lastname"]'),
            company: get('input[name="company"]'),
            street: {
                0: get('input[name="street[0]"]') || get('input[name="street.0"]'),
                1: get('input[name="street[1]"]') || get('input[name="street.1"]')
            },
            city: get('input[name="city"]'),
            postcode: get('input[name="postcode"]'),
            country_id: get('select[name="country_id"]'),
            region_id: get('select[name="region_id"]') || get('input[name="region_id"]'),
            region: get('input[name="region"]') || get('select[name="region"]'),
            telephone: get('input[name="telephone"]')
        });
    }

    function collectFromQuote(quote) {
        var shipping;

        if (!quote || typeof quote.shippingAddress !== 'function') {
            return null;
        }
        shipping = quote.shippingAddress();
        if (!shipping) {
            return null;
        }

        return normalizeValues({
            email: quote.guestEmail
                ? (typeof quote.guestEmail === 'function' ? quote.guestEmail() : quote.guestEmail)
                : '',
            firstname: shipping.firstname,
            lastname: shipping.lastname,
            company: shipping.company,
            street: shipping.street,
            city: shipping.city,
            postcode: shipping.postcode,
            countryId: shipping.countryId || shipping.country_id,
            regionId: shipping.regionId || shipping.region_id,
            region: shipping.region,
            telephone: shipping.telephone,
            prefix: shipping.prefix,
            middlename: shipping.middlename,
            suffix: shipping.suffix,
            fax: shipping.fax,
            vatId: shipping.vatId || shipping.vat_id
        });
    }

    function collectFromCheckoutData(checkoutData) {
        var data;

        if (!checkoutData || typeof checkoutData.getShippingAddressFromData !== 'function') {
            return null;
        }
        try {
            data = checkoutData.getShippingAddressFromData();
        } catch (e) {
            return null;
        }
        if (!data || typeof data !== 'object') {
            return null;
        }
        // Magento may store by store code
        if (data.firstname || data.street || data.city) {
            return normalizeValues(data);
        }
        if (window.checkoutConfig && window.checkoutConfig.storeCode && data[window.checkoutConfig.storeCode]) {
            return normalizeValues(data[window.checkoutConfig.storeCode]);
        }
        // first nested object
        try {
            var keys = Object.keys(data);
            if (keys.length && data[keys[0]] && typeof data[keys[0]] === 'object') {
                return normalizeValues(data[keys[0]]);
            }
        } catch (e2) {
            // ignore
        }
        return null;
    }

    function persistSnapshotValues(values) {
        var normalized = normalizeValues(values);

        if (!normalized) {
            return null;
        }

        writeJson(STORAGE_KEY, {
            createdAt: Date.now(),
            values: normalized
        });

        if (normalized.email) {
            try {
                window.sessionStorage.setItem(EMAIL_KEY, normalized.email);
            } catch (e) {
                // ignore
            }
        }

        // Also mirror Magento-style fields for older restore paths.
        try {
            [
                'email', 'firstname', 'lastname', 'company',
                'street1', 'street2', 'city', 'postcode',
                'countryId', 'regionId', 'region', 'telephone'
            ].forEach(function (field) {
                if (normalized[field]) {
                    window.sessionStorage.setItem(
                        'fastcheckout_' + field,
                        String(normalized[field])
                    );
                } else {
                    window.sessionStorage.removeItem('fastcheckout_' + field);
                }
            });
        } catch (e2) {
            // ignore
        }

        return normalized;
    }

    /**
     * Build and persist snapshot. Prefer richest source (quote > checkout-data > DOM).
     *
     * @param {Object} [deps]
     * @param {Object} [deps.quote]
     * @param {Object} [deps.checkoutData]
     * @returns {Object|null} saved values
     */
    function snapshot(deps) {
        var depsSafe = deps || {},
            fromQuote = collectFromQuote(depsSafe.quote),
            fromCheckoutData = collectFromCheckoutData(depsSafe.checkoutData),
            fromDom = collectFromDom(),
            merged = {},
            sources = [fromCheckoutData, fromDom, fromQuote];

        sources.forEach(function (src) {
            if (!src) {
                return;
            }
            Object.keys(src).forEach(function (k) {
                if (src[k] !== '' && src[k] !== null && typeof src[k] !== 'undefined') {
                    merged[k] = src[k];
                }
            });
        });

        // Prefer non-empty email from any source / session
        if (!merged.email) {
            try {
                merged.email = window.sessionStorage.getItem(EMAIL_KEY) || '';
            } catch (e) {
                merged.email = '';
            }
        }

        merged = normalizeValues(merged);
        if (!merged) {
            return null;
        }

        return persistSnapshotValues(merged);
    }

    /**
     * Persist the live guest form without merging stale quote/provider values.
     * Empty fields must stay empty: otherwise clearing a field and reloading would
     * resurrect its previous quote value.
     *
     * @returns {Object|null}
     */
    function isCustomerLoggedIn() {
        return !!(
            (typeof window !== 'undefined' && window.isCustomerLoggedIn) ||
            (typeof window !== 'undefined' &&
                window.checkoutConfig &&
                window.checkoutConfig.isCustomerLoggedIn)
        );
    }

    function snapshotCurrentForm() {
        var values;

        if (
            restoreWriteInProgress ||
            window.fastcheckoutOrderPlaced ||
            isCustomerLoggedIn()
        ) {
            return null;
        }

        values = collectFromDom();
        if (!values) {
            removeSnapshot();
            return null;
        }

        return persistSnapshotValues(values);
    }

    function isShippingFormField(target) {
        var name;

        if (
            !target ||
            !target.getAttribute ||
            !target.closest ||
            !target.closest('.fastcheckout-native-shipping-address')
        ) {
            return false;
        }

        name = String(target.getAttribute('name') || target.id || '');

        return Boolean(
            name === 'customer-email' ||
            name === 'email' ||
            name === 'username' ||
            name === 'firstname' ||
            name === 'lastname' ||
            name === 'company' ||
            name === 'city' ||
            name === 'postcode' ||
            name === 'country_id' ||
            name === 'region_id' ||
            name === 'region' ||
            name === 'telephone' ||
            name.indexOf('street') === 0
        );
    }

    function scheduleAutoSnapshot() {
        if (autoSnapshotTimer) {
            window.clearTimeout(autoSnapshotTimer);
        }

        autoSnapshotTimer = window.setTimeout(function () {
            autoSnapshotTimer = null;
            snapshotCurrentForm();
        }, 250);
    }

    /**
     * Keep a reload-safe guest snapshot while the standard Magento form is edited.
     */
    function bindAutoSnapshot() {
        if (
            autoSnapshotBound ||
            typeof document === 'undefined' ||
            isCustomerLoggedIn()
        ) {
            return;
        }

        autoSnapshotBound = true;

        ['input', 'change'].forEach(function (eventName) {
            document.addEventListener(eventName, function (event) {
                // KO/provider restore dispatches synthetic events. Persist only browser/user
                // edits so an empty initialization pass cannot erase a valid snapshot.
                if (!event || event.isTrusted === false) {
                    return;
                }
                if (isShippingFormField(event && event.target)) {
                    scheduleAutoSnapshot();
                }
            }, true);
        });

        window.addEventListener('pagehide', function () {
            if (autoSnapshotTimer) {
                window.clearTimeout(autoSnapshotTimer);
                autoSnapshotTimer = null;
                snapshotCurrentForm();
            }
        });
    }

    function load() {
        var payload = readJson(STORAGE_KEY),
            age;

        if (!payload || !payload.values) {
            return null;
        }
        age = Date.now() - (payload.createdAt || 0);
        if (age < 0 || age > MAX_AGE_MS) {
            return null;
        }
        return normalizeValues(payload.values);
    }

    /**
     * Convert snapshot values to Magento checkout form / provider shape.
     */
    function toFormAddressData(values) {
        var v = normalizeValues(values);

        if (!v) {
            return null;
        }

        return {
            email: v.email || '',
            firstname: v.firstname || '',
            lastname: v.lastname || '',
            company: v.company || '',
            street: {
                0: v.street1 || '',
                1: v.street2 || ''
            },
            city: v.city || '',
            postcode: v.postcode || '',
            country_id: v.countryId || '',
            countryId: v.countryId || '',
            region_id: v.regionId || '',
            regionId: v.regionId || '',
            region: v.region || '',
            telephone: v.telephone || '',
            prefix: v.prefix || '',
            middlename: v.middlename || '',
            suffix: v.suffix || '',
            fax: v.fax || '',
            vat_id: v.vatId || '',
            vatId: v.vatId || ''
        };
    }

    /**
     * Apply snapshot into Magento checkout-data + quote + provider (when deps given).
     *
     * @param {Object} deps
     * @param {Object} [deps.quote]
     * @param {Object} [deps.checkoutData]
     * @param {Function} [deps.selectShippingAddress]
     * @param {Function} [deps.selectBillingAddress]
     * @param {Object} [deps.addressConverter]
     * @param {Function} [deps.syncProvider] function(formData, type)
     * @param {Boolean} [deps.force=false] overwrite non-empty quote firstname
     * @returns {Boolean}
     */
    function restore(deps) {
        var values = load(),
            formData,
            quoteAddress,
            shipping,
            depsSafe = deps || {},
            quoteAlreadyFilled = false,
            applied = false,
            generation,
            separateBillingSelected = false;

        bindDestinationTouchGuard();

        // Address-book customers must keep Magento customer-address selection.
        // Writing newCustomerShippingAddress here creates a second list item and
        // deselects the default shipping card after reload.
        if (isCustomerLoggedIn()) {
            return false;
        }

        if (!values) {
            return false;
        }

        // Shopper already changed country/region/postcode — never re-force snapshot dest.
        if (hasUserTouchedDestination() && !depsSafe.force) {
            return false;
        }

        formData = toFormAddressData(values);
        if (!formData) {
            return false;
        }

        try {
            separateBillingSelected = Boolean(
                depsSafe.checkoutData &&
                typeof depsSafe.checkoutData.getSelectedBillingAddress === 'function' &&
                depsSafe.checkoutData.getSelectedBillingAddress()
            );
        } catch (billingSelectionError) {
            separateBillingSelected = false;
        }

        generation = restoreGeneration;
        lastRestoredCountryId = values.countryId ? String(values.countryId) : '';
        bindCountryValueWatch(lastRestoredCountryId);

        // Don't replace a shopper-edited quote address unless force.
        if (!depsSafe.force && depsSafe.quote && typeof depsSafe.quote.shippingAddress === 'function') {
            shipping = depsSafe.quote.shippingAddress();
            if (shipping && String(shipping.firstname || '').trim() !== '') {
                quoteAlreadyFilled = true;
            }
        }

        // Always re-hydrate Magento checkout-data + provider + form UI.
        // Magento shipping view reads checkoutData → checkoutProvider on init;
        // if we only set quote.shippingAddress, visible fields stay empty (email only
        // comes back from session).
        try {
            if (depsSafe.checkoutData) {
                // Temporarily allow writes even if a previous order flagged the page.
                window.fastcheckoutOrderPlaced = false;
                if (typeof depsSafe.checkoutData.setShippingAddressFromData === 'function') {
                    depsSafe.checkoutData.setShippingAddressFromData(formData);
                }
                if (typeof depsSafe.checkoutData.setNewCustomerShippingAddress === 'function') {
                    depsSafe.checkoutData.setNewCustomerShippingAddress(formData);
                }
                if (!separateBillingSelected) {
                    if (typeof depsSafe.checkoutData.setBillingAddressFromData === 'function') {
                        depsSafe.checkoutData.setBillingAddressFromData(formData);
                    }
                    if (typeof depsSafe.checkoutData.setNewCustomerBillingAddress === 'function') {
                        depsSafe.checkoutData.setNewCustomerBillingAddress(formData);
                    }
                }
                if (values.email) {
                    if (typeof depsSafe.checkoutData.setValidatedEmailValue === 'function') {
                        depsSafe.checkoutData.setValidatedEmailValue(values.email);
                    }
                    if (typeof depsSafe.checkoutData.setInputFieldEmailValue === 'function') {
                        depsSafe.checkoutData.setInputFieldEmailValue(values.email);
                    }
                }
                applied = true;
            }
        } catch (e) {
            // continue
        }

        if (!quoteAlreadyFilled) {
            try {
                if (depsSafe.addressConverter &&
                    typeof depsSafe.addressConverter.formAddressDataToQuoteAddress === 'function') {
                    quoteAddress = depsSafe.addressConverter.formAddressDataToQuoteAddress(formData);
                    if (quoteAddress && typeof depsSafe.selectShippingAddress === 'function') {
                        depsSafe.selectShippingAddress(quoteAddress);
                    }
                    if (
                        !separateBillingSelected &&
                        quoteAddress &&
                        typeof depsSafe.selectBillingAddress === 'function'
                    ) {
                        depsSafe.selectBillingAddress(quoteAddress);
                    }
                    applied = true;
                }
            } catch (e2) {
                // continue
            }
        }

        if (values.email && depsSafe.quote) {
            if (typeof depsSafe.quote.guestEmail === 'function') {
                depsSafe.quote.guestEmail(values.email);
            } else {
                depsSafe.quote.guestEmail = values.email;
            }
        }

        // Magento UI form binds to checkoutProvider.shippingAddress.*
        // Defer country_id / region_id provider writes until directory options are
        // ready — early writes with empty dictionaries leave country select blank.
        if (typeof depsSafe.syncProvider === 'function') {
            try {
                depsSafe.syncProvider(formDataWithoutCountry(formData), 'shipping');
                if (!separateBillingSelected) {
                    depsSafe.syncProvider(formDataWithoutCountry(formData), 'billing');
                }
                applied = true;
            } catch (e3) {
                // ignore
            }
            // Full address including country once Magento country field has options.
            scheduleCountryAwareProviderSync(
                depsSafe,
                formData,
                values,
                generation,
                separateBillingSelected
            );
        }

        // Always paint text inputs when empty (UI may lag quote).
        // Country/region selects are handled separately once options exist.
        try {
            fillEmptyDomFields(values);
            applied = true;
        } catch (e4) {
            // ignore
        }

        try {
            forceUiSelectComponents(values, generation);
        } catch (e5) {
            // ignore
        }

        return applied;
    }

    function formDataWithoutCountry(formData) {
        var copy = {};
        Object.keys(formData || {}).forEach(function (key) {
            if (key === 'country_id' || key === 'countryId' ||
                key === 'region_id' || key === 'regionId' || key === 'region') {
                return;
            }
            copy[key] = formData[key];
        });
        return copy;
    }

    function scheduleCountryAwareProviderSync(
        depsSafe,
        formData,
        values,
        generation,
        separateBillingSelected
    ) {
        function trySync() {
            var ready = false;

            // Cancelled: newer restore scheduled, or shopper edited destination.
            if (
                (typeof generation === 'number' && generation !== restoreGeneration) ||
                hasUserTouchedDestination()
            ) {
                return true;
            }

            try {
                if (typeof require === 'function' && require.defined && require.defined('uiRegistry')) {
                    var registry = require('uiRegistry');
                    var countryComp = registry.get(
                        'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id'
                    );
                    var opts = countryComp && typeof countryComp.options === 'function'
                        ? (countryComp.options() || [])
                        : [];
                    ready = opts.length > 10;
                }
            } catch (e) {
                ready = false;
            }

            if (!ready) {
                var el = document.querySelector('select[name="country_id"]');
                ready = !!(el && el.options && el.options.length > 10);
            }

            if (!ready) {
                return false;
            }

            try {
                if (typeof depsSafe.syncProvider === 'function') {
                    // If the shopper already changed country, only push non-destination fields.
                    if (hasUserTouchedDestination()) {
                        depsSafe.syncProvider(formDataWithoutCountry(formData), 'shipping');
                        if (!separateBillingSelected) {
                            depsSafe.syncProvider(formDataWithoutCountry(formData), 'billing');
                        }
                    } else {
                        depsSafe.syncProvider(formData, 'shipping');
                        if (!separateBillingSelected) {
                            depsSafe.syncProvider(formData, 'billing');
                        }
                    }
                }
            } catch (e2) {
                // ignore
            }

            try {
                if (!hasUserTouchedDestination()) {
                    forceUiSelectComponents(values, generation);
                }
                fillEmptyDomFields(values);
            } catch (e3) {
                // ignore
            }

            return true;
        }

        if (trySync()) {
            return;
        }

        [500, 1200, 2500, 4500, 7000].forEach(function (delay) {
            window.setTimeout(function () {
                trySync();
            }, delay);
        });
    }

    function forceUiSelectComponents(values, generation) {
        if (!values || typeof require !== 'function') {
            return;
        }

        if (hasUserTouchedDestination()) {
            return;
        }

        require(['uiRegistry'], function (registry) {
            if (!registry || typeof registry.get !== 'function') {
                return;
            }

            var shippingCountryName =
                    'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id',
                shippingRegionName =
                    'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.region_id';

            function isRestoreStillActive() {
                if (hasUserTouchedDestination()) {
                    return false;
                }
                if (typeof generation === 'number' && generation !== restoreGeneration) {
                    return false;
                }
                return true;
            }

            function componentOptions(component) {
                var opts;
                if (!component) {
                    return [];
                }
                if (typeof component.options === 'function') {
                    opts = component.options() || [];
                } else {
                    opts = component.options || component.initialOptions || [];
                }
                return Array.isArray(opts) ? opts : [];
            }

            function setComponentValue(component, value) {
                var opts,
                    hasOpt = false;

                if (!component || value === '' || value === null || typeof value === 'undefined') {
                    return false;
                }

                opts = componentOptions(component);
                // Never force a country value before Magento has loaded directory options —
                // that leaves the <select> with 0 options and an empty visible field.
                if (opts.length < 2) {
                    return false;
                }

                opts.forEach(function (opt) {
                    if (opt && String(opt.value) === String(value)) {
                        hasOpt = true;
                    }
                });
                if (!hasOpt) {
                    return false;
                }

                try {
                    if (typeof component.value === 'function') {
                        if (String(component.value() || '') !== String(value)) {
                            component.value(String(value));
                        }
                        // Nudge KO to re-render option list selection.
                        if (typeof component.error === 'function') {
                            component.error(false);
                        }
                        return String(component.value() || '') === String(value);
                    }
                    if (typeof component.set === 'function') {
                        component.set('value', String(value));
                        return true;
                    }
                } catch (e) {
                    return false;
                }
                return false;
            }

            function findShippingField(inputName) {
                var preferred = inputName === 'country_id' ? shippingCountryName : shippingRegionName,
                    found = null;

                try {
                    found = registry.get(preferred);
                    if (found) {
                        return found;
                    }
                } catch (e) {
                    found = null;
                }

                if (typeof registry.filter !== 'function') {
                    return null;
                }

                (registry.filter(function (item) {
                    return item &&
                        (item.inputName === inputName || item.index === inputName) &&
                        item.dataScope &&
                        String(item.dataScope).indexOf('shippingAddress') === 0;
                }) || []).some(function (item) {
                    found = item;
                    return true;
                });

                return found;
            }

            function apply() {
                var countryComp,
                    regionComp,
                    countryOk = false,
                    countryEl,
                    regionEl;

                if (!isRestoreStillActive()) {
                    return false;
                }

                restoreWriteInProgress = true;
                try {
                    countryComp = findShippingField('country_id');
                    regionComp = findShippingField('region_id');

                    countryOk = setComponentValue(countryComp, values.countryId);
                    // Region only after country is set / options ready.
                    setComponentValue(regionComp, values.regionId);

                    // Sync native <select> once component has options (KO may lag one tick).
                    countryEl = document.querySelector(
                        '.fastcheckout-native-shipping-address select[name="country_id"], ' +
                        'select[name="country_id"]'
                    );
                    regionEl = document.querySelector(
                        '.fastcheckout-native-shipping-address select[name="region_id"], ' +
                        'select[name="region_id"]'
                    );

                    if (
                        isRestoreStillActive() &&
                        countryEl &&
                        values.countryId &&
                        countryEl.options &&
                        countryEl.options.length > 1
                    ) {
                        if (String(countryEl.value || '') !== String(values.countryId)) {
                            countryEl.value = String(values.countryId);
                            countryEl.dispatchEvent(new Event('change', { bubbles: true }));
                            if (window.jQuery) {
                                try {
                                    window.jQuery(countryEl).val(String(values.countryId)).trigger('change');
                                } catch (e) {
                                    // ignore
                                }
                            }
                        }
                    }

                    if (
                        isRestoreStillActive() &&
                        regionEl &&
                        values.regionId &&
                        regionEl.options &&
                        regionEl.options.length > 1
                    ) {
                        if (String(regionEl.value || '') !== String(values.regionId)) {
                            regionEl.value = String(values.regionId);
                            regionEl.dispatchEvent(new Event('change', { bubbles: true }));
                            if (window.jQuery) {
                                try {
                                    window.jQuery(regionEl).val(String(values.regionId)).trigger('change');
                                } catch (e2) {
                                    // ignore
                                }
                            }
                        }
                    }
                } finally {
                    restoreWriteInProgress = false;
                }

                return countryOk;
            }

            // Prefer Magento async registration so we run when country field exists.
            if (typeof registry.async === 'function') {
                registry.async(shippingCountryName)(function () {
                    apply();
                    [200, 600, 1200, 2500].forEach(function (delay) {
                        window.setTimeout(apply, delay);
                    });
                });
            }

            apply();
            [400, 1000, 2000, 4000].forEach(function (delay) {
                window.setTimeout(apply, delay);
            });
        }, function () {
            // uiRegistry not available yet
        });
    }

    function fillEmptyDomFields(values) {
        var root = document.querySelector(
                '.fastcheckout-native-shipping-address, #shipping, form#co-shipping-form'
            ) || document,
            map = {
                firstname: 'input[name="firstname"]',
                lastname: 'input[name="lastname"]',
                company: 'input[name="company"]',
                city: 'input[name="city"]',
                postcode: 'input[name="postcode"]',
                telephone: 'input[name="telephone"]',
                region: 'input[name="region"]'
            },
            key,
            el,
            emailEl;

        function setIfEmpty(selector, value) {
            var node = root.querySelector(selector) || document.querySelector(selector);
            if (node && value && !String(node.value || '').trim()) {
                node.value = value;
                node.dispatchEvent(new Event('input', { bubbles: true }));
                node.dispatchEvent(new Event('change', { bubbles: true }));
                // Magento UI components often listen via jQuery.
                if (window.jQuery) {
                    try {
                        window.jQuery(node).val(value).trigger('change').trigger('input');
                    } catch (jqErr) {
                        // ignore
                    }
                }
            }
        }

        for (key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key) && values[key]) {
                setIfEmpty(map[key], values[key]);
            }
        }
        if (values.street1) {
            setIfEmpty('input[name="street[0]"]', values.street1);
            setIfEmpty('input[name="street.0"]', values.street1);
            setIfEmpty('input[name*="street"][name$="[0]"]', values.street1);
        }
        if (values.street2) {
            setIfEmpty('input[name="street[1]"]', values.street2);
            setIfEmpty('input[name="street.1"]', values.street2);
        }
        function selectHasOption(selectEl, value) {
            var found = false;
            if (!selectEl || value === '' || value === null || typeof value === 'undefined') {
                return false;
            }
            Array.prototype.slice.call(selectEl.options || []).forEach(function (opt) {
                if (String(opt.value) === String(value)) {
                    found = true;
                }
            });
            return found;
        }

        function setSelectValue(selectEl, value) {
            if (!selectEl || value === '' || value === null || typeof value === 'undefined') {
                return false;
            }
            if (!selectHasOption(selectEl, value)) {
                return false;
            }
            if (String(selectEl.value || '') === String(value)) {
                return true;
            }
            selectEl.value = String(value);
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) {
                try {
                    window.jQuery(selectEl).val(String(value)).trigger('change').trigger('input');
                } catch (e) {
                    // ignore
                }
            }
            return String(selectEl.value || '') === String(value);
        }

        function applyCountryId() {
            var countryEl = root.querySelector('select[name="country_id"]') ||
                document.querySelector(
                    '.fastcheckout-native-shipping-address select[name="country_id"], ' +
                    '#shipping select[name="country_id"], ' +
                    'select[name="country_id"]'
                );
            if (!countryEl || !values.countryId) {
                return false;
            }
            return setSelectValue(countryEl, values.countryId);
        }

        function applyRegionId() {
            var regionEl = root.querySelector('select[name="region_id"]') ||
                document.querySelector(
                    '.fastcheckout-native-shipping-address select[name="region_id"], ' +
                    '#shipping select[name="region_id"], ' +
                    'select[name="region_id"]'
                );
            if (!regionEl || !values.regionId) {
                return false;
            }
            return setSelectValue(regionEl, values.regionId);
        }

        // Only touch country/region <select> once Magento has populated options.
        // Writing early (0 options) leaves a permanently empty visible field.
        function applyCountryWhenReady() {
            var countryEl = document.querySelector(
                '.fastcheckout-native-shipping-address select[name="country_id"], select[name="country_id"]'
            );
            if (countryEl && countryEl.options && countryEl.options.length > 10) {
                applyCountryId();
                applyRegionId();
                return true;
            }
            return false;
        }

        if (!applyCountryWhenReady()) {
            [500, 1200, 2500, 4500, 7000].forEach(function (delay) {
                window.setTimeout(applyCountryWhenReady, delay);
            });
        }

        emailEl = document.getElementById('customer-email') || document.querySelector('input[type="email"]');
        if (emailEl && values.email && !String(emailEl.value || '').trim()) {
            emailEl.value = values.email;
            emailEl.dispatchEvent(new Event('input', { bubbles: true }));
            emailEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * Clear only cart-related browser cache. Keep guest address snapshot + email.
     */
    function clearCartBrowserCache(customerData) {
        try {
            if (customerData && typeof customerData.set === 'function') {
                customerData.set('cart', {
                    summary_count: 0,
                    summary_qty: 0,
                    items: [],
                    itemsCount: 0,
                    itemsQty: 0,
                    subtotalAmount: 0,
                    subtotal: ''
                });
            }
        } catch (e) {
            // non-fatal
        }

        // Surgical mage-cache-storage edit: zero cart, keep other sections.
        try {
            var raw = window.localStorage.getItem('mage-cache-storage');
            if (raw) {
                var cache = JSON.parse(raw);
                if (cache && typeof cache === 'object') {
                    cache.cart = {
                        summary_count: 0,
                        summary_qty: 0,
                        items: [],
                        itemsCount: 0,
                        itemsQty: 0
                    };
                    // Magento clears checkout-data after place-order; keep email in session only.
                    window.localStorage.setItem('mage-cache-storage', JSON.stringify(cache));
                }
            }
        } catch (e2) {
            // ignore
        }
    }

    return {
        snapshot: snapshot,
        snapshotCurrentForm: snapshotCurrentForm,
        bindAutoSnapshot: bindAutoSnapshot,
        load: load,
        restore: restore,
        toFormAddressData: toFormAddressData,
        clearCartBrowserCache: clearCartBrowserCache,
        hasUserTouchedDestination: hasUserTouchedDestination,
        markUserTouchedDestination: markUserTouchedDestination,
        bindDestinationTouchGuard: bindDestinationTouchGuard,
        STORAGE_KEY: STORAGE_KEY
    };
});
