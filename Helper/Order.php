<?php

namespace IWD\Opc\Helper;

use Magento\Framework\App\Helper\Context;
use Magento\Framework\App\Helper\AbstractHelper;
use Magento\Tax\Model\Config as TaxConfig;
use Magento\Catalog\Api\ProductRepositoryInterfaceFactory;
use Magento\Catalog\Helper\ImageFactory;
use Magento\Directory\Model\Currency;
use Magento\Framework\View\Element\BlockFactory;
use Magento\Store\Model\App\Emulation;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\Exception\NoSuchEntityException;

class Order extends AbstractHelper
{
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
     * Order constructor.
     * @param Context $context
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
        TaxConfig $taxConfig,
        ProductRepositoryInterfaceFactory $productRepository,
        ImageFactory $productImageHelper,
        Currency $currency,
        StoreManagerInterface $storeManager,
        BlockFactory $blockFactory,
        Emulation $appEmulation
    ) {
        parent::__construct($context);
        $this->taxConfig = $taxConfig;
        $this->productRepository = $productRepository;
        $this->productImageHelper = $productImageHelper;
        $this->currency = $currency;
        $this->storeManager = $storeManager;
        $this->blockFactory = $blockFactory;
        $this->appEmulation = $appEmulation;
    }

    public function getOrderDetailsForGa4($order) {
        return [
            'order_increment_id' => $order->getIncrementId(),
            'currency' => $order->getOrderCurrencyCode(),
            'value' => $this->priceFormat($order->getGrandTotal()),
            'tax' => $this->priceFormat($order->getTaxAmount()),
            'shipping' => $this->priceFormat($order->getShippingAmount()),
            'coupon' => !empty($order->getCouponCode()) ? $order->getCouponCode() : '',
            'items' => $this->getItems($order),
        ];
    }

    /**
     * @param $order
     * @return array
     */
    public function getItems($order)
    {
        $data = [];
        $this->currency->load($order->getOrderCurrencyCode());

        foreach ($order->getAllVisibleItems() as $index => $item) {
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
                "qty"     => $item->getQtyOrdered(),
                "item_id" => $item->getProductId(),
                "type"    => $item->getProductType(),
                "image"   => $imageUrl,
                "options" => $this->getOptions($item),
            ];
        }

        return $data;
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

        return $item->getPrice();
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
     * @param $item
     * @return array
     */
    public function getOptions($item)
    {
        $product_options = [];
        $options = $item->getProductOptions();

        if ($this->taxConfig->displayCartPricesBoth($item->getStoreId())) {
            $product_options[] = [
                'label' => 'text.excl_tax',
                'value' => $this->currency->format($item->getPrice(), [], false)
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
