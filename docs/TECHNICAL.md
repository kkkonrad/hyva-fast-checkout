English | [Polski](TECHNICAL.pl.md)

# Kkkonrad Fastcheckout technical documentation

[← Store-owner README](../README.md)

Fastcheckout hosts Magento's native KnockoutJS, RequireJS and REST checkout.
This document describes the technical contracts preserved by the module and how
to maintain and test them.

## Validation and placing an order

The visible desktop and mobile buttons are proxies. They do not implement
payments or call an endpoint directly: they click the native `placeOrder` button
of the active renderer. This allows PayU, Przelewy24, Stripe and other modules to
retain their own tokenization, agreements and validators.

When placing an order, Fastcheckout:

1. calls `shipping.validateShippingInformation()` when no payment method is
   selected and displays the missing-payment message only after shipping is
   valid;
2. prepares the billing address through the native
   `Magento_Checkout/js/view/billing-address` component when a payment method is
   selected;
3. delegates control to the active renderer and its `validate()` method;
4. lets the renderer run the standard `additional-validators`, where
   Fastcheckout registers shipping and billing validation alongside validators
   for email, agreements and third-party modules;
5. uses a shared coordinator to call the native
   `Magento_Checkout/js/action/set-shipping-information` action only when the
   address or shipping method has changed since the last successful save, after
   which the renderer places the order through its own Magento action.

The missing-payment message is displayed before the dynamic payment method
list, scrolled into view and cleared when `quote.paymentMethod` changes. While
the request is running, the buttons are disabled and display “Please wait...”;
after an error, they return to their active state.

Manual agreements remain active checkboxes. Automatic agreements are visible,
checked and disabled, and their content opens in Magento's native modal.

## Architecture

- The `/checkout/` controller remains
  `Magento\Checkout\Controller\Index\Index`. The standard `layout_load_before`
  event adds the `fastcheckout_index_index` handle before layout merging; the
  module neither plugins nor bypasses the checkout controller.
- Fastcheckout switches theme context only while building an isolated
  `Magento/luma` layout for the `checkout_index_index` and private
  `fastcheckout_native_components` handles. It uses
  `Magento\Framework\View\Design\Theme\ThemeProviderInterface` directly and
  does not require the Hyvä Theme Fallback package. The original Hyvä theme is
  always restored in `finally`; Luma neither renders the page nor publishes its
  assets to the customer.
- The isolated layout keeps Fastcheckout's validator, newsletter and comment
  out of regular checkout while merging every third-party layout processor and
  `jsLayout` entry into the original `checkout.root`. The processed tree is
  obtained through `checkout.root::getJsLayout()` without creating a second
  `Onepage` block; a final Fastcheckout `LayoutProcessorInterface` applies the
  presentation changes.
- The isolated layout does not load the global `default` handle, so it does not
  prepare the active theme's global RequireJS blocks while rendering the page.
- The complete merged `jsLayout` is started exactly once by
  `Magento_Ui/js/core/app`. Fastcheckout changes only unmodified core templates
  responsible for presentation and preserves templates set by third-party
  layout processors. Its shipping-list template still delegates each row to
  `shippingMethodItemTemplate`, just like core.
- One Fastcheckout block instance renders the page. Shipping rates and the order
  summary have no parallel PHP fallback: their only sources are the native
  `shipping-service`, `totals` and `checkout.sidebar.summary` components.
- Magento retains its own `shipping`, `payment`, `payments-list`,
  `renderer-list`, `shipping-service`, `checkout-data` and `quote` components
  without forks.
- Core JavaScript integrations are registered exclusively as RequireJS mixins,
  with no `map` entries or forks. They cover
  `Magento_Checkout/js/action/place-order`, the native summary,
  `Magento_SalesRule/js/view/payment/discount` and
  `Magento_CheckoutAgreements/js/view/checkout-agreements`.
- The order comment remains in the summary panel, while the newsletter is a
  child of the `before-place-order` region with `sortOrder=90`. Standard
  agreements and the newsletter have synchronized presentation proxies in the
  summary; their original controls, field names, Knockout context and validators
  remain in the active payment renderer. Third-party renderer content is neither
  moved nor cloned.
- Comment and newsletter state belongs to the standard `checkoutProvider` under
  `fastcheckout.comment` and `fastcheckout.subscribe`; it reaches payment only
  through registered `PaymentInterface.extension_attributes` and is consumed
  only by the order with the corresponding `quote_id`.
- The success page retains the core `Magento\Checkout\Block\Onepage\Success`
  block, while comments and newsletter subscriptions are saved through
  `OrderStatusHistoryRepositoryInterface` and `SubscriptionManagerInterface`.

The module contains no Magewire component, Livewire DOM mutation mechanism or
Alpine-based state orchestrator.

## Third-party module compatibility

Fastcheckout acts as a host for Magento's native Knockout + REST checkout.
**Installing a standard shipping or payment module should not require patches
or Fastcheckout-specific DI entries.**

- Payment renderers and shipping UI components come from the standard,
  dynamically merged `checkout_index_index` handle.
- The outer `#checkout` root and inner `#fastcheckout-checkout` root are both
  present, so module selectors scoped to `#checkout` continue to work.
- Standard IDs `#shipping`, `#checkout-step-shipping`, `#opc-shipping_method`,
  `#co-shipping-method-form`, `#payment`, `#checkout-step-payment` and
  `#co-payment-form` remain available without changing the visual layout.
- `shippingAdditional`, `before-shipping-method-form`, `beforeMethods`,
  `afterMethods`, `before-place-order`, `payments-list` and `renderer-list`
  remain in their original locations. `checkout.sidebar.shipping-information`
  is rendered through the canonical `checkout.sidebar` component region.
- Each shipping method keeps the standard label IDs and an empty
  `label_method_{method_code}_{carrier_code}` host for carrier widgets.
- A third-party `shippingMethodListTemplate` or `shippingMethodItemTemplate`
  configured by a layout processor takes precedence over the module's
  presentation template.
- Fastcheckout does not replace `window.checkoutConfig`, maintain a custom
  checkout store or reconstruct `extension_attributes` from the database. The
  native place-order button remains in its renderer with its handlers and is
  invoked by the visible proxy; other toolbar actions are not hidden.
- `ExtendedCheckoutConfigProvider` is appended to
  `Magento\Checkout\Model\CompositeConfigProvider` with `sortOrder=1000`; the
  module does not replace shipping or payment information management interfaces.
- Shipping→payment mapping is an additional
  `Magento\Payment\Model\Checks\SpecificationInterface`, so the same method list
  reaches the initial `checkoutConfig` and REST responses without a mixin on
  `payment-service`.
- Mixins are not registered on address or method selection actions, REST
  transport, rate processors or `customer-data`, leaving other vendors' chains
  intact.
- The one-step validator is a regular child of the canonical
  `checkout.steps.billing-step.payment.additional-payment-validators` node; it
  neither replaces the list nor validators registered by other modules.

Do not add vendor-specific DI “for Fastcheckout” to a store project when the
same renderer already loads through Magento's standard `checkout_index_index`.

## Tests

Run PHP unit tests from the Magento root directory:

```bash
vendor/bin/phpunit --no-extensions -c dev/tests/unit/phpunit.xml.dist \
    app/code/Kkkonrad/Fastcheckout/Test/Unit
```

Run JavaScript unit tests:

```bash
node --test app/code/Kkkonrad/Fastcheckout/Test/Unit/Js/*.test.js
```

Run Playwright tests:

```bash
cd app/code/Kkkonrad/Fastcheckout/Test/E2e
npm ci
npx playwright test
```

By default, E2E tests do not place orders. They verify the native bootstrap,
canonical `uiRegistry` entries, extension regions, billing=shipping
synchronization, agreements/newsletter, dynamic payments, error scrolling,
loader and the complete validator chain.

To explicitly test a final Purchase Order on an isolated test store, run:

```bash
FC_ALLOW_PLACE_ORDER=1 npx playwright test \
    -g 'validates shipping and Purchase Order, optionally placing an order'
```

## Refreshing static assets

After changing files under `view/frontend/web`, refresh Magento's published
copies in `pub/static` so the storefront does not serve stale JavaScript or CSS:

```bash
app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
php bin/magento cache:flush
```

The script is required when
`pub/static/frontend/*/Kkkonrad_Fastcheckout` directories already exist,
including in developer mode. `requirejs-config.js` lives outside `web/`; after
changing it, copy it into the static trees or run static-content deployment
again. Reloading the page alone will not replace an existing copy.

If Magento uses Subresource Integrity and
`pub/static/frontend/sri-hashes.json` exists, the script intentionally stops. In
that environment, move or remove only the existing
`pub/static/frontend/<Vendor>/<theme>/<locale>/Kkkonrad_Fastcheckout`
directories and then run `setup:static-content:deploy`. Magento may not
overwrite an existing file, and only native deployment recreates it with a
valid SRI hash.

Do not edit `pub/static/deployed_version.txt` manually; the script writes a
valid asset version without a trailing newline.
