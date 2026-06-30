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
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
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
     * @var array|null
     */
    private $checkoutConfigCache;

    /**
     * @var string[]|null
     */
    private $paymentRendererComponentsCache;

    /**
     * @var array|null
     */
    private $checkoutLayoutAssetsCache;

    /**
     * @var array|null
     */
    private $checkoutLayoutScriptsCache;

    /**
     * @var array|null
     */
    private $summaryTotalsCache;

    /**
     * @var Helper
     */
    private $helper;


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
        Helper $helper,
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
        $this->helper = $helper;
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
        return $this->helper->isShowComment();
    }

    /**
     * @return bool
     */
    public function isShowGiftMessage(): bool
    {
        return $this->helper->isShowGiftMessage();
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
        if ($this->checkoutConfigCache !== null) {
            return $this->checkoutConfigCache;
        }

        $quote = $this->getQuote();
        if (!$quote || !$quote->getId() || !$quote->hasItems()) {
            $this->checkoutConfigCache = [];
            return $this->checkoutConfigCache;
        }

        $configProvider = $this->getConfigProvider();
        if ($configProvider === null) {
            $this->checkoutConfigCache = [];
            return $this->checkoutConfigCache;
        }

        try {
            $this->checkoutConfigCache = $configProvider->getConfig();
        } catch (\Throwable $exception) {
            $this->checkoutConfigCache = [];
        }

        return $this->checkoutConfigCache;
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
        if ($this->paymentRendererComponentsCache !== null) {
            return $this->paymentRendererComponentsCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->paymentRendererComponentsCache = [];
            return $this->paymentRendererComponentsCache;
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

        $this->paymentRendererComponentsCache = array_values(array_unique($components));

        return $this->paymentRendererComponentsCache;
    }

    /**
     * Return custom layout assets declared in the standard Magento checkout layout (checkout_index_index.xml)
     * of active modules.
     *
     * @return array
     */
    public function getCheckoutLayoutAssets()
    {
        if ($this->checkoutLayoutAssetsCache !== null) {
            return $this->checkoutLayoutAssetsCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->checkoutLayoutAssetsCache = ['css' => [], 'scripts' => []];
            return $this->checkoutLayoutAssetsCache;
        }

        $css = [];
        $scripts = [];

        foreach ($moduleList->getNames() as $moduleName) {
            if ($moduleName === 'Kkkonrad_Fastcheckout') {
                continue;
            }

            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $dom = new \DOMDocument();
            $previous = libxml_use_internal_errors(true);

            try {
                if ($dom->load($layoutFile)) {
                    $xpath = new \DOMXPath($dom);

                    // Find all <css> elements
                    $cssNodes = $xpath->query('//head/css');
                    foreach ($cssNodes as $node) {
                        $src = $node->getAttribute('src');
                        if ($src) {
                            $srcType = $node->getAttribute('src_type');
                            $css[] = [
                                'src' => $src,
                                'src_type' => $srcType ?: null
                            ];
                        }
                    }

                    // Find all <script> elements
                    $scriptNodes = $xpath->query('//head/script');
                    foreach ($scriptNodes as $node) {
                        $src = $node->getAttribute('src');
                        if ($src) {
                            $scripts[] = $src;
                        }
                    }
                }
            } catch (\Exception $e) {
                // Ignore parsing errors
            } finally {
                libxml_clear_errors();
                libxml_use_internal_errors($previous);
            }
        }

        $this->checkoutLayoutAssetsCache = [
            'css' => array_values(array_unique($css, SORT_REGULAR)),
            'scripts' => array_values(array_unique($scripts))
        ];

        return $this->checkoutLayoutAssetsCache;
    }

    /**
     * @return array
     */
    public function getCheckoutLayoutScripts()
    {
        if ($this->checkoutLayoutScriptsCache !== null) {
            return $this->checkoutLayoutScriptsCache;
        }

        $assets = $this->getCheckoutLayoutAssets();
        $requireModules = [];
        $externalScripts = [];

        foreach ($assets['scripts'] as $scriptSrc) {
            if (strpos($scriptSrc, 'http://') === 0 || strpos($scriptSrc, 'https://') === 0 || strpos($scriptSrc, '//') === 0) {
                $externalScripts[] = $scriptSrc;
            } else {
                $clean = $scriptSrc;
                if (substr($clean, -3) === '.js') {
                    $clean = substr($clean, 0, -3);
                }
                $clean = str_replace('::', '/', $clean);
                $requireModules[] = $clean;
            }
        }

        $this->checkoutLayoutScriptsCache = [
            'modules' => $requireModules,
            'external' => $externalScripts
        ];

        return $this->checkoutLayoutScriptsCache;
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
                $parent = $node->parentNode;
                if ($parent) {
                    $methodCode = $parent->getAttribute('name');
                    $isActive = true;
                    if ($methodCode && $this->_scopeConfig->getValue('payment/' . $methodCode . '/active') === '0') {
                        $isActive = false;
                    } elseif ($methodCode) {
                        $methodsNodes = $xpath->query('./*[local-name()="item"][@name="methods"]/*[local-name()="item"]', $parent);
                        if ($methodsNodes->length > 0) {
                            $hasActiveSubmethod = false;
                            foreach ($methodsNodes as $methodItem) {
                                $code = $methodItem->getAttribute('name');
                                if ($code && $this->_scopeConfig->getValue('payment/' . $code . '/active') !== '0') {
                                    $hasActiveSubmethod = true;
                                    break;
                                }
                            }
                            if (!$hasActiveSubmethod) {
                                $isActive = false;
                            }
                        }
                    }

                    if ($isActive) {
                        $component = trim($node->textContent);
                        if ($component !== '') {
                            $components[] = $component;
                        }
                    }
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
        return $this->pricingHelper->currency((float)$amount, true, false);
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
        if ($this->displayCartPriceInclTax()) {
            $rowTotal = $item->getRowTotalInclTax();
        } else {
            $rowTotal = $item->getRowTotal();
        }

        if ($rowTotal === null) {
            $rowTotal = $item->getRowTotal() ?: $item->getRowTotalInclTax();
        }

        return (float) $rowTotal;
    }

    /**
     * Get summary totals dynamically collected, sorted, and translated based on store configuration
     *
     * @return array
     */
    public function getSummaryTotals()
    {
        if ($this->summaryTotalsCache !== null) {
            return $this->summaryTotalsCache;
        }

        $quote = $this->getQuote();
        if (!$quote->getTotalsCollectedFlag()) {
            $quote->collectTotals();
        }
        
        $totals = [];
        foreach ($quote->getTotals() as $code => $total) {
            $value = (float)$total->getValue();
            
            // Skip zero values for optional segments (like tax, discount, fees),
            // but always show subtotal and grand total even if zero.
            if ($value == 0.0 && !in_array($code, ['subtotal', 'grand_total'])) {
                continue;
            }
            
            $totals[] = [
                'code' => $code,
                'label' => $total->getTitle(),
                'value' => $value,
                'strong' => ($total->getArea() === 'footer' || $code === 'grand_total'),
            ];
        }
        
        $this->summaryTotalsCache = $totals;

        return $this->summaryTotalsCache;
    }

    /**
     * @return string
     */
    public function getCartUrl()
    {
        return $this->getUrl('checkout/cart');
    }

    /**
     * @var \Magento\Customer\Helper\Address|null
     */
    private $addressHelper;

    /**
     * @return \Magento\Customer\Helper\Address
     */
    public function getAddressHelper()
    {
        if ($this->addressHelper === null) {
            $this->addressHelper = $this->getObjectManager()->get(\Magento\Customer\Helper\Address::class);
        }
        return $this->addressHelper;
    }

    /**
     * @return int
     */
    public function getStreetLines(): int
    {
        return (int)$this->getAddressHelper()->getStreetLines();
    }

    /**
     * @param string $attributeCode
     * @return bool
     */
    public function isAttributeVisible(string $attributeCode): bool
    {
        if ($attributeCode === 'vat_id') {
            $taxvatShow = $this->_scopeConfig->getValue(
                'customer/address/taxvat_show',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($taxvatShow === 'req' || $taxvatShow === 'opt') {
                return true;
            }
            return (bool)$this->getAddressHelper()->isVatAttributeVisible();
        }
        return $this->getAddressHelper()->isAttributeVisible($attributeCode);
    }

    /**
     * @param string $attributeCode
     * @return bool
     */
    public function isAttributeRequired(string $attributeCode): bool
    {
        if ($attributeCode === 'vat_id') {
            $taxvatShow = $this->_scopeConfig->getValue(
                'customer/address/taxvat_show',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($taxvatShow === 'req') {
                return true;
            }
        }
        $validationClass = $this->getAddressHelper()->getAttributeValidationClass($attributeCode);
        return strpos((string)$validationClass, 'required-entry') !== false;
    }

    /**
     * @param string $attributeCode
     * @return array|null
     */
    public function getOptions(string $attributeCode): ?array
    {
        $optionsStr = $this->_scopeConfig->getValue(
            'customer/address/' . $attributeCode . '_options',
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
        if (empty($optionsStr)) {
            return null;
        }
        $options = [];
        foreach (explode(';', $optionsStr) as $option) {
            $option = trim($option);
            if ($option !== '') {
                $options[] = [
                    'value' => $option,
                    'label' => __($option)
                ];
            }
        }
        return $options;
    }

    /**
     * @var \Magento\Tax\Helper\Data|null
     */
    private $taxHelper;

    /**
     * @return \Magento\Tax\Helper\Data
     */
    public function getTaxHelper()
    {
        if ($this->taxHelper === null) {
            $this->taxHelper = $this->getObjectManager()->get(\Magento\Tax\Helper\Data::class);
        }
        return $this->taxHelper;
    }

    /**
     * @return bool
     */
    public function displayCartBothPrices(): bool
    {
        return (bool)$this->getTaxHelper()->displayCartBothPrices();
    }

    /**
     * @return bool
     */
    public function displayCartPriceInclTax(): bool
    {
        return (bool)$this->getTaxHelper()->displayCartPriceInclTax();
    }
}
