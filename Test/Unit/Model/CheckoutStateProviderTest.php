<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Model;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Model\CheckoutStateProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\DataObject;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CheckoutStateProviderTest extends TestCase
{
    public function testStateIncludesShippingRateExtensionAttributes(): void
    {
        $checkoutSession = $this->createMock(CheckoutSession::class);
        $cartRepository = $this->createMock(CartRepositoryInterface::class);
        $paymentMethodManagement = $this->createMock(PaymentMethodManagementInterface::class);
        $helper = $this->createMock(Helper::class);
        $logger = $this->createMock(LoggerInterface::class);

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'collectTotals',
                'getAllVisibleItems',
                'getId',
                'getPayment',
                'getShippingAddress',
                'getTotals',
                'hasItems',
                'isVirtual',
            ])
            ->addMethods([
                'getCouponCode',
                'getGrandTotal',
                'getSubtotal',
                'getSubtotalWithDiscount',
            ])
            ->getMock();

        $shippingAddress = $this->getMockBuilder(QuoteAddress::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'getCountryId',
                'getGroupedAllShippingRates',
                'getShippingMethod',
            ])
            ->addMethods([
                'getCollectShippingRates',
                'setCollectShippingRates',
            ])
            ->getMock();

        $rate = new class extends DataObject {
            public function __construct()
            {
                parent::__construct([
                    'amount' => 17.75,
                    'base_amount' => 16.0,
                    'price_excl_tax' => 14.43,
                    'price_incl_tax' => 17.75,
                ]);
            }

            public function getCarrier()
            {
                return 'locker';
            }

            public function getMethod()
            {
                return 'pickup_point_cod';
            }

            public function getCarrierTitle()
            {
                return 'Locker';
            }

            public function getMethodTitle()
            {
                return 'Pickup COD';
            }

            public function getPrice()
            {
                return 14.5;
            }

            public function getErrorMessage()
            {
                return '';
            }

            public function getExtensionAttributes()
            {
                return new DataObject([
                    'pickup_point_required' => true,
                    'metadata' => [
                        'provider' => 'locker_vendor',
                    ],
                    'requirements' => [
                        [
                            'attributeCode' => 'locker_size',
                            'value' => 'M',
                        ],
                        [
                            'code' => 'pickup_channel',
                            'value' => 'parcel_locker',
                        ],
                    ],
                ]);
            }
        };

        $checkoutSession->method('getQuote')->willReturn($quote);
        $quote->method('getId')->willReturn(42);
        $quote->method('hasItems')->willReturn(true);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->method('getTotals')->willReturn(null);
        $quote->method('getAllVisibleItems')->willReturn(null);
        $quote->method('getCouponCode')->willReturn('');
        $quote->method('getGrandTotal')->willReturn(14.5);
        $quote->method('getSubtotal')->willReturn(0.0);
        $quote->method('getSubtotalWithDiscount')->willReturn(0.0);

        $cartRepository->expects($this->once())->method('save')->with($quote);
        $paymentMethodManagement->expects($this->once())->method('getList')->with(42)->willReturn([]);

        $shippingAddress->method('getCountryId')->willReturn('PL');
        $shippingAddress->method('getShippingMethod')->willReturn('locker_pickup_point_cod');
        $shippingAddress->method('getCollectShippingRates')->willReturn(false);
        $shippingAddress->method('getGroupedAllShippingRates')->willReturn(['locker' => [$rate]]);

        $provider = new CheckoutStateProvider(
            $checkoutSession,
            $cartRepository,
            $paymentMethodManagement,
            $helper,
            $logger
        );

        $state = $provider->getState();

        $this->assertSame('', $state['selected_payment_method']);
        $this->assertSame('', $state['selectedPaymentMethod']);
        $this->assertSame('', $state['paymentMethod']);
        $this->assertSame('locker', $state['shipping_rates'][0]['carrier_code']);
        $this->assertSame('locker_pickup_point_cod', $state['selected_shipping_method']);
        $this->assertSame('locker_pickup_point_cod', $state['selectedShippingMethod']);
        $this->assertSame('locker_pickup_point_cod', $state['selected_shipping_rate']);
        $this->assertSame('locker_pickup_point_cod', $state['selectedShippingRate']);
        $this->assertSame('pickup_point_cod', $state['shipping_rates'][0]['method_code']);
        $this->assertSame(17.75, $state['shipping_rates'][0]['amount']);
        $this->assertSame(16.0, $state['shipping_rates'][0]['base_amount']);
        $this->assertSame(14.43, $state['shipping_rates'][0]['price_excl_tax']);
        $this->assertSame(17.75, $state['shipping_rates'][0]['price_incl_tax']);
        $this->assertTrue($state['shipping_rates'][0]['extension_attributes']['pickup_point_required']);
        $this->assertSame('locker_vendor', $state['shipping_rates'][0]['extension_attributes']['metadata']['provider']);
        $this->assertSame('M', $state['shipping_rates'][0]['extension_attributes']['requirements']['locker_size']);
        $this->assertSame('parcel_locker', $state['shipping_rates'][0]['extension_attributes']['requirements']['pickup_channel']);
        $this->assertSame($state['shipping_rates'][0]['extension_attributes'], $state['shipping_rates'][0]['extensionAttributes']);
        $this->assertSame([], $state['totals']['items']);
        $this->assertSame([], $state['totals']['total_segments']);
    }
}
