<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Helper;

use Kkkonrad\Fastcheckout\Helper\Data;
use Magento\Checkout\Model\Cart;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Directory\Model\ResourceModel\Region\CollectionFactory;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Helper\Context;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\Message\Session as MessageSession;
use Magento\Framework\View\DesignInterface;
use Magento\Quote\Model\QuoteFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Theme\Model\ThemeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class DataTest extends TestCase
{
    public function testGetShippingPaymentMappingReturnsEmptyArrayWhenJsonIsInvalid(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $jsonHelper = $this->createMock(JsonHelper::class);
        $jsonHelper->method('jsonDecode')->willThrowException(new \InvalidArgumentException('invalid json'));

        $helper = $this->createHelper('{invalid json', $jsonHelper, $logger);

        $this->assertSame([], $helper->getShippingPaymentMapping());
    }

    public function testGetMappedPaymentMethodsForShippingMatchesExactCarrierAndWildcards(): void
    {
        $mapping = [
            '_1' => ['shipping_method' => 'customcarrier_pickup_point_cod', 'payment_method' => 'cashondelivery'],
            '_2' => ['shipping_method' => 'customcarrier_*', 'payment_method' => 'payu_gateway'],
            '_3' => ['shipping_method' => 'customcarrier', 'payment_method' => 'banktransfer'],
            '_4' => ['shipping_method' => '*', 'payment_method' => 'checkmo'],
            '_5' => ['shipping_method' => 'tablerate_*', 'payment_method' => 'free'],
            '_6' => ['shipping_method' => 'customcarrier_*', 'payment_method' => 'payu_gateway'],
        ];

        $jsonHelper = $this->createMock(JsonHelper::class);
        $jsonHelper->method('jsonDecode')->willReturn($mapping);

        $helper = $this->createHelper('encoded mapping', $jsonHelper);

        $this->assertSame(
            ['cashondelivery', 'payu_gateway', 'banktransfer', 'checkmo'],
            $helper->getMappedPaymentMethodsForShipping('customcarrier_pickup_point_cod')
        );
        $this->assertSame(
            ['payu_gateway', 'banktransfer', 'checkmo'],
            $helper->getMappedPaymentMethodsForShipping('customcarrier_courier')
        );
        $this->assertSame(
            ['checkmo', 'free'],
            $helper->getMappedPaymentMethodsForShipping('tablerate_bestway')
        );
    }

    public function testIsPaymentMethodCodeAllowedByRulesMatchesExactCodesOnly(): void
    {
        $helper = $this->createHelper('', $this->createMock(JsonHelper::class));

        $this->assertTrue($helper->isPaymentMethodCodeAllowedByRules('checkmo', ['checkmo']));
        $this->assertTrue($helper->isPaymentMethodCodeAllowedByRules('payu_blik', ['checkmo', 'payu_blik']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('payu', ['payu_*']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('payu_blik', ['payu_*']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('payu-card', ['payu_*']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('payu_card', ['checkmo', 'payu_*']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('stripe_payments', ['*']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('payu_blik', ['checkmo', 'banktransfer']));
        $this->assertFalse($helper->isPaymentMethodCodeAllowedByRules('', ['*']));
    }

    private function createHelper(
        string $configValue,
        JsonHelper $jsonHelper,
        LoggerInterface $logger = null
    ): Data {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($configValue);
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($logger ?: $this->createMock(LoggerInterface::class));

        return new Data(
            $context,
            $this->createMock(StoreManagerInterface::class),
            $this->createMock(CustomerSession::class),
            $this->createMock(MessageSession::class),
            $jsonHelper,
            $this->createMock(Cart::class),
            $this->createMock(QuoteFactory::class),
            $this->createMock(CollectionFactory::class),
            $this->createMock(DesignInterface::class),
            $this->createMock(ThemeFactory::class)
        );
    }
}
