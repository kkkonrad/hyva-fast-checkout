/**
 * Pure checks for shipping-country readiness used before set-payment-information.
 * The shipped mixin must not POST set-payment until the *server* quote has a
 * shipping country (set-shipping-information success), otherwise Magento shows
 * "Brak adresu wysyłki".
 *
 * Run: node Test/Unit/Js/set-payment-shipping-guard.test.js
 */
'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mixinSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/mixin/set-payment-information-extended-mixin.js'),
    'utf8'
);
const shippingSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../view/frontend/web/js/hyva/shipping-method-sync.js'),
    'utf8'
);

assert.match(
    mixinSrc,
    /waitForShippingInformation/,
    'mixin must wait for in-flight set-shipping-information'
);
assert.match(
    mixinSrc,
    /ensureServerShippingAddress/,
    'mixin must ensure server-side shipping address before payment-information POST'
);
assert.doesNotMatch(
    mixinSrc,
    /['"]Magento_Checkout\/js\/action\/set-shipping-information['"]/,
    'mixin must not hard-require set-shipping-information (RequireJS load-order risk)'
);
assert.match(
    mixinSrc,
    /seedClientShippingCountry|ensureShippingCountryOnQuote/,
    'mixin must seed client shipping country'
);
assert.match(
    mixinSrc,
    /shipping address is missing|Brak adresu wysyłki/,
    'mixin must detect Magento missing-shipping-address error for retry/skip'
);
assert.match(
    mixinSrc,
    /getShippingCountryId/,
    'mixin must read countryId from quote shipping address'
);
assert.match(
    mixinSrc,
    /fastcheckoutServerShippingCountryReady/,
    'mixin must gate on server-ready flag'
);
assert.match(
    mixinSrc,
    /fastcheckoutFlushPendingPaymentInformation/,
    'mixin must expose flush for deferred set-payment after shipping lands'
);
assert.match(
    mixinSrc,
    /rememberPendingPayment/,
    'mixin must remember skipped set-payment for later flush'
);

assert.match(
    shippingSrc,
    /deferPaymentActivation/,
    'shipping sync must defer sole-payment activate until shipping-information settles'
);
assert.match(
    shippingSrc,
    /fastcheckoutShippingInformationPromise/,
    'shipping sync must publish the set-shipping-information promise'
);
assert.match(
    shippingSrc,
    /fastcheckoutServerShippingCountryReady\s*=\s*true/,
    'shipping sync must mark server shipping country ready only on success'
);
assert.match(
    shippingSrc,
    /deferPaymentActivation:\s*true/,
    'failed/incomplete set-shipping must keep payment activation deferred'
);
assert.match(
    shippingSrc,
    /fastcheckoutFlushPendingPaymentInformation/,
    'shipping success must flush deferred set-payment-information'
);

console.log('set-payment shipping guard: OK');
