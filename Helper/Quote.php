<?php

namespace IWD\Opc\Helper;

use Magento\Framework\App\Helper\Context;
use Magento\Framework\App\Helper\AbstractHelper;
use Magento\Checkout\Model\Cart;
use Magento\Tax\Model\Config as TaxConfig;
use Magento\Catalog\Api\ProductRepositoryInterfaceFactory;
use Magento\Catalog\Helper\ImageFactory;
use Magento\Directory\Model\Currency;
use Magento\Framework\View\Element\BlockFactory;
use Magento\Store\Model\App\Emulation;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\Exception\NoSuchEntityException;

class Quote extends AbstractHelper
{
    /**
     * @var Cart
     */
    public $cart;

    /**
     * @var TaxConfig
     */
    public $taxConfig;

    /**
     * @var ProductRepositoryInterfaceFactory
     */
    public $productRepository;

    /**
     * @var ImageFactory
     */
    public $productImageHelper;

    /**
     * @var Currency
     */
    public $currency;

    /**
     * @var StoreManagerInterface
     */
    protected $storeManager;

    /**
     * @var Emulation
     */
    protected $appEmulation;

    /**
     * @var BlockFactory
     */
    protected $blockFactory;

    /**
     * Quote constructor.
     * @param Context $context
     * @param Cart $cart
     * @param TaxConfig $taxConfig
     * @param ProductRepositoryInterfaceFactory $productRepository
     * @param ImageFactory $productImageHelper
     * @param Currency $currency
     * @param StoreManagerInterface $storeManager
     * @param BlockFactory $blockFactory
     * @param Emulation $appEmulation
     */
    public function __construct(
        Context $context,
        Cart $cart,
        TaxConfig $taxConfig,
        ProductRepositoryInterfaceFactory $productRepository,
        ImageFactory $productImageHelper,
        Currency $currency,
        StoreManagerInterface $storeManager,
        BlockFactory $blockFactory,
        Emulation $appEmulation
    ) {
        parent::__construct($context);
        $this->cart = $cart;
        $this->taxConfig = $taxConfig;
        $this->productRepository = $productRepository;
        $this->productImageHelper = $productImageHelper;
        $this->currency = $currency;
        $this->storeManager = $storeManager;
        $this->blockFactory = $blockFactory;
        $this->appEmulation = $appEmulation;
    }

    public function getCart() {
        $quote = $this->cart->getQuote();
        $quoteShippingAddress = $quote->getShippingAddress();

        if(is_null($quote) || is_null($quote->getEntityId())) return [];

        return [
            'baseCurrencyCode' => $quote->getBaseCurrencyCode(),
            'couponCode' => !empty($quote->getCouponCode()) ? $quote->getCouponCode() : '',
            'currencyCode' => $quote->getQuoteCurrencyCode(),
            'discount' => $this->priceFormat(abs($quoteShippingAddress->getDiscountAmount())),
            'grandTotal' => $this->priceFormat($quote->getBaseGrandTotal()),
            'isVirtual' => $quote->getIsVirtual(),
            'items' => $this->getItems($quote),
            'quoteGrandTotal' => $this->priceFormat($quote->getGrandTotal()),
            'shipping' => $this->priceFormat($this->getShippingAmount($quote)),
            'subtotal' => $this->priceFormat($this->getSubtotal($quote)),
            'tax' => $this->priceFormat($quoteShippingAddress->getTaxAmount()),
        ];
    }

    /**
     * @param $quote
     * @return mixed
     */
    protected function getShippingAmount($quote)
    {
        $quoteShippingAddress = $quote->getShippingAddress();

        if ($this->taxConfig->displayCartShippingInclTax($quote->getStoreId())
            || $this->taxConfig->displayCartShippingBoth($quote->getStoreId())) {
            return $quoteShippingAddress->getShippingInclTax();
        }

        return $quoteShippingAddress->getShippingAmount();
    }

    /**
     * @param $quote
     * @return mixed
     */
    protected function getSubtotal($quote)
    {
        if ($this->taxConfig->displayCartSubtotalInclTax($quote->getStoreId())
            || $this->taxConfig->displayCartSubtotalBoth($quote->getStoreId())) {
            return $quote->getShippingAddress()->getSubtotalInclTax();
        }

        return $quote->getSubtotal();
    }

    /**
     * @param $price
     * @return string
     */
    protected function priceFormat($price)
    {
        return number_format($price, 2, '.', '');
    }

    /**
     * @param $item
     * @return mixed
     */
    protected function getItemPrice($item)
    {
        if ($this->taxConfig->displayCartPricesInclTax($item->getStoreId())
            || $this->taxConfig->displayCartPricesBoth($item->getStoreId())) {
            return $item->getPriceInclTax();
        }

        return $item->getConvertedPrice();
    }

    /**
     * @param $product
     * @param string $imageType
     * @return mixed
     * @throws NoSuchEntityException
     */
    protected function getImageUrl($product, $imageType = '')
    {
        $storeId = $this->storeManager->getStore()->getId();
        $this->appEmulation->startEnvironmentEmulation($storeId, \Magento\Framework\App\Area::AREA_FRONTEND, true);
        $imageBlock = $this->blockFactory->createBlock('Magento\Catalog\Block\Product\ListProduct');
        $productImage = $imageBlock->getImage($product, $imageType);
        $imageUrl = $productImage->getImageUrl();
        $this->appEmulation->stopEnvironmentEmulation();

        return $imageUrl;
    }

    /**
     * @param $quote
     * @return array
     */
    public function getItems($quote)
    {
        $data = [];
        $this->currency->load($quote->getQuoteCurrencyCode());

        foreach ($quote->getAllVisibleItems() as $index => $item) {
            $productData = $this->productRepository->create()->getById($item->getProductId());

            try {
                $imageUrl = $this->getImageUrl($productData, 'product_page_image_medium');
            } catch (\Exception $e) {
                $imageUrl = $this->productImageHelper->create()->init($productData, 'product_thumbnail_image')
                    ->setImageFile($productData->getThumbnail())->getUrl();
            }

            $data[] = [
                "name"    => $item->getName(),
                "sku"     => $item->getSku(),
                "price"   => $this->priceFormat($this->getItemPrice($item)),
                "qty"     => $item->getQty(),
                "item_id" => $item->getProductId(),
                "type"    => $item->getProductType(),
                "image"   => $imageUrl,
                "options" => $this->getOptions($item),
            ];
        }

        return $data;
    }

    public function getOptions($item)
    {
        $product_options = [];
        $options = $item->getProduct()->getTypeInstance(true)->getOrderOptions($item->getProduct());

        if ($this->taxConfig->displayCartPricesBoth($item->getStoreId())) {
            $product_options[] = [
                'label' => 'text.excl_tax',
                'value' => $this->currency->format($item->getConvertedPrice(), [], false)
            ];
        }

        if (!empty($options['attributes_info'])) {
            foreach ($options['attributes_info'] as $option) {
                $product_options[] = [
                    'label' => $option['label'],
                    'value' => $option['value'],
                ];
            }
        }

        if (!empty($options['bundle_options'])) {
            foreach ($options['bundle_options'] as $option) {
                $value = '';

                foreach ($option['value'] as $item) {
                    $value .= '(' . $item['qty'] . ') ' . $item['title'] . ' ' . $this->currency->format($item['price'], [], false);
                }

                $product_options[] = [
                    'label' => $option['label'],
                    'value' => $value,
                ];
            }
        }

        return $product_options;
    }
}
