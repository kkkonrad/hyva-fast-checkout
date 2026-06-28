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
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $logger = $this->createMock(LoggerInterface::class);
        $scopeConfig->method('getValue')->willReturn('{invalid json');
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($logger);

        $storeManager = $this->createMock(StoreManagerInterface::class);
        $customerSession = $this->createMock(CustomerSession::class);
        $messageSession = $this->createMock(MessageSession::class);
        $jsonHelper = $this->createMock(JsonHelper::class);
        $jsonHelper->method('jsonDecode')->willThrowException(new \InvalidArgumentException('invalid json'));
        $cart = $this->createMock(Cart::class);
        $quoteFactory = $this->createMock(QuoteFactory::class);
        $regionCollectionFactory = $this->createMock(CollectionFactory::class);
        $design = $this->createMock(DesignInterface::class);
        $themeFactory = $this->createMock(ThemeFactory::class);

        $helper = new Data(
            $context,
            $storeManager,
            $customerSession,
            $messageSession,
            $jsonHelper,
            $cart,
            $quoteFactory,
            $regionCollectionFactory,
            $design,
            $themeFactory
        );

        $this->assertSame([], $helper->getShippingPaymentMapping());
    }
}
