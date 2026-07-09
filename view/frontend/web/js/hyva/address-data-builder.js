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
            var emailEl = document.getElementById('co-shipping-email') ||
                document.querySelector('input[name="email"]') ||
                document.querySelector('input[type="email"]') ||
                document.querySelector('[data-wire-field="email"]');

            if (emailEl && emailEl.value) {
                return emailEl.value;
            }

            if (quote && quote.guestEmail) {
                return typeof quote.guestEmail === 'function' ? quote.guestEmail() : quote.guestEmail;
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
