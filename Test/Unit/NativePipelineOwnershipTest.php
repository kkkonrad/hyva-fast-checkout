<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit;

use PHPUnit\Framework\TestCase;

class NativePipelineOwnershipTest extends TestCase
{
    private function moduleRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    public function testMagentoOwnsLayoutCollectionAndUiBootstrap(): void
    {
        $root = $this->moduleRoot();
        $collector = (string)file_get_contents($root . '/Model/CheckoutLayoutCollector.php');
        $bootstrap = (string)file_get_contents(
            $root . '/view/frontend/web/js/hyva/checkout-renderers.js'
        );

        self::assertStringContainsString("\$update->addHandle('checkout_index_index')", $collector);
        self::assertStringContainsString("NATIVE_THEME_PATH = 'frontend/Magento/blank'", $collector);
        self::assertStringContainsString('setDesignTheme($originalTheme)', $collector);
        self::assertSame(1, substr_count($bootstrap, 'app(jsLayout)'));
        self::assertStringContainsString("'Magento_Checkout/js/model/quote'", $bootstrap);
        self::assertStringContainsString(
            "'Magento_Checkout/js/model/payment/additional-validators'",
            $bootstrap
        );
        self::assertStringContainsString(
            'additionalValidators.registerValidator(oneStepValidator)',
            $bootstrap
        );
    }

    public function testModuleDoesNotReplaceCheckoutServicesOrRequireFallbackCheckout(): void
    {
        $root = $this->moduleRoot();
        $di = (string)file_get_contents($root . '/etc/di.xml')
            . (string)file_get_contents($root . '/etc/frontend/di.xml');
        $composer = (string)file_get_contents($root . '/composer.json');
        $requireJs = (string)file_get_contents($root . '/view/frontend/requirejs-config.js');

        self::assertStringNotContainsString('ShippingInformationManagementInterface', $di);
        self::assertStringNotContainsString('PaymentInformationManagementInterface', $di);
        self::assertStringNotContainsString('map:', $requireJs);
        self::assertStringNotContainsString('magento2-hyva-checkout', $composer);
        self::assertStringNotContainsString('magento2-theme-fallback', $composer);
        self::assertStringContainsString('magento/theme-frontend-blank', $composer);
    }
}
