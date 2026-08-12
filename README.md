English | [Polski](README.pl.md)

# Kkkonrad Fastcheckout

## A simpler checkout for Magento 2 stores using Hyvä

Fastcheckout keeps the complete ordering process on one responsive page.
Customers can enter their address, select delivery and payment, review the
summary and place the order without moving through separate checkout steps.

The module changes how Magento's standard checkout is presented, but it does
not replace the checkout engine. The store continues to use its existing
shipping methods, payment providers, taxes, discounts and Magento integrations.

## Preview

![Kkkonrad Fastcheckout checkout view](docs/images/checkout.png)

## Benefits for your store

- the complete ordering process on one page, on desktop and mobile;
- fewer screens and interruptions while placing an order;
- a “Place Order” button available from the beginning of checkout;
- clear validation messages with smooth scrolling to the field that needs
  attention;
- billing address set to the shipping address by default, with an option to
  enter a different one;
- shipping and payment methods updated dynamically for the current cart and
  address;
- order summary, discount code, comment, newsletter and required agreements in
  one place;
- button and loader colors inherited from the active Hyvä theme;
- the payment provider's standard flow, including redirects, card payments and
  additional security checks, remains intact.

## Shipping and payment compatibility

Fastcheckout uses the same ordering mechanisms as Magento's standard checkout.
It does not create a separate cart or its own order data store. Installed
modules continue to receive the data they expect and can add their own fields,
buttons, pickup-point maps, agreements and messages.

The module is designed to work with integrations such as InPost, Furgonetka,
DPD, PayU, Przelewy24, Tpay, PayPal, Stripe and Braintree. This is not an
automatic certification of every extension version. Before going live, test
the exact modules, versions and configurations used by the store.

Fastcheckout does not configure shipping carriers or payment providers. Those
methods must first be installed, configured and enabled correctly in Magento.

## Requirements

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 or newer;
- Hyvä Theme Fallback 1.x, installed automatically as a Composer dependency.

The module does not require Hyvä Checkout or Magewire. It is intended for
Magento's standard checkout running in a Hyvä theme through Theme Fallback.

## Magento Admin configuration

Settings are available under:

`Stores > Configuration > Kkkonrad > Checkout`

The store administrator can:

- enable or disable Fastcheckout;
- show or hide the order comment, discount code and newsletter option;
- limit payment methods according to the selected shipping method;
- optionally assign guest orders to an existing customer account.

Guest-order assignment is disabled by default. Enable it only when the store
independently verifies that the shopper owns the supplied email address.

Checkout remains available at the standard `/checkout/` URL. The legacy
`/fast-checkout/` URL redirects there automatically.

## The customer journey

1. The customer enters an email address and shipping address.
2. Magento loads the shipping methods available for that address.
3. Selecting a shipping method displays the applicable payment methods.
4. The customer reviews the summary, optionally applies a discount, adds a
   comment or subscribes to the newsletter, and accepts required agreements.
5. “Place Order” starts the standard flow of the selected payment provider.
6. If information is missing, checkout scrolls to the first error and explains
   what needs to be corrected.

## Before going live

On a test copy of the store, verify:

- checkout as a guest and as a signed-in customer;
- billing address both matching and differing from the shipping address;
- every enabled shipping method, including parcel locker or pickup-point
  selection;
- every enabled payment method, especially cards and redirect payments;
- discount codes, taxes, shipping costs and the final order total;
- required and automatic checkout agreements;
- order comments and newsletter subscription;
- desktop and mobile layouts;
- returning from the payment provider and the resulting order in Magento Admin.

## Installation

Installation should be performed by the store's technical partner. The package
is not available on Packagist and is downloaded directly from its GitHub
repository.

From the Magento root directory:

```bash
composer config repositories.kkkonrad-fastcheckout vcs https://github.com/kkkonrad/hyva-fast-checkout.git
composer require kkkonrad/fastcheckout:dev-master
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

For a private repository, configure SSH access or a GitHub token. A published
version tag can be used instead of `dev-master`.

### Manual app/code installation

```bash
git clone https://github.com/kkkonrad/hyva-fast-checkout.git app/code/Kkkonrad/Fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

### Production deployment

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

Styles are delivered by the module and do not require adding its files to the
active theme's Tailwind configuration.

## Updating

```bash
composer update kkkonrad/fastcheckout
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
php bin/magento cache:flush
```

After an update, repeat the most important go-live checks, especially for any
shipping or payment modules that were updated at the same time.

<details>
<summary>Information for the technical partner</summary>

- The module uses Magento's native KnockoutJS, RequireJS and REST checkout,
  including `Magento_Checkout`, `checkoutProvider` and the `quote` model. It
  does not maintain parallel checkout state.
- The `checkout_index_index` layout is merged with third-party module
  configuration, keeping their payment renderers, shipping components and
  validators active.
- Core JavaScript integrations use RequireJS mixins and do not replace core
  modules through `map`.
- The visible order button delegates to the native button of the active payment
  renderer.
- To refresh published assets quickly in a development environment, run:

```bash
app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
php bin/magento cache:flush
```

In an environment using Subresource Integrity, use the standard
`setup:static-content:deploy` process so Magento also regenerates valid SRI
hashes. Do not edit `pub/static/deployed_version.txt` manually.

Unit and E2E tests are available under the module's `Test/` directory. E2E tests
do not place orders by default.

</details>
