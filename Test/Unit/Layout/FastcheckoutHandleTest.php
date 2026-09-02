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

    public function testMagentoKeepsCheckoutOwnership(): void
    {
        $root = $this->moduleRoot();
        $layout = (string)file_get_contents($root . '/view/frontend/layout/fastcheckout_index_index.xml');
        $requireJs = (string)file_get_contents($root . '/view/frontend/requirejs-config.js');
        $di = (string)file_get_contents($root . '/etc/di.xml')
            . (string)file_get_contents($root . '/etc/frontend/di.xml');
        $composer = (string)file_get_contents($root . '/composer.json');
        $bootstrap = (string)file_get_contents(
            $root . '/view/frontend/web/js/hyva/checkout-renderers.js'
        );

        self::assertStringContainsString('<update handle="checkout_index_index"/>', $layout);
        self::assertStringContainsString('getChildHtml()', (string)file_get_contents(
            $root . '/view/frontend/templates/hyva/checkout-root-children.phtml'
        ));
        self::assertStringNotContainsString('map:', $requireJs);
        self::assertStringNotContainsString('ShippingInformationManagementInterface', $di);
        self::assertStringNotContainsString('PaymentInformationManagementInterface', $di);
        self::assertStringContainsString('magento/theme-frontend-blank', $composer);
        self::assertStringNotContainsString('magento2-theme-fallback', $composer);
        self::assertSame(1, substr_count($bootstrap, 'app(jsLayout)'));
    }

    public function testVisualShellRetainsNativeExtensionPoints(): void
    {
        $root = $this->moduleRoot();
        $templates = '';

        foreach ([
            'view/frontend/templates/hyva/checkout.phtml',
            'view/frontend/templates/hyva/checkout/shipping-address.phtml',
            'view/frontend/templates/hyva/checkout/shipping-methods.phtml',
            'view/frontend/templates/hyva/checkout/payment-methods.phtml',
            'view/frontend/templates/hyva/checkout/summary.phtml',
            'view/frontend/templates/hyva/checkout/order-actions.phtml',
            'view/frontend/web/template/hyva/shipping-list.html',
            'view/frontend/web/template/hyva/shipping-method-item.html',
        ] as $file) {
            $templates .= (string)file_get_contents($root . '/' . $file);
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
            "getRegion('shipping-information')",
            'id="checkout"',
            'id="co-shipping-method-form"',
            'id="checkout-step-payment"',
            'element.shippingMethodItemTemplate',
        ] as $extensionPoint) {
            self::assertStringContainsString($extensionPoint, $templates);
        }

        self::assertStringNotContainsString('data-fastcheckout-startup-loader', $templates);
        self::assertSame(4, substr_count($templates, 'data-fastcheckout-section-loader='));
        self::assertSame(4, substr_count($templates, 'class="fastcheckout-section-loader"'));
        foreach ([
            'hidden' . PHP_EOL . '                             data-bind="attr: {hidden: '
                . '!errorValidationMessage().length}"',
            'hidden' . PHP_EOL . '                                 '
                . 'data-bind="attr: {hidden: !rates().length}"',
            '<span><?= $escaper->escapeHtml(__(\'Next\')) ?></span>',
            'data-fastcheckout-place-order-ssr' . PHP_EOL . '                hidden>',
        ] as $renderGuard) {
            self::assertStringContainsString($renderGuard, $templates);
        }
    }
}
