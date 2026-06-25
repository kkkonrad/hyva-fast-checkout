<?php

namespace IWD\Opc\Block\Hyva;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;

class Checkout extends Template
{
    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @var PricingHelper
     */
    private $pricingHelper;

    /**
     * @var ImageHelper
     */
    private $imageHelper;

    /**
     * @var ProductConfiguration
     */
    private $productConfiguration;

    /**
     * @var Quote|null
     */
    private $quote;

    /**
     * @param Context $context
     * @param CheckoutSession $checkoutSession
     * @param PricingHelper $pricingHelper
     * @param ImageHelper $imageHelper
     * @param ProductConfiguration $productConfiguration
     * @param array $data
     */
    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        PricingHelper $pricingHelper,
        ImageHelper $imageHelper,
        ProductConfiguration $productConfiguration,
        array $data = []
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->pricingHelper = $pricingHelper;
        $this->imageHelper = $imageHelper;
        $this->productConfiguration = $productConfiguration;

        parent::__construct($context, $data);
    }

    /**
     * @return Quote
     */
    public function getQuote()
    {
        if ($this->quote === null) {
            $this->quote = $this->checkoutSession->getQuote();
        }

        return $this->quote;
    }

    /**
     * @return Item[]
     */
    public function getVisibleItems()
    {
        return $this->getQuote()->getAllVisibleItems();
    }

    /**
     * @return float
     */
    public function getItemsQty()
    {
        return (float) $this->getQuote()->getItemsQty();
    }

    /**
     * @param float|int|string|null $amount
     * @return string
     */
    public function formatPrice($amount)
    {
        return $this->pricingHelper->currency((float) $amount, true, false);
    }

    /**
     * @param Item $item
     * @return string
     */
    public function getItemImageUrl(Item $item)
    {
        return $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getUrl();
    }

    /**
     * @param Item $item
     * @return array
     */
    public function getItemOptions(Item $item)
    {
        return $this->productConfiguration->getCustomOptions($item);
    }

    /**
     * @param Item $item
     * @return float
     */
    public function getItemRowTotal(Item $item)
    {
        $rowTotal = $item->getRowTotalInclTax();

        if ($rowTotal === null) {
            $rowTotal = $item->getRowTotal();
        }

        return (float) $rowTotal;
    }

    /**
     * @return array
     */
    public function getSummaryTotals()
    {
        $quote = $this->getQuote();
        $shippingAddress = $quote->getShippingAddress();

        $totals = [
            [
                'code' => 'subtotal',
                'label' => __('Subtotal'),
                'value' => $quote->getSubtotal(),
                'strong' => false,
            ]
        ];

        if (!$quote->isVirtual()) {
            $totals[] = [
                'code' => 'shipping',
                'label' => __('Shipping'),
                'value' => $shippingAddress->getShippingAmount(),
                'strong' => false,
            ];
        }

        $discount = (float)$shippingAddress->getDiscountAmount();
        if ($discount != 0.0) {
            $totals[] = [
                'code' => 'discount',
                'label' => __('Discount'),
                'value' => $discount,
                'strong' => false,
            ];
        }

        $totals[] = [
            'code' => 'tax',
            'label' => __('Tax'),
            'value' => $shippingAddress->getTaxAmount(),
            'strong' => false,
        ];

        $totals[] = [
            'code' => 'grand_total',
            'label' => __('Order Total'),
            'value' => $quote->getGrandTotal(),
            'strong' => true,
        ];

        return $totals;
    }

    /**
     * @return string
     */
    public function getCartUrl()
    {
        return $this->getUrl('checkout/cart');
    }
}
