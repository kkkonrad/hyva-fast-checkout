<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Checkout;

use Kkkonrad\Fastcheckout\Block\Checkout\LayoutProcessor;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use PHPUnit\Framework\TestCase;

class LayoutProcessorTest extends TestCase
{
    public function testChangesOnlyFastcheckoutPresentation(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(true);
        $layout = $this->layout();

        $result = (new LayoutProcessor($helper))->process($layout);
        $checkout = $result['components']['checkout']['children'];
        $shipping = $checkout['steps']['children']['shipping-step']['children']['shippingAddress'];
        $summary = $checkout['sidebar']['children']['summary'];
        $discount = $checkout['steps']['children']['billing-step']['children']['payment']
            ['children']['afterMethods']['children']['discount'];

        self::assertSame('Kkkonrad_Fastcheckout/hyva/shipping-address', $shipping['template']);
        self::assertSame(
            'Kkkonrad_Fastcheckout/hyva/shipping-list',
            $shipping['shippingMethodListTemplate']
        );
        self::assertSame(
            'Kkkonrad_Fastcheckout/hyva/shipping-method-item',
            $shipping['shippingMethodItemTemplate']
        );
        self::assertSame('third-party', $shipping['children']['shippingAdditional']['component']);
        self::assertSame('Kkkonrad_Fastcheckout/hyva/summary', $summary['template']);
        self::assertSame(10, $summary['children']['cart_items']['sortOrder']);
        self::assertSame(20, $summary['children']['itemsAfter']['sortOrder']);
        self::assertSame(30, $summary['children']['totals']['sortOrder']);
        self::assertSame('Kkkonrad_Fastcheckout/hyva/payment/discount', $discount['template']);
    }

    public function testLeavesNativeLayoutUntouchedOutsideFastcheckout(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(false);
        $layout = $this->layout();

        self::assertSame($layout, (new LayoutProcessor($helper))->process($layout));
    }

    public function testKeepsThirdPartyComponentTemplates(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(true);
        $layout = $this->layout();
        $shipping = &$layout['components']['checkout']['children']['steps']['children']
            ['shipping-step']['children']['shippingAddress'];
        $shipping['config']['shippingMethodListTemplate'] =
            'Magento_Checkout/shipping-address/shipping-method-list';
        $shipping['shippingMethodListTemplate'] = 'Vendor_Module/shipping-list';
        $shipping['config']['shippingMethodItemTemplate'] = 'Vendor_Module/shipping-item';
        $shipping['config']['template'] = 'Vendor_Module/shipping';
        $summary = &$layout['components']['checkout']['children']['sidebar']['children']['summary'];
        $summary['template'] = 'Vendor_Module/summary';
        $discount = &$layout['components']['checkout']['children']['steps']['children']
            ['billing-step']['children']['payment']['children']['afterMethods']['children']['discount'];
        $discount['config']['template'] = 'Vendor_Module/discount';

        $result = (new LayoutProcessor($helper))->process($layout);
        $shipping = $result['components']['checkout']['children']['steps']['children']
            ['shipping-step']['children']['shippingAddress'];
        $summary = $result['components']['checkout']['children']['sidebar']['children']['summary'];
        $discount = $result['components']['checkout']['children']['steps']['children']
            ['billing-step']['children']['payment']['children']['afterMethods']['children']['discount'];

        self::assertSame('Vendor_Module/shipping', $shipping['template']);
        self::assertSame('Vendor_Module/shipping-list', $shipping['config']['shippingMethodListTemplate']);
        self::assertSame('Vendor_Module/shipping-list', $shipping['shippingMethodListTemplate']);
        self::assertSame('Vendor_Module/shipping-item', $shipping['config']['shippingMethodItemTemplate']);
        self::assertSame('Vendor_Module/shipping-item', $shipping['shippingMethodItemTemplate']);
        self::assertSame('Vendor_Module/summary', $summary['template']);
        self::assertSame('Vendor_Module/discount', $discount['template']);
    }

    private function layout(): array
    {
        return [
            'components' => [
                'checkout' => [
                    'children' => [
                        'steps' => [
                            'children' => [
                                'shipping-step' => [
                                    'children' => [
                                        'shippingAddress' => [
                                            'config' => [],
                                            'children' => [
                                                'shippingAdditional' => ['component' => 'third-party'],
                                            ],
                                        ],
                                    ],
                                ],
                                'billing-step' => [
                                    'children' => [
                                        'payment' => [
                                            'children' => [
                                                'afterMethods' => [
                                                    'children' => ['discount' => ['config' => []]],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        'sidebar' => [
                            'children' => [
                                'summary' => [
                                    'config' => [],
                                    'children' => [
                                        'cart_items' => [],
                                        'itemsAfter' => [],
                                        'totals' => [],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }
}
