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
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Model\Hyva\RequireJsAssets;
use Magento\Customer\Helper\Address as AddressHelper;
use Magento\Tax\Helper\Data as TaxHelper;


class Checkout extends Template
{
    private const CORE_SHIPPING_ADDRESS_FIELDSET_CHILDREN = [
        'city' => true,
        'company' => true,
        'country_id' => true,
        'fax' => true,
        'firstname' => true,
        'lastname' => true,
        'middlename' => true,
        'postcode' => true,
        'prefix' => true,
        'region' => true,
        'region_id' => true,
        'street' => true,
        'suffix' => true,
        'telephone' => true,
        'vat_id' => true
    ];

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
    private $paymentRendererComponentMapCache;

    /**
     * @var string[]|null
     */
    private $shippingRatesValidationComponentsCache;

    /**
     * @var string[]|null
     */
    private $paymentValidationComponentsCache;

    /**
     * @var array|null
     */
    private $paymentListChildrenCache;

    /**
     * @var array|null
     */
    private $paymentRegionChildrenCache;

    /**
     * @var array|null
     */
    private $shippingListChildrenCache;

    /**
     * @var array|null
     */
    private $shippingAddressChildrenCache;

    /**
     * @var array|null
     */
    private $checkoutStepChildrenCache;

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

    /** @var RequireJsAssets|null */
    private $requireJsAssets;

    /** @var AddressHelper|null */
    private $addressHelper;

    /** @var TaxHelper|null */
    private $taxHelper;


    /**
     * @param Context $context
     * @param CheckoutSession $checkoutSession
     * @param PricingHelper $pricingHelper
     * @param ImageHelper $imageHelper
     * @param ProductConfiguration $productConfiguration
     * @param ViewModelRegistry $viewModelRegistry
     * @param CompositeConfigProvider|null $configProvider
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
        ?CompositeConfigProvider $configProvider = null,
        ModuleListInterface $moduleList = null,
        ComponentRegistrarInterface $componentRegistrar = null,
        ResolverInterface $localeResolver = null,
        array $data = [],
        RequireJsAssets $requireJsAssets = null,
        AddressHelper $addressHelper = null,
        TaxHelper $taxHelper = null
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->pricingHelper = $pricingHelper;
        $this->imageHelper = $imageHelper;
        $this->productConfiguration = $productConfiguration;
        $this->viewModelRegistry = $viewModelRegistry;
        $this->helper = $helper;
        $this->configProvider = $configProvider;
        $this->moduleList = $moduleList;
        $this->componentRegistrar = $componentRegistrar;
        $this->localeResolver = $localeResolver;
        $this->requireJsAssets = $requireJsAssets;
        $this->addressHelper = $addressHelper;
        $this->taxHelper = $taxHelper;

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
        if ($this->requireJsAssets === null) {
            return false;
        }

        try {
            return $this->requireJsAssets->ensure();
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
     * Return payment renderer components indexed by payment method code.
     *
     * @return array[]
     */
    public function getPaymentRendererComponentMap()
    {
        if ($this->paymentRendererComponentMapCache !== null) {
            return $this->paymentRendererComponentMapCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->paymentRendererComponentMapCache = [];
            return $this->paymentRendererComponentMapCache;
        }

        $map = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $map = array_merge($map, $this->getPaymentRendererComponentMapFromLayout($layoutFile));
        }

        $unique = [];
        foreach ($map as $entry) {
            if (empty($entry['method']) || empty($entry['component'])) {
                continue;
            }

            $unique[$entry['method'] . '::' . $entry['component']] = [
                'method' => $entry['method'],
                'component' => $entry['component']
            ];
        }

        $this->paymentRendererComponentMapCache = array_values($unique);

        return $this->paymentRendererComponentMapCache;
    }

    /**
     * Return shipping rates validation components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getShippingRatesValidationComponents()
    {
        if ($this->shippingRatesValidationComponentsCache !== null) {
            return $this->shippingRatesValidationComponentsCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->shippingRatesValidationComponentsCache = [];
            return $this->shippingRatesValidationComponentsCache;
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

            $components = array_merge($components, $this->getShippingRatesValidationComponentsFromLayout($layoutFile));
        }

        $this->shippingRatesValidationComponentsCache = array_values(array_unique($components));

        return $this->shippingRatesValidationComponentsCache;
    }

    /**
     * Return payment validator registration components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getPaymentValidationComponents()
    {
        if ($this->paymentValidationComponentsCache !== null) {
            return $this->paymentValidationComponentsCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->paymentValidationComponentsCache = [];
            return $this->paymentValidationComponentsCache;
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

            $components = array_merge($components, $this->getPaymentValidationComponentsFromLayout($layoutFile));
        }

        $this->paymentValidationComponentsCache = array_values(array_unique($components));

        return $this->paymentValidationComponentsCache;
    }

    /**
     * Return child UI components declared under the standard Magento payment list.
     *
     * @return array
     */
    public function getPaymentListChildren()
    {
        if ($this->paymentListChildrenCache !== null) {
            return $this->paymentListChildrenCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->paymentListChildrenCache = [];
            return $this->paymentListChildrenCache;
        }

        $children = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $children = $this->mergeJsLayoutArrays(
                $children,
                $this->getPaymentListChildrenFromLayout($layoutFile)
            );
        }

        $this->paymentListChildrenCache = $children;

        return $this->paymentListChildrenCache;
    }

    /**
     * Return direct children declared under the standard Magento payment component
     * for regions used outside the payment renderer list.
     *
     * @return array
     */
    public function getPaymentRegionChildren()
    {
        if ($this->paymentRegionChildrenCache !== null) {
            return $this->paymentRegionChildrenCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->paymentRegionChildrenCache = [];
            return $this->paymentRegionChildrenCache;
        }

        $children = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $children = $this->mergeJsLayoutArrays(
                $children,
                $this->getPaymentRegionChildrenFromLayout($layoutFile)
            );
        }

        $this->paymentRegionChildrenCache = $children;

        return $this->paymentRegionChildrenCache;
    }

    /**
     * Return child UI components used by the standard Magento shipping method view.
     *
     * @return array
     */
    public function getShippingListChildren()
    {
        if ($this->shippingListChildrenCache !== null) {
            return $this->shippingListChildrenCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->shippingListChildrenCache = [];
            return $this->shippingListChildrenCache;
        }

        $children = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $children = $this->mergeJsLayoutArrays(
                $children,
                $this->getShippingListChildrenFromLayout($layoutFile)
            );
        }

        $this->shippingListChildrenCache = $children;

        return $this->shippingListChildrenCache;
    }

    /**
     * Return non-fieldset child UI components used by the standard Magento shipping address view.
     *
     * @return array
     */
    public function getShippingAddressChildren()
    {
        if ($this->shippingAddressChildrenCache !== null) {
            return $this->shippingAddressChildrenCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->shippingAddressChildrenCache = [];
            return $this->shippingAddressChildrenCache;
        }

        $children = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $children = $this->mergeJsLayoutArrays(
                $children,
                $this->getShippingAddressChildrenFromLayout($layoutFile)
            );
        }

        $this->shippingAddressChildrenCache = $children;

        return $this->shippingAddressChildrenCache;
    }

    /**
     * Return additional direct children declared under the standard Magento checkout steps component.
     *
     * The shipping-step and billing-step are handled by dedicated Fastcheckout bridges because their
     * core regions are mapped into the custom Hyva/Magewire UI. Other step children, such as MSI
     * Store Pickup, are kept as native KO components so their registry entries and side effects stay
     * compatible with standard checkout modules.
     *
     * @return array
     */
    public function getCheckoutStepChildren()
    {
        if ($this->checkoutStepChildrenCache !== null) {
            return $this->checkoutStepChildrenCache;
        }

        $moduleList = $this->getModuleList();
        $componentRegistrar = $this->getComponentRegistrar();
        if ($moduleList === null || $componentRegistrar === null) {
            $this->checkoutStepChildrenCache = [];
            return $this->checkoutStepChildrenCache;
        }

        $children = [];
        foreach ($moduleList->getNames() as $moduleName) {
            $modulePath = $componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            if (!$modulePath) {
                continue;
            }

            $layoutFile = $modulePath . '/view/frontend/layout/checkout_index_index.xml';
            if (!is_file($layoutFile)) {
                continue;
            }

            $children = $this->mergeJsLayoutArrays(
                $children,
                $this->getCheckoutStepChildrenFromLayout($layoutFile)
            );
        }

        $this->checkoutStepChildrenCache = $children;

        return $this->checkoutStepChildrenCache;
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
     * @param string $layoutFile
     * @return array[]
     */
    private function getPaymentRendererComponentMapFromLayout($layoutFile)
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
                '/*[local-name()="item"]'
            );

            $map = [];
            foreach ($nodes as $rendererNode) {
                $rendererCode = $rendererNode->getAttribute('name');
                $componentNodes = $xpath->query('./*[local-name()="item"][@name="component"]', $rendererNode);
                if ($componentNodes->length === 0) {
                    continue;
                }

                $component = trim($componentNodes->item(0)->textContent);
                if ($component === '' || $component === 'uiComponent') {
                    continue;
                }

                if ($rendererCode && $this->_scopeConfig->getValue('payment/' . $rendererCode . '/active') === '0') {
                    continue;
                }

                if ($rendererCode) {
                    $map[] = [
                        'method' => $rendererCode,
                        'component' => $component
                    ];
                }

                $methodNodes = $xpath->query('./*[local-name()="item"][@name="methods"]/*[local-name()="item"]', $rendererNode);
                if ($methodNodes->length === 0) {
                    continue;
                }

                foreach ($methodNodes as $methodNode) {
                    $methodCode = $methodNode->getAttribute('name');
                    if ($methodCode && $this->_scopeConfig->getValue('payment/' . $methodCode . '/active') !== '0') {
                        $map[] = [
                            'method' => $methodCode,
                            'component' => $component
                        ];
                    }
                }
            }

            return $map;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param string $layoutFile
     * @return string[]
     */
    private function getShippingRatesValidationComponentsFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="shipping-rates-validation"]' .
                '//*[local-name()="item"][@name="component"]'
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
     * @param string $layoutFile
     * @return string[]
     */
    private function getPaymentValidationComponentsFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="additional-payment-validators"]' .
                '//*[local-name()="item"][@name="component"]'
            );

            $components = [];
            foreach ($nodes as $node) {
                $component = trim($node->textContent);
                if ($component !== '' && $component !== 'uiComponent') {
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
     * @param string $layoutFile
     * @return array
     */
    private function getPaymentListChildrenFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="payment"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"][@name="payments-list"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"]'
            );

            $children = [];
            foreach ($nodes as $node) {
                $name = $node->getAttribute('name');
                if (!$name) {
                    continue;
                }

                $children[$name] = $this->mergeJsLayoutArrays(
                    $children[$name] ?? [],
                    $this->parseJsLayoutItem($node)
                );
            }

            return $children;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param string $layoutFile
     * @return array
     */
    private function getPaymentRegionChildrenFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="payment"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"][@name="place-order-captcha" or @name="beforeMethods" or @name="afterMethods"]'
            );

            $children = [];
            foreach ($nodes as $node) {
                $name = $node->getAttribute('name');
                if (!$name) {
                    continue;
                }

                $children[$name] = $this->mergeJsLayoutArrays(
                    $children[$name] ?? [],
                    $this->parseJsLayoutItem($node)
                );
            }

            return $children;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param string $layoutFile
     * @return array
     */
    private function getShippingListChildrenFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="shippingAddress"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"][@name="before-shipping-method-form" or @name="shippingAdditional"]'
            );

            $children = [];
            foreach ($nodes as $node) {
                $name = $node->getAttribute('name');
                if (!$name) {
                    continue;
                }

                $children[$name] = $this->mergeJsLayoutArrays(
                    $children[$name] ?? [],
                    $this->parseJsLayoutItem($node)
                );
            }

            return $children;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param string $layoutFile
     * @return array
     */
    private function getShippingAddressChildrenFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="shippingAddress"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"][' .
                '@name="before-form" or ' .
                '@name="before-fields" or ' .
                '@name="address-list-additional-addresses" or ' .
                '@name="shipping-address-fieldset"' .
                ']'
            );

            $children = [];
            foreach ($nodes as $node) {
                $name = $node->getAttribute('name');
                if (!$name) {
                    continue;
                }

                $parsed = $this->parseJsLayoutItem($node);
                if ($name === 'shipping-address-fieldset') {
                    $parsed = $this->filterShippingAddressFieldset($parsed);
                    if (empty($parsed['children'])) {
                        continue;
                    }
                }

                $children[$name] = $this->mergeJsLayoutArrays(
                    $children[$name] ?? [],
                    $parsed
                );
            }

            return $children;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param string $layoutFile
     * @return array
     */
    private function getCheckoutStepChildrenFromLayout($layoutFile)
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);

        try {
            if (!$dom->load($layoutFile)) {
                return [];
            }

            $xpath = new \DOMXPath($dom);
            $nodes = $xpath->query(
                '//*[local-name()="item"][@name="steps"]' .
                '/*[local-name()="item"][@name="children"]' .
                '/*[local-name()="item"]'
            );

            $children = [];
            foreach ($nodes as $node) {
                $name = $node->getAttribute('name');
                if (!$name || $name === 'shipping-step' || $name === 'billing-step') {
                    continue;
                }

                $children[$name] = $this->mergeJsLayoutArrays(
                    $children[$name] ?? [],
                    $this->parseJsLayoutItem($node)
                );
            }

            return $children;
        } catch (\Exception $e) {
            return [];
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param mixed $fieldset
     * @return array
     */
    private function filterShippingAddressFieldset($fieldset)
    {
        if (!is_array($fieldset)) {
            return [];
        }

        $fieldset['component'] = $fieldset['component'] ?? 'uiComponent';
        $fieldset['displayArea'] = $fieldset['displayArea'] ?? 'additional-fieldsets';

        if (empty($fieldset['children']) || !is_array($fieldset['children'])) {
            $fieldset['children'] = [];
            return $fieldset;
        }

        foreach (array_keys($fieldset['children']) as $childName) {
            if (isset(self::CORE_SHIPPING_ADDRESS_FIELDSET_CHILDREN[$childName])) {
                unset($fieldset['children'][$childName]);
                continue;
            }

            if (is_array($fieldset['children'][$childName])) {
                $fieldset['children'][$childName] = $this->normalizeShippingAddressCustomField(
                    $childName,
                    $fieldset['children'][$childName]
                );
            }
        }

        return $fieldset;
    }

    /**
     * @param string $fieldName
     * @param array $field
     * @return array
     */
    private function normalizeShippingAddressCustomField($fieldName, array $field)
    {
        $field['provider'] = $field['provider'] ?? 'checkoutProvider';
        $field['dataScope'] = $field['dataScope'] ?? 'shippingAddress.custom_attributes.' . $fieldName;
        $field['customScope'] = $field['customScope'] ?? 'shippingAddress.custom_attributes';

        if (empty($field['config']) || !is_array($field['config'])) {
            $field['config'] = [];
        }

        $field['config']['template'] = $field['config']['template'] ?? 'ui/form/field';
        $field['config']['elementTmpl'] = $field['config']['elementTmpl'] ?? 'ui/form/element/input';

        return $field;
    }

    /**
     * @param \DOMElement $node
     * @return array|bool|string|null
     */
    private function parseJsLayoutItem(\DOMElement $node)
    {
        $type = $node->getAttribute('xsi:type');
        if (!$type && $node->hasAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')) {
            $type = $node->getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type');
        }

        if ($type === 'array') {
            $result = [];
            foreach ($node->childNodes as $child) {
                if (!$child instanceof \DOMElement || $child->localName !== 'item') {
                    continue;
                }

                $name = $child->getAttribute('name');
                if ($name === '') {
                    continue;
                }

                $result[$name] = $this->mergeJsLayoutArrays(
                    $result[$name] ?? [],
                    $this->parseJsLayoutItem($child)
                );
            }

            return $result;
        }

        $value = trim($node->textContent);
        if ($type === 'boolean') {
            return $value === 'true' || $value === '1';
        }
        if ($value === '') {
            return null;
        }

        return $value;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     * @return mixed
     */
    private function mergeJsLayoutArrays($left, $right)
    {
        if (!is_array($left) || !is_array($right)) {
            return $right;
        }

        foreach ($right as $key => $value) {
            if (array_key_exists($key, $left)) {
                $left[$key] = $this->mergeJsLayoutArrays($left[$key], $value);
            } else {
                $left[$key] = $value;
            }
        }

        return $left;
    }

    /**
     * @return CompositeConfigProvider|null
     */
    private function getConfigProvider()
    {
        return $this->configProvider;
    }

    /**
     * @return ModuleListInterface|null
     */
    private function getModuleList()
    {
        return $this->moduleList;
    }

    /**
     * @return ComponentRegistrarInterface|null
     */
    private function getComponentRegistrar()
    {
        return $this->componentRegistrar;
    }

    /**
     * @return ResolverInterface|null
     */
    private function getLocaleResolver()
    {
        return $this->localeResolver;
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
     * @return \Magento\Customer\Helper\Address
     */
    public function getAddressHelper()
    {
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
     * @return \Magento\Tax\Helper\Data
     */
    public function getTaxHelper()
    {
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
