# Kkkonrad Fastcheckout

Fastcheckout is a Magento 2 checkout customization module designed to improve the one-page checkout experience, especially for Hyva/Magewire-based storefronts.

## What it does

- Provides a more flexible checkout flow with custom shipping and payment handling.
- Supports configurable shipping/payment method visibility and mapping.
- Adds safeguards around address validation and payment additional information.
- Improves resilience during order placement with idempotency and better error handling.

## Main features

- Configurable checkout title and visibility options.
- Optional restriction of payment methods by configuration.
- Shipping/payment method mapping rules.
- Support for gift messages and newsletter subscription toggles.
- Defensive plugins for address validation and payment info storage.

## Installation

1. Copy the module into your Magento installation under app/code/Kkkonrad/Fastcheckout.
2. Enable the module:
   - `php bin/magento module:enable Kkkonrad_Fastcheckout`
3. Run setup upgrades:
   - `php bin/magento setup:upgrade`
4. Clear caches:
   - `php bin/magento cache:flush`

## Configuration

The module exposes its settings in Stores > Configuration > Sales > Checkout > Fastcheckout.

Useful settings include:

- General enable/disable switch.
- Title and checkout visibility options.
- Default shipping and payment methods.
- Shipping/payment method mapping.
- Payment restrictions.

## Logging

The module logs important checkout events through Magento's PSR-3 logger. Typical events include:

- Order placement start and success/failure.
- Address validation edge cases.
- Payment method selection and validation issues.
- Session/idempotency handling failures.

## Testing

Unit tests for the helper and Magewire checkout logic are available under the module's Test/Unit folder.

Run:

- `vendor/bin/phpunit app/code/Kkkonrad/Fastcheckout/Test/Unit/Helper/DataTest.php`
- `vendor/bin/phpunit app/code/Kkkonrad/Fastcheckout/Test/Unit/Magewire/CheckoutTest.php`

## Notes

The module is intentionally defensive and should be safe to use even when some payment or address data are incomplete or malformed.
