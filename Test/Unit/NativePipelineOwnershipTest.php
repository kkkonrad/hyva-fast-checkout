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

    public function testCheckoutKeepsLegacyRedirectWithoutSwitchingTheRenderedPageTheme(): void
    {
        $observer = (string)file_get_contents(
            $this->moduleRoot() . '/Observer/AddCheckoutLayoutHandle.php'
        );
        $events = (string)file_get_contents($this->moduleRoot() . '/etc/frontend/events.xml');
        $di = (string)file_get_contents($this->moduleRoot() . '/etc/frontend/di.xml');

        $this->assertStringContainsString("addHandle('fastcheckout_index_index')", $observer);
        $this->assertStringContainsString(
            "addHandle('fastcheckout_checkout_onepage_success')",
            $observer
        );
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
        $this->assertFileDoesNotExist($this->moduleRoot() . '/Controller/Action.php');
        $legacyController = (string)file_get_contents(
            $this->moduleRoot() . '/Controller/Index/Index.php'
        );
        $this->assertStringContainsString("setPath('checkout')", $legacyController);
    }

    public function testOnlyAnIsolatedLayoutBuildUsesFallbackAndRestoresTheHyvaTheme(): void
    {
        $source = (string)file_get_contents(
            $this->moduleRoot() . '/Model/CheckoutLayoutCollector.php'
        );

        $this->assertStringContainsString("\$update->addHandle('checkout_index_index')", $source);
        $this->assertStringContainsString(
            "\$update->addHandle('fastcheckout_native_components')",
            $source
        );
        $this->assertStringNotContainsString("\$update->addHandle('default')", $source);
        $this->assertStringContainsString('<container name="content"/>', $source);
        $this->assertStringContainsString('$checkoutRoot->getJsLayout()', $source);
        $this->assertStringContainsString('$this->serializer->unserialize', $source);
        $this->assertStringContainsString('switchToFallback()', $source);
        $this->assertStringContainsString('setDesignTheme($originalTheme)', $source);
        $this->assertStringNotContainsString('DOMXPath', $source);
        $this->assertStringNotContainsString('parseJsLayoutItem', $source);
        $this->assertStringNotContainsString('mergeJsLayoutArrays', $source);

        $checkout = (string)file_get_contents($this->moduleRoot() . '/Block/Hyva/Checkout.php');
        $this->assertStringNotContainsString('createBlock(Onepage::class', $checkout);
        $this->assertStringNotContainsString('getProcessedCheckoutLayout', $checkout);
        $this->assertStringNotContainsString('catch (\\Throwable', $checkout);
        $this->assertStringContainsString('return $this->configProvider->getConfig();', $checkout);

        $collector = (string)file_get_contents(
            $this->moduleRoot() . '/Model/CheckoutLayoutCollector.php'
        );
        $this->assertStringContainsString('throw $exception;', $collector);
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
        ] as $removedFile) {
            $this->assertFileDoesNotExist($this->moduleRoot() . $removedFile);
        }

        $paymentGuard = (string)file_get_contents(
            $this->moduleRoot()
            . '/view/frontend/web/js/mixin/set-payment-information-extended-mixin.js'
        );
        $this->assertStringContainsString('quote.guestEmail', $paymentGuard);
        $this->assertStringContainsString('shippingSaveCoordinator.ensureSaved()', $paymentGuard);
        $this->assertStringNotContainsString('var pending', $paymentGuard);
        $this->assertStringNotContainsString("document.addEventListener('input'", $paymentGuard);
        $this->assertStringNotContainsString('fastcheckout:shipping-information-saved', $paymentGuard);

        $bootstrap = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-renderers.js'
        );
        $this->assertSame(1, substr_count($bootstrap, 'app(jsLayout)'));
        $this->assertStringContainsString(
            "'Magento_Checkout/js/model/quote'",
            $bootstrap
        );
        $this->assertStringContainsString('shippingSaveCoordinator.ensureSaved()', $bootstrap);
        $this->assertStringContainsString(
            "'Magento_Customer/js/customer-data'",
            $bootstrap
        );
        $this->assertStringContainsString(
            'customerData.getInitCustomerData().done(',
            $bootstrap
        );
        $this->assertGreaterThan(
            strpos($bootstrap, 'customerData.getInitCustomerData().done('),
            strpos($bootstrap, 'app(jsLayout)')
        );
        $validator = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/model/one-step-validator.js'
        );
        $this->assertStringNotContainsString('shipping.validateShippingInformation()', $bootstrap);
        $this->assertSame(1, substr_count($validator, 'shipping.validateShippingInformation()'));
        $this->assertStringNotContainsString('fastcheckoutValidatedForPlaceOrder', $bootstrap);
        $this->assertStringNotContainsString('wireAgreements', $bootstrap);
        $this->assertStringNotContainsString('wireNewsletter', $bootstrap);
        $this->assertStringNotContainsString('quote.billingAddress(null)', $bootstrap);
        $this->assertStringNotContainsString('observer.observe(root', $bootstrap);
        $this->assertStringContainsString('paymentDomObserver.observe(paymentRoot', $bootstrap);
        $this->assertStringNotContainsString('paymentErrorTimer', $bootstrap);
        $this->assertStringContainsString('sourcePart.cloneNode(true)', $bootstrap);
        $this->assertStringNotContainsString('host.appendChild(source', $bootstrap);

        $earlyBootstrap = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/requirejs-base.js'
        );
        $this->assertStringContainsString(
            "'mage-cache-storage'",
            $earlyBootstrap
        );
        $this->assertStringContainsString(
            "'mage-cache-storage-section-invalidation'",
            $earlyBootstrap
        );
        $this->assertStringContainsString("setItem(storageKey, '{}')", $earlyBootstrap);
        $this->assertStringNotContainsString(
            'mage-cache-storage-section-invalidation',
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
            'preference for="Magento\Checkout\Block\Onepage\Success"',
            'Tpay\Magento2',
            'PreserveShippingExtensionAttributes',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $source);
        }

        $this->assertStringContainsString('fastcheckout_presentation', $source);
        $this->assertStringContainsString('sortOrder="1000"', $source);
    }

    public function testSuccessPageUsesTheNativeBlock(): void
    {
        $layout = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/layout/fastcheckout_checkout_onepage_success.xml'
        );

        $this->assertFileDoesNotExist($this->moduleRoot() . '/Block/Onepage/Success.php');
        $this->assertStringContainsString('name="checkout.success"', $layout);
        $this->assertStringContainsString('Kkkonrad_Fastcheckout::success/success.phtml', $layout);
        $this->assertStringContainsString('Magento\Customer\ViewModel\Customer\Auth', $layout);
    }

    public function testOrderExtrasUseTheSummaryAndNativePaymentRegion(): void
    {
        $summary = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/summary.phtml'
        );
        $payment = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/payment-methods.phtml'
        );
        $layout = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/layout/fastcheckout_native_components.xml'
        );
        $newsletter = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/newsletter.html'
        );
        $comment = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/order-comment.html'
        );
        $placeOrder = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/place-order-mixin.js'
        );
        $configProvider = (string)file_get_contents(
            $this->moduleRoot() . '/Model/ExtendedCheckoutConfigProvider.php'
        );

        $this->assertStringContainsString('checkout.sidebar.fastcheckout-order-comment', $summary);
        $this->assertStringContainsString('id="fastcheckout-comment"', $comment);
        $this->assertStringContainsString('name="fastcheckout-newsletter"', $layout);
        $this->assertStringContainsString('fastcheckout.comment', $layout);
        $this->assertStringContainsString('fastcheckout.subscribe', $layout);
        $this->assertStringContainsString('checkoutProvider', $layout);
        $this->assertStringContainsString('before-place-order', $layout);
        $this->assertStringContainsString('additional-payment-validators', $layout);
        $this->assertStringContainsString('fastcheckout-one-step-validator', $layout);
        $this->assertStringContainsString('data-fastcheckout-subscribe', $newsletter);
        $this->assertStringContainsString("'newsletterLabel'", $configProvider);
        $this->assertStringContainsString("__('Sign Up for Our Newsletter')", $configProvider);
        $this->assertStringContainsString("provider.get('fastcheckout')", $placeOrder);
        $this->assertStringNotContainsString('fastcheckout_comment', $placeOrder);
        $this->assertStringNotContainsString('fastcheckout_subscribe', $placeOrder);
        $this->assertStringNotContainsString('data-fastcheckout-agreements-host', $summary);
        $this->assertStringContainsString('data-fastcheckout-agreements-summary-host', $summary);
        $this->assertStringNotContainsString('data-fastcheckout-place-order-ssr', $payment);
        $this->assertStringContainsString('data-fastcheckout-place-order-ssr', $summary);
    }

    public function testRatesAndSummaryHaveNoPhpFallbackOrSecondCheckoutBlock(): void
    {
        $block = (string)file_get_contents($this->moduleRoot() . '/Block/Hyva/Checkout.php');
        $summary = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/summary.phtml'
        );
        $shipping = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/shipping-methods.phtml'
        );
        $layout = (string)file_get_contents(
            $this->moduleRoot() . '/view/frontend/layout/fastcheckout_index_index.xml'
        );

        $this->assertStringNotContainsString('getSummaryTotals', $block);
        $this->assertStringNotContainsString('getShippingMethods', $block);
        $this->assertStringNotContainsString('TaxHelper', $block);
        $this->assertStringNotContainsString('data-fastcheckout-summary-ssr', $summary);
        $this->assertStringNotContainsString('$shippingMethods', $shipping);
        $this->assertSame(1, substr_count(
            $layout,
            'class="Kkkonrad\Fastcheckout\Block\Hyva\Checkout"'
        ));
        $this->assertFileDoesNotExist(
            $this->moduleRoot() . '/view/frontend/templates/hyva/knockout/checkout-renderers.phtml'
        );
    }

    public function testModuleHasNoHyvaCheckoutOrMagewireRequirement(): void
    {
        $composer = (string)file_get_contents($this->moduleRoot() . '/composer.json');
        $module = (string)file_get_contents($this->moduleRoot() . '/etc/module.xml');

        $this->assertStringNotContainsString('magento2-hyva-checkout', $composer);
        $this->assertStringNotContainsString('magewire', strtolower($composer . $module));
    }
}
