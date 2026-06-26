<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Hyva;

use Kkkonrad\Fastcheckout\Block\Hyva\Checkout;
use Kkkonrad\Fastcheckout\Helper\Data as OpcHelper;
use Hyva\Theme\Model\ViewModelRegistry;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class CheckoutTest extends TestCase
{
    /**
     * @var Checkout
     */
    private $checkoutBlock;

    /**
     * @var Context|MockObject
     */
    private $contextMock;

    /**
     * @var CheckoutSession|MockObject
     */
    private $checkoutSessionMock;

    /**
     * @var PricingHelper|MockObject
     */
    private $pricingHelperMock;

    /**
     * @var ImageHelper|MockObject
     */
    private $imageHelperMock;

    /**
     * @var ProductConfiguration|MockObject
     */
    private $productConfigurationMock;

    /**
     * @var ViewModelRegistry|MockObject
     */
    private $viewModelRegistryMock;

    /**
     * @var OpcHelper|MockObject
     */
    private $opcHelperMock;

    /**
     * @var Quote|MockObject
     */
    private $quoteMock;

    protected function setUp(): void
    {
        $this->contextMock = $this->createMock(Context::class);
        
        $this->checkoutSessionMock = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getQuote'])
            ->getMock();
            
        $this->pricingHelperMock = $this->createMock(PricingHelper::class);
        $this->imageHelperMock = $this->createMock(ImageHelper::class);
        $this->productConfigurationMock = $this->createMock(ProductConfiguration::class);
        $this->viewModelRegistryMock = $this->createMock(ViewModelRegistry::class);
        $this->opcHelperMock = $this->createMock(OpcHelper::class);
        $this->quoteMock = $this->createMock(Quote::class);

        $this->checkoutSessionMock->expects($this->any())
            ->method('getQuote')
            ->willReturn($this->quoteMock);

        $this->checkoutBlock = new Checkout(
            $this->contextMock,
            $this->checkoutSessionMock,
            $this->pricingHelperMock,
            $this->imageHelperMock,
            $this->productConfigurationMock,
            $this->viewModelRegistryMock,
            $this->opcHelperMock,
            null,
            null,
            null,
            null,
            []
        );
    }

    public function testGetQuote(): void
    {
        $this->assertSame($this->quoteMock, $this->checkoutBlock->getQuote());
    }

    public function testGetVisibleItems(): void
    {
        $itemMock = $this->createMock(Item::class);
        $this->quoteMock->expects($this->once())
            ->method('getAllVisibleItems')
            ->willReturn([$itemMock]);

        $this->assertSame([$itemMock], $this->checkoutBlock->getVisibleItems());
    }

    public function testGetItemsQty(): void
    {
        $this->quoteMock->expects($this->once())
            ->method('getItemsQty')
            ->willReturn(5.0);

        $this->assertEquals(5.0, $this->checkoutBlock->getItemsQty());
    }

    public function testFormatPrice(): void
    {
        $this->pricingHelperMock->expects($this->once())
            ->method('currency')
            ->with(100.0, true, false)
            ->willReturn('$100.00');

        $this->assertEquals('$100.00', $this->checkoutBlock->formatPrice(100));
    }
}
