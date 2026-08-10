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
