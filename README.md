# Kkkonrad Fastcheckout

Fastcheckout is a Magento 2 checkout for Hyvä themes. It renders Magento's standard
Knockout address and payment components inside a Hyvä layout and keeps Magento's
native quote and REST actions as the single source of truth.

The module does not require Magewire and does not maintain a second checkout state.

## Features

- responsive Hyvä checkout layout;
- standard Magento shipping and billing address forms with native validation;
- compatibility bridge for RequireJS/Knockout payment renderers;
- shipping-to-payment method mapping;
- guest address persistence across reloads;
- support for order comments, newsletter choice and gift messages;
- InPost locker extension-attribute preservation;
- optional assignment of a guest order to an existing customer with the same email.

## Requirements

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 or newer.

## Installation

Install with Composer:

```bash
composer require kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

For a production deployment also compile DI and deploy static content:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

The module registers its templates with Hyvä's Tailwind configuration. Rebuild the
active theme's CSS after installation or after changing checkout templates.

## Configuration

Configuration is available under:

`Stores > Configuration > Kkkonrad > Checkout`

The main settings enable the checkout, select default shipping/payment methods,
control extended fields and define shipping-to-payment mappings.

The checkout route is `/fast-checkout/`. When the module and compatible Hyvä theme
are active, the standard checkout entry redirects to this route.

## Architecture

- `Block/Hyva/Checkout.php` prepares server-rendered checkout configuration.
- `view/frontend/templates/hyva/knockout/checkout-bridge.phtml` starts RequireJS/KO.
- `view/frontend/web/js/hyva/checkout-bridge.js` mounts Magento checkout components.
- Magento `quote`, `checkout-data` and REST actions own addresses, methods and totals.
- Small RequireJS mixins add persistence and third-party payment compatibility.

There is no Magewire component, Livewire DOM morphing or Alpine checkout state
orchestrator.

## Tests

Run PHP unit tests from the Magento root:

```bash
vendor/bin/phpunit -c app/code/Kkkonrad/Fastcheckout/phpunit.xml.dist
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
