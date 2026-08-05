<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Layout;

use PHPUnit\Framework\TestCase;

class FastcheckoutHandleTest extends TestCase
{
    private function moduleRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public function testHandleKeepsTheExistingHyvaPresentationAndLoadsCheckoutExtensions(): void
    {
        $source = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/layout/fastcheckout_index_index.xml'
        );

        $this->assertStringContainsString('<update handle="checkout_index_index"/>', $source);
        $this->assertStringContainsString('hyva-default-checkout.css', $source);
        $this->assertStringContainsString('Kkkonrad_Fastcheckout::hyva/checkout.phtml', $source);
        $this->assertStringContainsString('fastcheckout-checkout-page', $source);
        $this->assertStringContainsString('name="fallback.module.missing" remove="true"', $source);
        $this->assertStringContainsString('name="checkout.root" remove="true"', $source);
        $this->assertStringNotContainsString('fastcheckout_native_checkout', $source);
    }

    public function testVisualShellUsesCanonicalCheckoutScopesAndRegions(): void
    {
        $templates = '';
        foreach ([
            '/view/frontend/templates/hyva/checkout/shipping-address.phtml',
            '/view/frontend/templates/hyva/checkout/shipping-methods.phtml',
            '/view/frontend/templates/hyva/checkout/payment-methods.phtml',
            '/view/frontend/templates/hyva/checkout/summary.phtml',
            '/view/frontend/web/template/hyva/shipping-list.html',
        ] as $file) {
            $templates .= (string)file_get_contents($this->moduleRoot() . $file);
        }

        foreach ([
            'checkout.steps.shipping-step.shippingAddress',
            'checkout.steps.billing-step.payment',
            'checkout.sidebar.summary',
            "getRegion('shippingAdditional')",
            "getRegion('before-shipping-method-form')",
            "getRegion('beforeMethods')",
            "getRegion('afterMethods')",
            "getRegion('payment-methods-list')",
        ] as $extensionPoint) {
            $this->assertStringContainsString($extensionPoint, $templates);
        }

        $this->assertStringNotContainsString('data-fastcheckout-payment-option=', $templates);
        $this->assertStringNotContainsString('fastcheckoutHyvaPaymentRenderers', $templates);
    }
}
