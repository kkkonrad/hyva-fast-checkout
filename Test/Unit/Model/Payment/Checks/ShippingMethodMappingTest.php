<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Model\Payment\Checks;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Model\Payment\Checks\ShippingMethodMapping;
use Magento\Payment\Model\MethodInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ShippingMethodMappingTest extends TestCase
{
    #[DataProvider('rules')]
    public function testUsesMagentoPaymentCheck(
        string $shipping,
        string $payment,
        bool $expected
    ): void {
        $mapping = [
            ['shipping_method' => 'flatrate_*', 'payment_method' => 'checkmo'],
            ['shipping_method' => 'furgonetkapl', 'payment_method' => 'payu_gateway'],
            ['shipping_method' => 'tablerate_bestway', 'payment_method' => 'banktransfer'],
        ];

        self::assertSame($expected, $this->check($mapping, $shipping, $payment));
    }

    public static function rules(): array
    {
        return [
            'shipping wildcard' => ['flatrate_flatrate', 'checkmo', true],
            'carrier code' => ['furgonetkapl_furgonetka_f_inpost', 'payu_gateway', true],
            'exact code' => ['tablerate_bestway', 'banktransfer', true],
            'listed elsewhere' => ['flatrate_flatrate', 'banktransfer', false],
            'unmapped shipping' => ['freeshipping_freeshipping', 'checkmo', false],
            'new payment' => ['flatrate_flatrate', 'payu_card', true],
        ];
    }

    public function testLeavesDisabledVirtualAndUnconfiguredCheckoutAlone(): void
    {
        $mapping = [['shipping_method' => 'flatrate_*', 'payment_method' => 'checkmo']];

        self::assertTrue($this->check([], 'flatrate_flatrate', 'checkmo'));
        self::assertTrue($this->check($mapping, 'flatrate_flatrate', 'banktransfer', false));
        self::assertTrue($this->check($mapping, 'flatrate_flatrate', 'banktransfer', true, true));
    }

    private function check(
        array $mapping,
        string $shipping,
        string $payment,
        bool $enabled = true,
        bool $virtual = false
    ): bool {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn($enabled);
        $helper->method('getShippingPaymentMapping')->willReturn($mapping);

        $address = $this->createMock(Address::class);
        $address->method('getShippingMethod')->willReturn($shipping);
        $quote = $this->createMock(Quote::class);
        $quote->method('isVirtual')->willReturn($virtual);
        $quote->method('getShippingAddress')->willReturn($address);
        $method = $this->createMock(MethodInterface::class);
        $method->method('getCode')->willReturn($payment);

        return (new ShippingMethodMapping($helper))->isApplicable($method, $quote);
    }
}
