English | [Polski](TECHNICAL.pl.md)

# Kkkonrad Fastcheckout technical documentation

[← Store-owner README](../README.md)

Fastcheckout hosts Magento's native KnockoutJS, RequireJS and REST checkout.
This document describes the technical contracts preserved by the module and how
to maintain and test them.

## Checkout modes

`fastcheckout/general/two_step` controls presentation only and defaults to
`0`. Both modes start the same merged `jsLayout`, quote, checkout provider,
shipping components and payment renderers.

- In one-step mode, Fastcheckout keeps both native steps visible and coordinates
  validation and the minimal required shipping save before delegating to the
  selected payment renderer.
- In two-step mode, Magento's original `step-navigator`, URL hashes and component
  visibility remain authoritative. The existing shipping form submits through
  `shipping.setShippingInformation()`, so the native action validates and saves
  Shipping once before `stepNavigator.next()` opens Review & Payments.
  Fastcheckout only reflects `shipping.visible` and `payment.isVisible` in its
  Tailwind containers; it does not maintain a parallel step state.

Changing the setting requires a configuration/full-page cache clean, not a
static-content deployment.

## Validation and placing an order

The visible desktop and mobile buttons are proxies. They do not implement
payments or call an endpoint directly. The proxy clicks the active renderer's
native checkout button, preserving vendor-specific handlers such as Braintree's
`placeOrderClick()`. It falls back to the component's public `placeOrder()` only
when no standard CTA exists. Wallet and drop-in methods keep their own checkout
CTA. This lets PayU, Przelewy24, Stripe and other modules retain their
tokenization, agreements and validators.

In one-step mode, when placing an order, Fastcheckout:

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

In two-step mode, Shipping validation belongs to the native “Next” action. On
Review & Payments the visible proxy clicks the selected renderer's native CTA;
the one-step validator becomes a no-op and the
`set-payment-information-extended` mixin delegates directly to Magento. This
avoids validating or resaving the completed Shipping step during payment.

## Architecture

- The `/checkout/` controller remains
  `Magento\Checkout\Controller\Index\Index`. The standard `layout_load_before`
  event adds the `fastcheckout_index_index` handle before layout merging; the
  module neither plugins nor bypasses the checkout controller.
- Fastcheckout first builds an isolated layout in the active design context for
  `checkout_index_index`, the private `fastcheckout_native_components` handle
  and applicable storefront page handles. If that produces no checkout tree,
  only the isolated build is temporarily switched to `Magento/blank` through
  `Magento\Framework\View\Design\Theme\ThemeProviderInterface`. The original
  Hyvä theme is always restored in `finally`; Blank neither renders the page nor
  publishes its assets to the customer, and the Hyvä Theme Fallback package is
  not required.
- The isolated layout keeps Fastcheckout's validator, newsletter and comment
  out of regular checkout while merging every third-party layout processor and
  `jsLayout` entry into the original `checkout.root`. The processed tree is
  obtained through `checkout.root::getJsLayout()` without a custom parser or
  recursive merge, and the Fastcheckout page block does not instantiate another
  `Onepage` block. A final Fastcheckout `LayoutProcessorInterface` applies the
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
- JavaScript integrations are registered exclusively as RequireJS mixins, with
  no `map` entries or core forks. They cover Magento's `place-order`,
  `error-processor`, `step-navigator`, `set-payment-information-extended`,
  summary totals/cart items, discount and checkout-agreements components. One
  narrowly scoped Braintree Hosted Fields mixin completes all native card-field
  validations after the renderer reports an invalid form; it does not replace
  the renderer.
- The Hyvä page starts Magento's native `section-config` and `customer-data`
  initializers before the checkout application. The early bootstrap only
  normalizes malformed `mage-cache-storage` containers; it does not replace
  Magento's storage. A missing or expired quote is handled through the native
  `error-processor`, which invalidates checkout sections and redirects to the
  cart.
- The newsletter remains a child of the `before-place-order` region with
  `sortOrder=90`. In one-step mode, its synchronized presentation proxy,
  standard agreement proxies, the comment and place-order proxy remain in the
  summary card. In two-step mode, that presentation-only action group is
  rendered after payment in the first column, leaving the second column with
  only the native order summary and shipping information. Original controls,
  field names, Knockout context and validators remain in the active payment
  renderer. Third-party renderer content is neither moved nor cloned.
- Comment and newsletter state belongs to the standard `checkoutProvider` under
  `fastcheckout.comment` and `fastcheckout.subscribe`; it reaches payment only
  through registered `PaymentInterface.extension_attributes` and is consumed
  only by the order with the corresponding `quote_id`.
- The success page retains the core `Magento\Checkout\Block\Onepage\Success`
  block, while comments and newsletter subscriptions are saved through
  `OrderStatusHistoryRepositoryInterface` and `SubscriptionManagerInterface`.
  Its success-page stylesheet also hides Tpay's legacy
  `#tpay_success_status` placeholder without changing Tpay's payment flow.

The module contains no Magewire component, Livewire DOM mutation mechanism or
Alpine-based state orchestrator.

## Third-party module compatibility

Fastcheckout acts as a host for Magento's native Knockout + REST checkout.
**Installing a standard shipping or payment module should not require patches
or Fastcheckout-specific DI entries.**

- Payment renderers and shipping UI components come from the standard,
  dynamically merged `checkout_index_index` handle. The rendered Hyvä page also
  merges that handle to retain third-party `<head>` assets and child PHTML
  blocks; `checkout.root` uses a children-only template so its core application
  bootstrap is not started a second time.
- The outer `#checkout` root and inner `#fastcheckout-checkout` root are both
  present, so module selectors scoped to `#checkout` continue to work.
- Standard IDs `#shipping`, `#checkout-step-shipping`, `#opc-shipping_method`,
  `#co-shipping-method-form`, `#payment`, `#checkout-step-payment` and
  `#co-payment-form` remain available without changing the visual layout.
- `shippingAdditional`, `before-shipping-method-form`, `beforeMethods`,
  `afterMethods`, `before-place-order`, `payments-list` and `renderer-list`
  remain in their original locations. `checkout.sidebar.shipping-information`
  is rendered through the canonical `checkout.sidebar` component region.
  Its DOM stays mounted but is visually hidden in one-step mode; in two-step it
  uses Magento's native visibility and navigation callbacks.
- Each shipping method keeps the standard label IDs and an empty
  `label_method_{method_code}_{carrier_code}` host for carrier widgets.
- A third-party `shippingMethodListTemplate` or `shippingMethodItemTemplate`
  configured by a layout processor takes precedence over the module's
  presentation template.
- Fastcheckout does not replace `window.checkoutConfig`, maintain a custom
  checkout store or reconstruct `extension_attributes` from the database. The
  native place-order button remains in its renderer with its handlers. The
  visible proxy clicks that button and uses the renderer's public `placeOrder()`
  only as a compatibility fallback; other toolbar actions are not
  hidden.
- `ExtendedCheckoutConfigProvider` is appended to
  `Magento\Checkout\Model\CompositeConfigProvider` with `sortOrder=1000`; the
  module does not replace shipping or payment information management interfaces.
- Shipping→payment mapping is an additional
  `Magento\Payment\Model\Checks\SpecificationInterface`, so the same method list
  reaches the initial `checkoutConfig` and REST responses without a mixin on
  `payment-service`. Only a payment code explicitly present in the mapping is
  restricted; unlisted payment methods remain available so newly installed
  providers are not hidden by an existing mapping.
- Mixins are not registered on address or method selection actions, REST
  transport, rate processors or `customer-data`, leaving other vendors' chains
  intact.
- The one-step validator is a regular child of the canonical
  `checkout.steps.billing-step.payment.additional-payment-validators` node; it
  neither replaces the list nor validators registered by other modules. It is a
  no-op in two-step mode without changing registration order.

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

To test the native two-step mode after enabling it in Magento configuration:

```bash
FC_EXPECT_TWO_STEP=1 npx playwright test NativeCheckoutCompatibility.spec.js
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

The helper is intended for developer environments when existing
`pub/static/frontend/*/Kkkonrad_Fastcheckout` directories are not refreshed
automatically. Production deployments should use Magento's
`setup:static-content:deploy`. `requirejs-config.js` lives outside `web/`; after
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
