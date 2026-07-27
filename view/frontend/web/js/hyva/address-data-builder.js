define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            getProperty = typeof deps.getProperty === 'function' ? deps.getProperty : function () { return ''; },
            normalizeCustomAttributes = typeof deps.normalizeCustomAttributes === 'function'
                ? deps.normalizeCustomAttributes
                : function (attributes) { return attributes || []; };

        function getEmailForQuote() {
            var selectors = [
                    '#customer-email',
                    '#co-shipping-email',
                    '[data-role="email-with-possible-login"] input[type="email"]',
                    '[data-role="email-with-possible-login"] input[name="username"]',
                    '[data-role="email-with-possible-login"] input[name="email"]',
                    'input[name="username"]',
                    'input[name="email"]',
                    'input[type="email"]',
                    '[data-wire-field="email"]'
                ],
                emailEl,
                i,
                value = '';

            for (i = 0; i < selectors.length; i++) {
                emailEl = document.querySelector(selectors[i]);
                if (emailEl && emailEl.value && String(emailEl.value).indexOf('@') !== -1) {
                    return String(emailEl.value).trim();
                }
            }

            if (quote && quote.guestEmail) {
                value = typeof quote.guestEmail === 'function' ? quote.guestEmail() : quote.guestEmail;
                if (value && String(value).indexOf('@') !== -1) {
                    return String(value).trim();
                }
            }

            try {
                value = window.sessionStorage.getItem('fastcheckout_email') || '';
                if (value && value.indexOf('@') !== -1) {
                    return String(value).trim();
                }
            } catch (e) {
                // ignore
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
            var street,
                isBilling = prefix === 'billing',
                line1 = getProperty(magewire, isBilling ? 'billingStreet1' : 'street1'),
                line2 = getProperty(magewire, isBilling ? 'billingStreet2' : 'street2'),
                line3 = getProperty(magewire, isBilling ? 'billingStreet3' : 'street3'),
                line4 = getProperty(magewire, isBilling ? 'billingStreet4' : 'street4');

            // Preserve line indexes and initialize the two standard Magento
            // street controls with form values instead of `undefined`.
            street = [line1 || '', line2 || ''];
            if (line3 || line4) {
                street.push(line3 || '', line4 || '');
            }

            return street;
        }

        function buildAddressData(magewire, prefix) {
            var isBilling = prefix === 'billing',
                countryId = getProperty(magewire, isBilling ? 'billingCountryId' : 'countryId'),
                regionId = getProperty(magewire, isBilling ? 'billingRegionId' : 'regionId'),
                region = getProperty(magewire, isBilling ? 'billingRegion' : 'region'),
                customAttributes = getProperty(magewire, isBilling ? 'billingCustomAttributes' : 'shippingCustomAttributes') || {},
                extensionAttributes = getProperty(magewire, isBilling ? 'billingExtensionAttributes' : 'shippingExtensionAttributes') || {};

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
                custom_attributes: customAttributes,
                customAttributes: normalizeCustomAttributes(customAttributes),
                extension_attributes: extensionAttributes,
                extensionAttributes: extensionAttributes,
                save_in_address_book: 0
            };
        }

        return {
            getEmailForQuote: getEmailForQuote,
            buildAddressData: buildAddressData
        };
    };
});
