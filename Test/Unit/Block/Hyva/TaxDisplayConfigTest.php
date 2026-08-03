<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Hyva;

use Kkkonrad\Fastcheckout\Block\Hyva\Checkout;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Hyva\Theme\Model\ViewModelRegistry;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use Magento\Quote\Model\Quote\Address\Rate;
use Magento\Quote\Model\Quote\Item;
use Magento\Tax\Helper\Data as TaxHelper;
use Magento\Tax\Model\Config as TaxConfig;
use Magento\Framework\DataObject;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Magento tax/cart display settings must drive Fastcheckout line and shipping prices.
 */
class TaxDisplayConfigTest extends TestCase
{
    /** @var CheckoutSession|MockObject */
    private $checkoutSession;

    /** @var Quote|MockObject */
    private $quote;

    /** @var Address|MockObject */
    private $shippingAddress;

    /** @var TaxHelper|MockObject */
    private $taxHelper;

    protected function setUp(): void
    {
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getQuote'])
            ->getMock();
        $this->quote = $this->createMock(Quote::class);
        $this->shippingAddress = $this->createMock(Address::class);
        $this->taxHelper = $this->createMock(TaxHelper::class);

        $this->checkoutSession->method('getQuote')->willReturn($this->quote);
        $this->quote->method('getShippingAddress')->willReturn($this->shippingAddress);
        $this->quote->method('getCustomerTaxClassId')->willReturn(3);
    }

    private function createBlock(?TaxHelper $taxHelper): Checkout
    {
        $context = $this->createMock(Context::class);
        $pricing = $this->createMock(PricingHelper::class);
        $pricing->method('currency')->willReturnCallback(static function ($amount) {
            return '$' . number_format((float)$amount, 2);
        });

        return new Checkout(
            $context,
            $this->checkoutSession,
            $pricing,
            $this->createMock(ImageHelper::class),
            $this->createMock(ProductConfiguration::class),
            $this->createMock(ViewModelRegistry::class),
            $this->createMock(Helper::class),
            null,
            null,
            null,
            null,
            [],
            $taxHelper
        );
    }

    public function testItemRowTotalUsesInclWhenMagentoDisplayInclTax(): void
    {
        $this->taxHelper->method('displayCartPriceInclTax')->willReturn(true);
        $this->taxHelper->method('displayCartPriceExclTax')->willReturn(false);
        $this->taxHelper->method('displayCartBothPrices')->willReturn(false);

        $item = $this->createQuoteItem(100.0, 123.0);

        $block = $this->createBlock($this->taxHelper);
        $this->assertTrue($block->displayCartPriceInclTax());
        $this->assertSame(123.0, $block->getItemRowTotal($item));
        $this->assertSame(100.0, $block->getItemRowTotalExclTax($item));
        $this->assertSame(123.0, $block->getItemRowTotalInclTax($item));
    }

    public function testItemRowTotalUsesExclWhenMagentoDisplayExclTax(): void
    {
        $this->taxHelper->method('displayCartPriceInclTax')->willReturn(false);
        $this->taxHelper->method('displayCartPriceExclTax')->willReturn(true);
        $this->taxHelper->method('displayCartBothPrices')->willReturn(false);

        $item = $this->createQuoteItem(100.0, 123.0);

        $block = $this->createBlock($this->taxHelper);
        $this->assertTrue($block->displayCartPriceExclTax());
        $this->assertFalse($block->displayCartBothPrices());
        $this->assertSame(100.0, $block->getItemRowTotal($item));
    }

    public function testBothPricesFlagsExposeInclAndExclAmounts(): void
    {
        $this->taxHelper->method('displayCartPriceInclTax')->willReturn(false);
        $this->taxHelper->method('displayCartPriceExclTax')->willReturn(false);
        $this->taxHelper->method('displayCartBothPrices')->willReturn(true);

        $item = $this->createQuoteItem(80.0, 98.4);

        $block = $this->createBlock($this->taxHelper);
        $this->assertTrue($block->displayCartBothPrices());
        // Primary for both follows Magento renderer (incl first).
        $this->assertSame(98.4, $block->getItemRowTotal($item));
        $this->assertSame(80.0, $block->getItemRowTotalExclTax($item));
        $this->assertSame(98.4, $block->getItemRowTotalInclTax($item));
    }

    public function testShippingRateAmountsUseTaxHelperNotRawRateOnly(): void
    {
        $this->taxHelper->method('displayShippingPriceExcludingTax')->willReturn(false);
        $this->taxHelper->method('displayShippingBothPrices')->willReturn(true);
        $this->taxHelper->expects($this->atLeast(2))
            ->method('getShippingPrice')
            ->willReturnCallback(static function ($price, $includingTax) {
                return $includingTax ? ((float)$price * 1.23) : (float)$price;
            });

        $rate = new class {
            public function getPrice()
            {
                return 20.0;
            }
        };

        $block = $this->createBlock($this->taxHelper);
        $this->assertSame(20.0, $block->getShippingRateAmountExclTax($rate));
        $this->assertSame(24.6, $block->getShippingRateAmountInclTax($rate));
        $this->assertFalse($block->displayShippingPriceExclTax());
        $this->assertTrue($block->displayShippingBothPrices());
        // Incl primary when not excl-only.
        $this->assertSame(24.6, $block->getShippingRateDisplayAmount($rate));
    }

    public function testDefaultCountryHelperStillReadsDirectoryConfig(): void
    {
        $root = dirname(__DIR__, 4);
        // Structural: method exists and is used by shipping-methods SSR seed.
        $source = file_get_contents($root . '/Block/Hyva/Checkout.php');
        $this->assertNotFalse($source);
        $this->assertStringContainsString('function getDefaultDestinationCountryId', $source);
        $this->assertStringContainsString('XML_PATH_DEFAULT_COUNTRY', $source);

        $template = file_get_contents(
            $root . '/view/frontend/templates/hyva/checkout/shipping-methods.phtml'
        );
        $this->assertStringContainsString('getDefaultDestinationCountryId()', $template);
        $this->assertStringContainsString('getShippingRateAmountExclTax', $template);
        $this->assertStringContainsString('getShippingRateDisplayAmount', $template);

        $summary = file_get_contents(
            $root . '/view/frontend/templates/hyva/checkout/summary.phtml'
        );
        // Primary path: Magento stock KO summary (Tax module owns display modes).
        $this->assertStringContainsString("scope: 'checkout.sidebar.summary'", $summary);
        $this->assertStringContainsString('data-fastcheckout-native-summary', $summary);
        // SSR fallback still uses PHP getSummaryTotals until KO binds.
        $this->assertStringContainsString('getSummaryTotals()', $summary);

        $list = file_get_contents(
            $root . '/view/frontend/web/template/hyva/shipping-list.html'
        );
        $this->assertStringContainsString('formatShippingPrice', $list);
        $this->assertStringContainsString('showShippingPriceExclSecondary', $list);

        $bridge = file_get_contents(
            $root . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );
        $this->assertStringContainsString('displayBillingOnPaymentMethod', $bridge);
        $this->assertStringContainsString('defaultCountryId', $bridge);
    }

    public function testSummaryShippingRowUsesInclWhenCartShippingDisplayIsIncl(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartShippingInclTax')->willReturn(true);
        $taxConfig->method('displayCartShippingExclTax')->willReturn(false);
        $taxConfig->method('displayCartShippingBoth')->willReturn(false);
        $taxConfig->method('displayCartSubtotalBoth')->willReturn(false);
        $taxConfig->method('displayCartSubtotalInclTax')->willReturn(false);
        $taxConfig->method('displayCartTaxWithGrandTotal')->willReturn(false);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        $shipping = new DataObject([
            'code' => 'shipping',
            'title' => 'Shipping',
            'value' => 20.0,
            'shipping_incl_tax' => 24.6,
            'area' => null,
        ]);

        $block = $this->createBlock($this->taxHelper);
        $rows = $block->buildSummaryTotalRows('shipping', $shipping);

        $this->assertCount(1, $rows);
        $this->assertSame('shipping', $rows[0]['code']);
        $this->assertSame(24.6, $rows[0]['value'], 'incl shipping display must not use excl getValue()');
    }

    public function testSummaryShippingBothEmitsExclAndInclRows(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartShippingBoth')->willReturn(true);
        $taxConfig->method('displayCartShippingInclTax')->willReturn(false);
        $taxConfig->method('displayCartShippingExclTax')->willReturn(false);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        $shipping = new DataObject([
            'title' => 'Shipping',
            'value' => 10.0,
            'shipping_incl_tax' => 12.3,
        ]);

        $rows = $this->createBlock($this->taxHelper)->buildSummaryTotalRows('shipping', $shipping);
        $this->assertCount(2, $rows);
        $this->assertSame(10.0, $rows[0]['value']);
        $this->assertSame(12.3, $rows[1]['value']);
        $this->assertSame('shipping_excl', $rows[0]['code']);
        $this->assertSame('shipping_incl', $rows[1]['code']);
    }

    public function testSummarySubtotalBothEmitsDualRows(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartSubtotalBoth')->willReturn(true);
        $taxConfig->method('displayCartSubtotalInclTax')->willReturn(false);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        // Magento Tax::fetch shape for both/incl: value is INCL, excl in value_excl_tax.
        $subtotal = new DataObject([
            'title' => 'Subtotal',
            'value' => 123.0,
            'value_incl_tax' => 123.0,
            'value_excl_tax' => 100.0,
        ]);

        $block = $this->createBlock($this->taxHelper);
        $this->assertSame(100.0, $block->resolveSubtotalExclTax($subtotal));
        $this->assertSame(123.0, $block->resolveSubtotalInclTax($subtotal));
        // Must not treat getValue() as excl when Magento stored incl there.
        $this->assertNotSame(
            (float)$subtotal->getValue(),
            $block->resolveSubtotalExclTax($subtotal)
        );

        $rows = $block->buildSummaryTotalRows('subtotal', $subtotal);
        $this->assertCount(2, $rows);
        $this->assertSame('subtotal_excl', $rows[0]['code']);
        $this->assertSame(100.0, $rows[0]['value'], 'Excl. Tax row must use value_excl_tax not incl getValue()');
        $this->assertSame('subtotal_incl', $rows[1]['code']);
        $this->assertSame(123.0, $rows[1]['value']);
    }

    public function testSummarySubtotalInclOnlyUsesInclValueFromMagentoShape(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartSubtotalBoth')->willReturn(false);
        $taxConfig->method('displayCartSubtotalInclTax')->willReturn(true);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        $subtotal = new DataObject([
            'title' => 'Subtotal',
            'value' => 123.0,
            'value_incl_tax' => 123.0,
            'value_excl_tax' => 100.0,
        ]);

        $rows = $this->createBlock($this->taxHelper)->buildSummaryTotalRows('subtotal', $subtotal);
        $this->assertCount(1, $rows);
        $this->assertSame(123.0, $rows[0]['value']);
    }

    public function testSummarySubtotalExclOnlyUsesGetValueAsExcl(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartSubtotalBoth')->willReturn(false);
        $taxConfig->method('displayCartSubtotalInclTax')->willReturn(false);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        // Excl-only: Tax::fetch does not rewrite subtotal; value stays excl.
        $subtotal = new DataObject([
            'title' => 'Subtotal',
            'value' => 100.0,
        ]);

        $block = $this->createBlock($this->taxHelper);
        $this->assertSame(100.0, $block->resolveSubtotalExclTax($subtotal));
        $rows = $block->buildSummaryTotalRows('subtotal', $subtotal);
        $this->assertCount(1, $rows);
        $this->assertSame(100.0, $rows[0]['value']);
    }

    public function testSummaryGrandTotalWithTaxShowsInclAndExclRows(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartTaxWithGrandTotal')->willReturn(true);

        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        $grand = new DataObject([
            'title' => 'Grand Total',
            'value' => 150.0,
            'area' => 'footer',
        ]);

        $rows = $this->createBlock($this->taxHelper)->buildSummaryTotalRows('grand_total', $grand, 23.0);
        $this->assertCount(2, $rows);
        $this->assertSame('grand_total_incl', $rows[0]['code']);
        $this->assertSame(150.0, $rows[0]['value']);
        $this->assertSame('grand_total_excl', $rows[1]['code']);
        $this->assertSame(127.0, $rows[1]['value']);
        $this->assertTrue($rows[0]['strong']);
    }

    public function testSummaryGrandTotalWithoutTaxFlagStaysSingleRow(): void
    {
        $taxConfig = $this->createMock(TaxConfig::class);
        $taxConfig->method('displayCartTaxWithGrandTotal')->willReturn(false);
        $this->taxHelper->method('getConfig')->willReturn($taxConfig);

        $grand = new DataObject(['title' => 'Grand Total', 'value' => 150.0, 'area' => 'footer']);
        $rows = $this->createBlock($this->taxHelper)->buildSummaryTotalRows('grand_total', $grand, 23.0);
        $this->assertCount(1, $rows);
        $this->assertSame('grand_total', $rows[0]['code']);
        $this->assertSame(150.0, $rows[0]['value']);
    }

    /**
     * Quote item getters are magic data methods — mock via addMethods.
     */
    private function createQuoteItem(float $excl, float $incl): Item
    {
        $item = $this->getMockBuilder(Item::class)
            ->disableOriginalConstructor()
            ->addMethods(['getRowTotal', 'getRowTotalInclTax'])
            ->getMock();
        $item->method('getRowTotal')->willReturn($excl);
        $item->method('getRowTotalInclTax')->willReturn($incl);

        return $item;
    }
}
