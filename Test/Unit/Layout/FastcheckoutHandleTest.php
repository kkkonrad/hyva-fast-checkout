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
        $checkout = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/layout/checkout_index_index.xml'
        );

        $this->assertStringContainsString('<update handle="checkout_index_index"/>', $source);
        $this->assertStringContainsString('Kkkonrad_Fastcheckout::js/requirejs-base.js', $checkout);
        $this->assertStringContainsString('requirejs/require.js', $checkout);
        $this->assertStringContainsString('mage/requirejs/mixins.js', $checkout);
        $this->assertStringContainsString('requirejs-config.js', $checkout);
        $this->assertStringContainsString('hyva-default-checkout.css', $source);
        $this->assertStringContainsString('Kkkonrad_Fastcheckout::hyva/checkout.phtml', $source);
        $this->assertStringContainsString('name="fastcheckout-newsletter"', $checkout);
        $this->assertStringContainsString(
            'Kkkonrad_Fastcheckout/js/view/newsletter',
            $checkout
        );
        $this->assertStringContainsString('Magento_Ui/js/form/element/textarea', $checkout);
        $this->assertStringContainsString('fastcheckout.comment', $checkout);
        $this->assertStringContainsString('fastcheckout.subscribe', $checkout);
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
            '/view/frontend/web/template/hyva/shipping-method-item.html',
        ] as $file) {
            $templates .= (string)file_get_contents($this->moduleRoot() . $file);
        }

        foreach ([
            'checkout.steps.shipping-step.shippingAddress',
            'checkout.steps.billing-step.payment',
            'checkout.sidebar.summary',
            'checkout.sidebar',
            "getRegion('shippingAdditional')",
            "getRegion('before-shipping-method-form')",
            "getRegion('beforeMethods')",
            "getRegion('afterMethods')",
            "getRegion('payment-methods-list')",
            "getRegion('shipping-information')",
        ] as $extensionPoint) {
            $this->assertStringContainsString($extensionPoint, $templates);
        }

        $this->assertStringNotContainsString('data-fastcheckout-payment-option=', $templates);
        $this->assertStringNotContainsString('fastcheckoutHyvaPaymentRenderers', $templates);

        foreach ([
            'id="checkout-step-shipping"',
            'id="opc-shipping_method"',
            'id="checkout-step-shipping_method"',
            'id="co-shipping-method-form"',
            'id="payment"',
            'id="checkout-step-payment"',
        ] as $nativeSelector) {
            $this->assertStringContainsString($nativeSelector, $templates);
        }

        $this->assertStringContainsString('element.shippingMethodItemTemplate', $templates);
        $this->assertStringContainsString('let: { element: $data }', $templates);
    }
}
