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

    public function testCheckoutKeepsCustomRouteWithoutSwitchingTheRenderedPageTheme(): void
    {
        $observer = (string)file_get_contents(
            $this->moduleRoot() . '/Observer/AddCheckoutLayoutHandle.php'
        );
        $events = (string)file_get_contents($this->moduleRoot() . '/etc/frontend/events.xml');
        $di = (string)file_get_contents($this->moduleRoot() . '/etc/frontend/di.xml');

        $this->assertStringContainsString("addHandle('fastcheckout_index_index')", $observer);
        $this->assertStringContainsString("'checkout_index_index'", $observer);
        $this->assertStringContainsString('layout_load_before', $events);
        $this->assertStringNotContainsString('fastcheckout_checkout_controller', $di);
        $this->assertFileDoesNotExist(
            $this->moduleRoot() . '/Plugin/Checkout/Controller/Index/Index.php'
        );
        $this->assertStringNotContainsString('fastcheckout_use_native_fallback_theme', $di);
        $this->assertFileDoesNotExist(
            $this->moduleRoot() . '/Plugin/Checkout/Controller/Index/UseFallbackThemePlugin.php'
        );
    }

    public function testOnlyAnIsolatedLayoutBuildUsesFallbackAndRestoresTheHyvaTheme(): void
    {
        $source = (string)file_get_contents(
            $this->moduleRoot() . '/Model/CheckoutLayoutCollector.php'
        );

        $this->assertStringContainsString("\$update->addHandle('checkout_index_index')", $source);
        $this->assertStringNotContainsString("\$update->addHandle('default')", $source);
        $this->assertStringContainsString('<container name="content"/>', $source);
        $this->assertStringContainsString("\$checkoutRoot->getData('jsLayout')", $source);
        $this->assertStringContainsString('switchToFallback()', $source);
        $this->assertStringContainsString('setDesignTheme($originalTheme)', $source);
        $this->assertStringNotContainsString('DOMXPath', $source);
        $this->assertStringNotContainsString('parseJsLayoutItem', $source);
        $this->assertStringNotContainsString('mergeJsLayoutArrays', $source);
    }

    public function testProcessedThirdPartyLayoutIsNotNormalizedRecursively(): void
    {
        $source = (string)file_get_contents(
            $this->moduleRoot() . '/Block/Hyva/Checkout.php'
        );

        $this->assertStringNotContainsString('normalizeStandardStreetLineDefaults', $source);
    }

    public function testNativeMagentoStateAndTransportAreNotReimplemented(): void
    {
        foreach ([
            '/view/frontend/web/js/hyva/checkout-bridge.js',
            '/view/frontend/web/js/hyva/checkout-compatibility.js',
            '/view/frontend/web/js/hyva/payment-host-bridge.js',
            '/view/frontend/web/js/mixin/storage-mixin.js',
            '/view/frontend/web/js/mixin/shipping-service-mixin.js',
            '/view/frontend/web/js/mixin/set-payment-information-extended-mixin.js',
        ] as $removedFile) {
            $this->assertFileDoesNotExist($this->moduleRoot() . $removedFile);
        }

        $bootstrap = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-renderers.js'
        );
        $this->assertSame(1, substr_count($bootstrap, 'app(jsLayout)'));
        $this->assertStringContainsString(
            "'Magento_Checkout/js/model/quote'",
            $bootstrap
        );
        $this->assertStringContainsString(
            "'Magento_Checkout/js/action/set-shipping-information'",
            $bootstrap
        );
        $this->assertStringContainsString(
            "'Magento_Customer/js/customer-data'",
            $bootstrap
        );
        $this->assertStringContainsString(
            'customerData.getInitCustomerData().done(',
            $bootstrap
        );
    }

    public function testDiDoesNotReplaceOrGloballyPatchCheckoutServices(): void
    {
        $source = (string)file_get_contents($this->moduleRoot() . '/etc/di.xml')
            . (string)file_get_contents($this->moduleRoot() . '/etc/frontend/di.xml');

        foreach ([
            'ShippingInformationManagementInterface',
            'PaymentInformationManagementInterface',
            'Magento\Framework\View\Model\Layout\Merge',
            'Magento\Quote\Api\CartRepositoryInterface',
            'Tpay\Magento2',
            'PreserveShippingExtensionAttributes',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $source);
        }
    }

    public function testOrderExtrasStayInTheExistingSummaryMarkup(): void
    {
        $source = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/summary.phtml'
        );

        $this->assertStringContainsString('id="fastcheckout-comment"', $source);
        $this->assertStringContainsString('id="fastcheckout-subscribe"', $source);
    }

    public function testModuleHasNoHyvaCheckoutOrMagewireRequirement(): void
    {
        $composer = (string)file_get_contents($this->moduleRoot() . '/composer.json');
        $module = (string)file_get_contents($this->moduleRoot() . '/etc/module.xml');

        $this->assertStringNotContainsString('magento2-hyva-checkout', $composer);
        $this->assertStringNotContainsString('magewire', strtolower($composer . $module));
    }
}
