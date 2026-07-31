<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Hyva;

use Kkkonrad\Fastcheckout\Block\Hyva\Checkout as CheckoutBlock;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as ShippingAddress;
use Magento\Store\Model\ScopeInterface;
use Hyva\Theme\Model\ViewModelRegistry;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * The server may reuse already collected rates, but must not synchronously
 * collect carrier rates while rendering the checkout response.
 */
class DefaultDestinationRatesTest extends TestCase
{
    public function testShippingMethodsFillTheStoreDefaultDestinationBeforeReadingRates(): void
    {
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(function ($path) {
            if ($path === \Magento\Directory\Helper\Data::XML_PATH_DEFAULT_COUNTRY) {
                return 'PL';
            }
            if ($path === 'shipping/origin/postcode') {
                return '00-001';
            }
            if ($path === 'shipping/origin/region_id') {
                return '0';
            }
            if ($path === 'shipping/origin/city') {
                return 'Warsaw';
            }
            return null;
        });

        $shippingAddress = $this->getMockBuilder(ShippingAddress::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'getCountryId',
                'setCountryId',
                'getPostcode',
                'setPostcode',
                'getRegionId',
                'setRegionId',
                'getCity',
                'setCity',
                'getGroupedAllShippingRates',
                'unsetData',
            ])
            ->getMock();
        $country = null;
        $shippingAddress->method('getCountryId')->willReturnCallback(static function () use (&$country) {
            return $country;
        });
        $shippingAddress->method('getPostcode')->willReturn('');
        $shippingAddress->method('getRegionId')->willReturn(0);
        $shippingAddress->method('getCity')->willReturn('');
        $shippingAddress->expects($this->once())
            ->method('setCountryId')
            ->with('PL')
            ->willReturnCallback(static function ($value) use (&$country, $shippingAddress) {
                $country = $value;

                return $shippingAddress;
            });
        $shippingAddress->expects($this->once())->method('setPostcode')->with('00-001');
        $shippingAddress->expects($this->once())->method('setCity')->with('Warsaw');
        $shippingAddress->method('getGroupedAllShippingRates')->willReturn([]);

        // Everything that was filled in has to be dropped again after the rates are read.
        $unset = [];
        $shippingAddress->expects($this->exactly(3))
            ->method('unsetData')
            ->willReturnCallback(static function ($field) use (&$unset, $shippingAddress) {
                $unset[] = $field;

                return $shippingAddress;
            });

        $quote = $this->createMock(Quote::class);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);

        $block = $this->createPartialBlock($scopeConfig, $quote);
        $block->getShippingMethods();

        $this->assertSame(['country_id', 'postcode', 'city'], $unset);
    }

    public function testGetShippingMethodsReusesRatesWithoutCollectingTotals(): void
    {
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(function ($path) {
            if ($path === \Magento\Directory\Helper\Data::XML_PATH_DEFAULT_COUNTRY) {
                return 'DE';
            }
            return null;
        });

        $rate = new \stdClass();
        $shippingAddress = $this->getMockBuilder(ShippingAddress::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'getCountryId',
                'setCountryId',
                'getPostcode',
                'setPostcode',
                'getRegionId',
                'setRegionId',
                'getCity',
                'setCity',
                'getGroupedAllShippingRates',
                'unsetData',
            ])
            ->addMethods([
                'getCollectShippingRates',
                'setCollectShippingRates',
            ])
            ->getMock();

        $country = null;
        $shippingAddress->method('getCountryId')->willReturnCallback(function () use (&$country) {
            return $country;
        });
        $shippingAddress->method('setCountryId')->willReturnCallback(function ($c) use (&$country, $shippingAddress) {
            $country = $c;
            return $shippingAddress;
        });
        $shippingAddress->method('getPostcode')->willReturn('');
        $shippingAddress->method('getRegionId')->willReturn(0);
        $shippingAddress->method('getCity')->willReturn('');
        $shippingAddress->method('getCollectShippingRates')->willReturn(true);
        $shippingAddress->expects($this->never())->method('setCollectShippingRates');
        $shippingAddress->method('getGroupedAllShippingRates')->willReturnCallback(
            function () use ($rate, &$country) {
                // The placeholder destination must still be in place while rates are read.
                $this->assertSame('DE', $country);

                return ['flatrate' => [$rate]];
            }
        );

        // ...and must be gone afterwards, so a later quote save cannot persist the
        // store's shipping origin as the shopper's own address.
        $shippingAddress->expects($this->once())->method('unsetData')->with('country_id');

        $quote = $this->createMock(Quote::class);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->expects($this->never())->method('collectTotals');

        $block = $this->createPartialBlock($scopeConfig, $quote);
        $methods = $block->getShippingMethods();

        $this->assertArrayHasKey('flatrate', $methods);
    }

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param Quote $quote
     * @return CheckoutBlock
     */
    private function createPartialBlock(ScopeConfigInterface $scopeConfig, Quote $quote): CheckoutBlock
    {
        $context = $this->createMock(Context::class);
        $context->method('getScopeConfig')->willReturn($scopeConfig);

        $session = $this->createMock(CheckoutSession::class);
        $session->method('getQuote')->willReturn($quote);

        /** @var CheckoutBlock|MockObject $block */
        $block = $this->getMockBuilder(CheckoutBlock::class)
            ->setConstructorArgs([
                $context,
                $session,
                $this->createMock(PricingHelper::class),
                $this->createMock(ImageHelper::class),
                $this->createMock(ProductConfiguration::class),
                $this->createMock(ViewModelRegistry::class),
                $this->createMock(Helper::class),
            ])
            ->onlyMethods([])
            ->getMock();

        return $block;
    }
}
