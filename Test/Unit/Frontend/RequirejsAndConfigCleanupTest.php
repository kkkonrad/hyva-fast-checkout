<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Frontend;

use PHPUnit\Framework\TestCase;

class RequirejsAndConfigCleanupTest extends TestCase
{
    private function moduleRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public function testRequirejsUsesNoCoreMapOverrideAndOnlyDelegatingMixins(): void
    {
        $source = (string)file_get_contents($this->moduleRoot() . '/view/frontend/requirejs-config.js');

        $this->assertStringNotContainsString('map:', $source);
        $this->assertStringContainsString("'Magento_Checkout/js/action/place-order'", $source);
        $this->assertStringNotContainsString("'Magento_Checkout/js/model/payment-service'", $source);
        $this->assertStringContainsString("'Magento_Checkout/js/model/error-processor'", $source);
        $this->assertStringContainsString(
            "'Magento_Checkout/js/action/set-payment-information-extended'",
            $source
        );
        $this->assertStringContainsString("'Magento_Checkout/js/view/summary/abstract-total'", $source);
        $this->assertStringContainsString("'Magento_Checkout/js/view/summary/cart-items'", $source);
        $this->assertStringContainsString("'Magento_SalesRule/js/view/payment/discount'", $source);
        $this->assertStringContainsString(
            "'Magento_CheckoutAgreements/js/view/checkout-agreements'",
            $source
        );
        $this->assertSame(9, substr_count($source, ': true'));

        foreach ([
            'Magento_Checkout/js/checkout-data',
            'Magento_Customer/js/customer-data',
            'Magento_Checkout/js/action/select-shipping-method',
            'Magento_Checkout/js/action/select-payment-method',
            'Magento_Checkout/js/model/shipping-service',
            'Magento_Checkout/js/model/shipping-rate-service',
            'mage/storage',
        ] as $forbiddenTarget) {
            $this->assertStringNotContainsString($forbiddenTarget, $source);
        }
    }

    public function testConfigProviderKeepsAnExplicitUniqueSortOrder(): void
    {
        $source = (string)file_get_contents($this->moduleRoot() . '/etc/frontend/di.xml');

        $this->assertMatchesRegularExpression(
            '/fastcheckout_extended_checkout_config[^>]*sortOrder="1000"/',
            $source
        );
    }
}
