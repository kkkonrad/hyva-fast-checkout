<?php

namespace Kkkonrad\Fastcheckout\Block\Hyva;

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\HyvaCsp;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Kkkonrad\Fastcheckout\Helper\Data as OpcHelper;
use Kkkonrad\Fastcheckout\Model\Hyva\RequireJsAssets;


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
     * @var ViewModelRegistry
     */
    private $viewModelRegistry;

    /**
     * @var Quote|null
     */
    private $quote;

    /**
     * @var CompositeConfigProvider|null
     */
    private $configProvider;

    /**
     * @var ModuleListInterface|null
     */
    private $moduleList;

    /**
     * @var ComponentRegistrarInterface|null
     */
    private $componentRegistrar;

    /**
     * @var ResolverInterface|null
     */
    private $localeResolver;

    /**
     * @var ObjectManagerInterface|null
     */
    private $objectManager;

    /**
     * @var OpcHelper
     */
    private $opcHelper;


    /**
     * @param Context $context
     * @param CheckoutSession $checkoutSession
     * @param PricingHelper $pricingHelper
     * @param ImageHelper $imageHelper
     * @param ProductConfiguration $productConfiguration
     * @param ViewModelRegistry $viewModelRegistry
     * @param CompositeConfigProvider|array|null $configProvider
     * @param ModuleListInterface|null $moduleList
     * @param ComponentRegistrarInterface|null $componentRegistrar
     * @param ResolverInterface|null $localeResolver
     * @param array $data
     */
    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        PricingHelper $pricingHelper,
        ImageHelper $imageHelper,
        ProductConfiguration $productConfiguration,
        ViewModelRegistry $viewModelRegistry,
        OpcHelper $opcHelper,
        $configProvider = null,
        ModuleListInterface $moduleList = null,
        ComponentRegistrarInterface $componentRegistrar = null,
        ResolverInterface $localeResolver = null,
        array $data = []
    ) {
        if (is_array($configProvider)) {
            $data = $configProvider;
            $configProvider = null;
        }

        $this->checkoutSession = $checkoutSession;
        $this->pricingHelper = $pricingHelper;
        $this->imageHelper = $imageHelper;
        $this->productConfiguration = $productConfiguration;
        $this->viewModelRegistry = $viewModelRegistry;
        $this->opcHelper = $opcHelper;
        $this->configProvider = $configProvider instanceof CompositeConfigProvider ? $configProvider : null;
        $this->moduleList = $moduleList;
        $this->componentRegistrar = $componentRegistrar;
        $this->localeResolver = $localeResolver;

        parent::__construct($context, $data);
    }

    /**
     * @return bool
     */
    public function isShowComment(): bool
    {
        return $this->opcHelper->isShowComment();
    }

    /**
     * @return bool
     */
    public function isShowGiftMessage(): bool
    {
        return $this->opcHelper->isShowGiftMessage();
    }

    /**
     * @return HyvaCsp
     */
    public function getHyvaCsp(): HyvaCsp
    {
        return $this->viewModelRegistry->require(HyvaCsp::class);
    }

    /**
     * @return bool
     */
    public function ensureRequireJsAssets()
    {
        try {
            return $this->getObjectManager()->get(RequireJsAssets::class)->ensure($this->getQuote()->getStoreId());
        } catch (\Throwable $exception) {
            return false;
        }
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

    public function getCheckoutConfig()
    {
        $quote = $this->getQuote();
        if (!$quote || !$quote->getId() || !$quote->hasItems()) {
            return [];
        }

        $configProvider = $this->getConfigProvider();
        if ($configProvider === null) {
            return [];
        }

        try {
            return $configProvider->getConfig();
        } catch (\Throwable $exception) {
            return [];
        }
    }

    /**
     * @return string
     */
    public function getLocaleCode()
    {
        $localeResolver = $this->getLocaleResolver();

        return $localeResolver ? (string)$localeResolver->getLocale() : 'en_US';
    }

    /**
     * Return payment renderer registration components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getPaymentRendererComponents()
    {
        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            return [];
        }

        $components = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $components = array_merge($components, $this->getPaymentRendererComponentsFromLayout($layoutFile));
        }

        return array_values(array_unique($components));
    }

    /**
     * @param string $layoutFile
     * @return string[]
     */
    private function getPaymentRendererComponentsFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="renders"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"]' .
                '/*[local-name()="item"][@name="component"]'
            );

            $components = [];
            foreach ($nodes as $node) {
                $component = trim($node->textContent);
                if ($component !== '') {
                    $components[] = $component;
                }
            }

            return $components;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @return CompositeConfigProvider|null
     */
    private function getConfigProvider()
    {
        if ($this->configProvider instanceof CompositeConfigProvider) {
            return $this->configProvider;
        }

        try {
            $configProvider = $this->getObjectManager()->get(CompositeConfigProvider::class);
            $this->configProvider = $configProvider instanceof CompositeConfigProvider ? $configProvider : null;
        } catch (\Throwable $exception) {
            $this->configProvider = null;
        }

        return $this->configProvider;
    }

    /**
     * @return ModuleListInterface|null
     */
    private function getModuleList()
    {
        if ($this->moduleList instanceof ModuleListInterface) {
            return $this->moduleList;
        }

        try {
            $moduleList = $this->getObjectManager()->get(ModuleListInterface::class);
            $this->moduleList = $moduleList instanceof ModuleListInterface ? $moduleList : null;
        } catch (\Throwable $exception) {
            $this->moduleList = null;
        }

        return $this->moduleList;
    }

    /**
     * @return ComponentRegistrarInterface|null
     */
    private function getComponentRegistrar()
    {
        if ($this->componentRegistrar instanceof ComponentRegistrarInterface) {
            return $this->componentRegistrar;
        }

        try {
            $componentRegistrar = $this->getObjectManager()->get(ComponentRegistrarInterface::class);
            $this->componentRegistrar = $componentRegistrar instanceof ComponentRegistrarInterface
                ? $componentRegistrar
                : null;
        } catch (\Throwable $exception) {
            $this->componentRegistrar = null;
        }

        return $this->componentRegistrar;
    }

    /**
     * @return ResolverInterface|null
     */
    private function getLocaleResolver()
    {
        if ($this->localeResolver instanceof ResolverInterface) {
            return $this->localeResolver;
        }

        try {
            $localeResolver = $this->getObjectManager()->get(ResolverInterface::class);
            $this->localeResolver = $localeResolver instanceof ResolverInterface ? $localeResolver : null;
        } catch (\Throwable $exception) {
            $this->localeResolver = null;
        }

        return $this->localeResolver;
    }

    /**
     * @return ObjectManagerInterface
     */
    private function getObjectManager()
    {
        if ($this->objectManager === null) {
            $this->objectManager = \Magento\Framework\App\ObjectManager::getInstance();
        }

        return $this->objectManager;
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
     * @return int
     */
    public function getItemImageWidth(Item $item)
    {
        return (int) $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getWidth() ?: 56;
    }

    /**
     * @param Item $item
     * @return int
     */
    public function getItemImageHeight(Item $item)
    {
        return (int) $this->imageHelper
            ->init($item->getProduct(), 'cart_page_product_thumbnail')
            ->getHeight() ?: 56;
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
