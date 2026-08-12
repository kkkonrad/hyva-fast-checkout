English | [Polski](README.pl.md)

# Kkkonrad Fastcheckout

Fastcheckout is a Magento 2 checkout module for Hyvä themes. It runs Magento's
standard Knockout checkout through the official Hyvä Theme Fallback mechanism
and applies its own presentation layer. Magento's native quote and REST
operations remain the sole source of data.

The module does not require Magewire and does not maintain a separate checkout
state.

## Preview

![Kkkonrad Fastcheckout checkout view](docs/images/checkout.png)

## Features

- responsive checkout layout compatible with Hyvä;
- standard Magento shipping and billing address forms with native validation;
- an always available “Place Order” button on desktop and mobile that delegates
  execution to the active payment renderer's button;
- validation in address → shipping → payment → active renderer validator order,
  with smooth scrolling to the first visible error;
- native RequireJS bootstrap and exactly one complete `Magento_Ui/js/core/app`;
- unchanged `checkout.*` component paths and `checkoutProvider`, allowing payment
  renderers and shipping extensions to behave as they do in core;
- Magento's dynamic payment method list; the whole collapsed payment card is
  clickable, and the hidden radio of a single method receives a visual selected
  state;
- payment-to-shipping method mapping performed server-side by the standard
  `Magento\Payment\Model\MethodList`;
- native Magento summary and totals, including Tax;
- order comments, newsletter subscription and `Magento_CheckoutAgreements`
  displayed before the place-order button without detaching them from native
  payment validation;
- optional assignment of a guest order to an existing customer with the same
  email address.

## Requirements

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 or newer;
- Hyvä Theme Fallback 1.x (installed as a Composer dependency of the module).

## Installation

The package is **not available on Packagist**. Install it with Composer directly
from GitHub as a VCS repository.

### Composer + GitHub

From the Magento root directory, add the repository and require the package:

```bash
composer config repositories.kkkonrad-fastcheckout vcs https://github.com/kkkonrad/hyva-fast-checkout.git
composer require kkkonrad/fastcheckout:dev-master
```

Alternatively, add it manually to the project's `composer.json`:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/kkkonrad/hyva-fast-checkout.git"
    }
  ],
  "require": {
    "kkkonrad/fastcheckout": "dev-master"
  }
}
```

Then run:

```bash
composer update kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

**Notes:**

- for a private repository, use SSH
  (`git@github.com:kkkonrad/hyva-fast-checkout.git`) or a GitHub HTTPS token and
  grant Composer access to `github.com`;
- instead of `dev-master`, you can specify a branch (`dev-branch-name`) or a tag
  (`"kkkonrad/fastcheckout": "8.0.0"`) if one is published in the repository;
- when installing from a branch, Composer often requires
  `minimum-stability: dev` and `prefer-stable: true` in the project's
  `composer.json`.

### Manual installation (app/code)

Alternatively, clone the module into `app/code`:

```bash
git clone https://github.com/kkkonrad/hyva-fast-checkout.git app/code/Kkkonrad/Fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

### Production environment

In production, also compile dependency injection and deploy static assets:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

Checkout styles are delivered as a regular module CSS asset and do not require
rebuilding the active theme's Tailwind configuration.

## Configuration

Configuration is available in the Magento Admin:

`Stores > Configuration > Kkkonrad > Checkout`

The settings allow you to enable the module, control the visibility of the order
comment, discount and newsletter, optionally assign guest orders, and define
payment-to-shipping method mappings.

Assigning a guest order to an existing account is disabled by default. Enable it
only when the store independently verifies ownership of the email address.

Checkout is available at the standard `/checkout/` path. When the module and a
compatible Hyvä theme are active, Fastcheckout adds its presentation handle to
Magento's native checkout controller layout. The legacy `/fast-checkout/` path
remains available as a redirect to `/checkout/` for backward compatibility.

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

The missing-payment message is displayed before the dynamic payment method list,
scrolled into view and cleared when `quote.paymentMethod` changes. While the
request is running, the buttons are disabled and display “Please wait...”; after
an error, they return to their active state.

Manual agreements remain active checkboxes. Automatic agreements are visible,
checked and disabled, and their content opens in Magento's native modal.

## Architecture

- The `/checkout/` controller remains
  `Magento\Checkout\Controller\Index\Index`. The standard `layout_load_before`
  event adds the `fastcheckout_index_index` handle before layout merging; the
  module neither plugins nor bypasses the checkout controller.
- Fastcheckout builds an isolated fallback-theme layout for the
  `checkout_index_index` and private `fastcheckout_native_components` handles.
  Its validator, newsletter and comment are therefore not registered in the
  regular checkout, while all third-party layout processors and `jsLayout`
  entries are merged into the original `checkout.root`. The processed tree is
  obtained through `checkout.root::getJsLayout()` without creating a second
  `Onepage` block; a final Fastcheckout `LayoutProcessorInterface` performs three
  presentation changes. The isolated layout does not load the global `default`
  handle, so it does not regenerate active-theme RequireJS assets while rendering
  the page.
- The complete merged `jsLayout` is started exactly once by
  `Magento_Ui/js/core/app`. Fastcheckout changes only unmodified core templates
  responsible for its presentation and preserves templates set by third-party
  layout processors. Its shipping-list template still delegates each row to
  `shippingMethodItemTemplate`, just like core.
- One Fastcheckout block instance renders the page. Shipping rates and the order
  summary have no parallel PHP fallback: their only sources are the native
  `shipping-service`, `totals` and `checkout.sidebar.summary` components.
- Magento retains its own `shipping`, `payment`, `payments-list`, `renderer-list`,
  `shipping-service`, `checkout-data` and `quote` components without forks.
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
  moved nor cloned. Comment and newsletter state belongs to the standard
  `checkoutProvider` under `fastcheckout.comment` and `fastcheckout.subscribe`;
  it reaches payment exclusively through registered
  `PaymentInterface.extension_attributes` and is consumed only by the order with
  the corresponding `quote_id`.
- The success page retains the core `Magento\Checkout\Block\Onepage\Success`
  block, while comments and newsletter subscriptions are saved through
  `OrderStatusHistoryRepositoryInterface` and `SubscriptionManagerInterface`.

The module contains no Magewire component, Livewire DOM mutation mechanism or
Alpine-based state orchestrator.

## Third-party module compatibility (shipping / payment)

Fastcheckout acts as a host for Magento's native Knockout + REST checkout.
**Installing a standard shipping or payment module should not require patches or
Fastcheckout-specific DI entries.**

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
- A third-party `shippingMethodListTemplate` or
  `shippingMethodItemTemplate` configured by a layout processor takes precedence
  over the module's presentation template.
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
same renderer already loads in Magento's standard fallback-theme checkout.

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

## Refreshing static assets (developer / on-demand hosts)

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
`pub/static/frontend/sri-hashes.json` exists, the script intentionally stops.
In that environment, move or remove only the existing
`pub/static/frontend/<Vendor>/<theme>/<locale>/Kkkonrad_Fastcheckout`
directories and then run `setup:static-content:deploy`. Magento may not overwrite
an existing file, and only native deployment recreates it together with a valid
SRI hash.

Do not edit `pub/static/deployed_version.txt` manually; the script writes a valid
version without a trailing newline.
