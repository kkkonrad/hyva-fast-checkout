<?php

namespace Kkkonrad\Fastcheckout\Block\Hyva;

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\HyvaCsp;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Block\Onepage;
use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Cache\Type\Config as ConfigCacheType;
use Magento\Framework\App\Cache\Type\Layout as LayoutCacheType;
use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\BlockFactory;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Payment\Helper\Data as PaymentHelper;
use Magento\Payment\Model\MethodInterface;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Tax\Helper\Data as TaxHelper;


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
     * @var array|null
     */
    private $checkoutConfigCache;

    /**
     * @var array|null
     */
    private $summaryTotalsCache;

    /**
     * @var Helper
     */
    private $helper;

    /** @var TaxHelper|null */
    private $taxHelper;

    /** @var SerializerInterface|null */
    private $serializer;

    /** @var BlockFactory|null */
    private $blockFactory;

    /** @var array|null */
    private $rawCheckoutLayoutData;

    /** @var array|null */
    private $processedCheckoutLayout;

    /** @var PaymentMethodManagementInterface|null */
    private $paymentMethodManagement;

    /** @var PaymentHelper|null */
    private $paymentHelper;

    /** @var array|null */
    private $paymentMethodsCache;

    /** @var array|null */
    private $shippingMethodsCache;

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
        TaxHelper $taxHelper = null,
        PaymentMethodManagementInterface $paymentMethodManagement = null,
        PaymentHelper $paymentHelper = null,
        SerializerInterface $serializer = null,
        BlockFactory $blockFactory = null
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
        $this->taxHelper = $taxHelper;
        $this->paymentMethodManagement = $paymentMethodManagement;
        $this->paymentHelper = $paymentHelper;
        $this->serializer = $serializer;
        $this->blockFactory = $blockFactory;

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
    public function isShowDiscount(): bool
    {
        return $this->helper->isShowDiscount();
    }

    /**
     * @return bool
     */
    public function isShowSubscribe(): bool
    {
        return $this->helper->isShowSubscribe();
    }

    /**
     * Available payment methods for the current quote.
     *
     * @return array
     */
    public function getAvailablePaymentMethods(?array $configuredMethods = null): array
    {
        if ($this->paymentMethodsCache !== null) {
            return $this->paymentMethodsCache;
        }

        $this->paymentMethodsCache = [];
        $quote = $this->getQuote();
        if (!$quote || !$quote->getId()) {
            return $this->paymentMethodsCache;
        }

        $paymentMethodManagement = $this->paymentMethodManagement
            ?: $this->resolveObject(\Magento\Quote\Api\PaymentMethodManagementInterface::class);
        $paymentHelper = $this->paymentHelper
            ?: $this->resolveObject(\Magento\Payment\Helper\Data::class);

        // Reuse CompositeConfigProvider results when checkout config was already
        // resolved for the page. An empty configured list is meaningful here:
        // it normally means no shipping method is selected yet, so go directly
        // to the active-store fallback instead of repeating the quote API call.
        if ($configuredMethods !== null) {
            $this->paymentMethodsCache = array_values($configuredMethods);
        } elseif ($paymentMethodManagement) {
            try {
                $methods = $paymentMethodManagement->getList($quote->getId());
                $this->paymentMethodsCache = is_array($methods) ? array_values($methods) : [];
            } catch (\Throwable $exception) {
                $this->paymentMethodsCache = [];
            }
        }

        // Fallback: active store payment methods so the DOM has option rows
        //    before shipping is selected; JS remap shows the mapped ones after pick.
        if ($this->paymentMethodsCache === [] && $paymentHelper) {
            try {
                $storeMethods = $paymentHelper->getStoreMethods(null, $quote);
                if (is_array($storeMethods)) {
                    $this->paymentMethodsCache = array_values(array_filter(
                        $storeMethods,
                        static function ($method) {
                            return $method instanceof MethodInterface
                                && (string)$method->getCode() !== '';
                        }
                    ));
                }
            } catch (\Throwable $exception) {
                // keep empty
            }
        }

        // Normalize to objects with getCode()/getTitle() for the template.
        $this->paymentMethodsCache = array_map(function ($method) {
            if ($method instanceof MethodInterface) {
                return new class ($method) {
                    private $method;
                    public function __construct(MethodInterface $method)
                    {
                        $this->method = $method;
                    }
                    public function getCode(): string
                    {
                        return (string)$this->method->getCode();
                    }
                    public function getTitle(): string
                    {
                        return (string)$this->method->getTitle();
                    }
                };
            }
            return $method;
        }, $this->paymentMethodsCache);

        return $this->paymentMethodsCache;
    }

    /**
     * Payment codes allowed for the currently selected shipping method (mapping).
     *
     * @return string[]
     */
    public function getAllowedPaymentMethodCodes(): array
    {
        $quote = $this->getQuote();
        $shippingMethod = '';
        if ($quote && $quote->getShippingAddress()) {
            $shippingMethod = (string)$quote->getShippingAddress()->getShippingMethod();
        }

        if (!$this->helper->hasShippingPaymentMapping()) {
            return [];
        }

        // No shipping picked yet → no mapped payments (JS shows "select shipping first").
        if ($shippingMethod === '') {
            return [];
        }

        return $this->helper->getMappedPaymentMethodsForShipping($shippingMethod);
    }

    public function isPaymentMethodAvailable(string $paymentMethodCode, array $allowedCodes = null): bool
    {
        $allowedCodes = $allowedCodes !== null ? $allowedCodes : $this->getAllowedPaymentMethodCodes();
        if (!$this->helper->hasShippingPaymentMapping()) {
            // No mapping configured → all payment methods allowed.
            return true;
        }
        if (empty($allowedCodes)) {
            // Mapping exists but no shipping selected (or no rules match) → hide until pick.
            return false;
        }

        return $this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $allowedCodes);
    }

    public function isPaymentMethodSelected(string $paymentMethodCode): bool
    {
        $quote = $this->getQuote();
        $payment = $quote ? $quote->getPayment() : null;
        $selected = $payment ? (string)$payment->getMethod() : '';

        return $selected !== '' && $selected === $paymentMethodCode;
    }

    /**
     * Magento store default country (general/country/default), then shipping origin.
     */
    public function getDefaultDestinationCountryId(): string
    {
        $country = (string)$this->_scopeConfig->getValue(
            \Magento\Directory\Helper\Data::XML_PATH_DEFAULT_COUNTRY,
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
        if ($country !== '') {
            return $country;
        }

        return (string)$this->_scopeConfig->getValue(
            'shipping/origin/country_id',
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * Apply Magento default destination (country / optional origin postcode+region)
     * so rates can be collected before the shopper types an address.
     */
    public function ensureDefaultShippingDestination(): void
    {
        $quote = $this->getQuote();
        if (!$quote || $quote->isVirtual()) {
            return;
        }

        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress) {
            return;
        }

        if (!(string)$shippingAddress->getCountryId()) {
            $country = $this->getDefaultDestinationCountryId();
            if ($country !== '') {
                $shippingAddress->setCountryId($country);
            }
        }

        if (!(string)$shippingAddress->getPostcode()) {
            $postcode = (string)$this->_scopeConfig->getValue(
                'shipping/origin/postcode',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($postcode !== '') {
                $shippingAddress->setPostcode($postcode);
            }
        }

        if (!(int)$shippingAddress->getRegionId()) {
            $regionId = (int)$this->_scopeConfig->getValue(
                'shipping/origin/region_id',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($regionId > 0) {
                $shippingAddress->setRegionId($regionId);
            }
        }

        if (!(string)$shippingAddress->getCity()) {
            $city = (string)$this->_scopeConfig->getValue(
                'shipping/origin/city',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($city !== '') {
                $shippingAddress->setCity($city);
            }
        }
    }

    /**
     * Reuse grouped shipping rates that are already present on the quote.
     *
     * Carrier collection can perform remote calls and must not delay the HTML
     * response. When no rates are cached, the native KO rate processor estimates
     * them asynchronously after the shipping form has painted.
     *
     * @return array
     */
    public function getShippingMethods(): array
    {
        if ($this->shippingMethodsCache !== null) {
            return $this->shippingMethodsCache;
        }

        $this->shippingMethodsCache = [];
        $quote = $this->getQuote();
        if (!$quote || $quote->isVirtual()) {
            return $this->shippingMethodsCache;
        }

        $this->ensureDefaultShippingDestination();
        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress || !$shippingAddress->getCountryId()) {
            return $this->shippingMethodsCache;
        }

        try {
            $rates = $shippingAddress->getGroupedAllShippingRates();
            $this->shippingMethodsCache = is_array($rates) ? $rates : [];
        } catch (\Throwable $exception) {
            $this->shippingMethodsCache = [];
        }

        return $this->shippingMethodsCache;
    }

    public function getSelectedShippingMethodCode(): string
    {
        $quote = $this->getQuote();
        if (!$quote || !$quote->getShippingAddress()) {
            return '';
        }

        return (string)$quote->getShippingAddress()->getShippingMethod();
    }

    public function getCouponCode(): string
    {
        $quote = $this->getQuote();
        return $quote ? (string)$quote->getCouponCode() : '';
    }

    public function getHelper(): Helper
    {
        return $this->helper;
    }

    /**
     * Resolve a dependency when compiled DI omitted an optional constructor arg.
     *
     * @template T
     * @param class-string<T> $type
     * @return T|null
     */
    private function resolveObject(string $type)
    {
        try {
            return \Magento\Framework\App\ObjectManager::getInstance()->get($type);
        } catch (\Throwable $exception) {
            return null;
        }
    }

    /**
     * @return HyvaCsp
     */
    public function getHyvaCsp(): HyvaCsp
    {
        return $this->viewModelRegistry->require(HyvaCsp::class);
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

        if ($this->configProvider === null) {
            $this->checkoutConfigCache = [];
            return $this->checkoutConfigCache;
        }

        try {
            $this->checkoutConfigCache = $this->configProvider->getConfig();
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
        return $this->localeResolver ? (string)$this->localeResolver->getLocale() : 'en_US';
    }

    /**
     * Return payment renderer registration components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getPaymentRendererComponents()
    {
        $components = [];
        foreach ($this->getPaymentRendererChildren() as $code => $renderer) {
            if (!is_array($renderer) || !$this->isPaymentRendererEnabled((string)$code, $renderer)) {
                continue;
            }

            $component = $renderer['component'] ?? null;
            if (is_string($component) && $component !== '') {
                $components[] = $component;
            }
        }

        return array_values(array_unique($components));
    }

    /**
     * Return payment renderer components indexed by payment method code.
     *
     * @return array[]
     */
    public function getPaymentRendererComponentMap()
    {
        $map = [];
        foreach ($this->getPaymentRendererChildren() as $code => $renderer) {
            if (!is_array($renderer) || !$this->isPaymentRendererEnabled((string)$code, $renderer)) {
                continue;
            }

            $component = $renderer['component'] ?? null;
            if (!is_string($component) || $component === '' || $component === 'uiComponent') {
                continue;
            }

            $map[$code . '::' . $component] = [
                'method' => (string)$code,
                'component' => $component
            ];
            foreach (array_keys(is_array($renderer['methods'] ?? null) ? $renderer['methods'] : []) as $method) {
                if ($this->_scopeConfig->getValue('payment/' . $method . '/active') === '0') {
                    continue;
                }
                $map[$method . '::' . $component] = [
                    'method' => (string)$method,
                    'component' => $component
                ];
            }
        }

        return array_values($map);
    }

    /**
     * Return shipping rates validation components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getShippingRatesValidationComponents()
    {
        $children = $this->getCheckoutStepsChildren()['shipping-step']['children']['step-config']['children']
            ['shipping-rates-validation']['children'] ?? [];

        return $this->getChildComponents($children);
    }

    /**
     * Return payment validator registration components declared by active modules
     * for the standard Magento checkout handle.
     *
     * @return string[]
     */
    public function getPaymentValidationComponents()
    {
        $children = $this->getPaymentComponent()['children']['additional-payment-validators']['children'] ?? [];

        return $this->getChildComponents($children, true);
    }

    /**
     * Return child UI components declared under the standard Magento payment list.
     *
     * @return array
     */
    public function getPaymentListChildren()
    {
        $children = $this->getPaymentComponent()['children']['payments-list']['children'] ?? [];

        return is_array($children) ? $children : [];
    }

    /**
     * Return direct children declared under the standard Magento payment component
     * for regions used outside the payment renderer list.
     *
     * @return array
     */
    public function getPaymentRegionChildren()
    {
        $result = [];
        $children = $this->getPaymentComponent()['children'] ?? [];
        foreach (['place-order-captcha', 'beforeMethods', 'afterMethods'] as $name) {
            if (isset($children[$name]) && is_array($children[$name])) {
                $result[$name] = $children[$name];
            }
        }

        return $result;
    }

    /**
     * Return child UI components used by the standard Magento shipping method view.
     *
     * @return array
     */
    public function getShippingListChildren()
    {
        $result = [];
        $children = $this->getShippingAddressChildren();
        foreach (['before-shipping-method-form', 'shippingAdditional'] as $name) {
            if (isset($children[$name]) && is_array($children[$name])) {
                $result[$name] = $children[$name];
            }
        }

        return $result;
    }

    /**
     * Return non-fieldset child UI components used by the standard Magento shipping address view.
     *
     * @return array
     */
    public function getShippingAddressChildren()
    {
        $children = $this->getShippingAddressComponent()['children'] ?? [];

        return is_array($children) ? $this->normalizeShippingAddressChildren($children) : [];
    }

    /**
     * Keep the customer-email region limited to the address form. Payment
     * modules place express checkout groups in the same region on the native
     * one-page checkout, but Fastcheckout renders payment methods separately.
     * Also restore Magento's email template when a payment module replaces it.
     *
     * @param array $children
     * @return array
     */
    private function normalizeShippingAddressChildren(array $children): array
    {
        foreach ($children as $name => $child) {
            if (
                $name !== 'customer-email' &&
                is_array($child) &&
                ($child['displayArea'] ?? null) === 'customer-email'
            ) {
                unset($children[$name]);
            }
        }

        if (isset($children['customer-email']) && is_array($children['customer-email'])) {
            $children['customer-email']['template'] = 'Magento_Checkout/form/element/email';
        }

        $fastlane = $this->getCheckoutConfig()['payment']['payment_services_paypal_fastlane'] ?? [];
        if (empty($fastlane['isVisible'])) {
            $children = $this->removeComponentsByPrefix(
                $children,
                'Magento_PaymentServicesPaypal/js/view/form/element/'
            );
        }

        return $this->translateShippingAddressConfig($children);
    }

    /**
     * Resolve address labels on the server as well as through Magento's KO
     * translate binding. This avoids an English-label flash when the JS
     * translation dictionary is still loading on the custom checkout route.
     *
     * @param array $config
     * @return array
     */
    private function translateShippingAddressConfig(array $config): array
    {
        foreach ($config as $key => $value) {
            if (is_array($value)) {
                $config[$key] = $this->translateShippingAddressConfig($value);
                continue;
            }

            if (
                is_string($value) &&
                in_array((string)$key, ['label', 'caption', 'notice', 'placeholder'], true)
            ) {
                $config[$key] = (string)__($value);
            }
        }

        return $config;
    }

    /**
     * Return the native Magento shipping component configuration with a
     * Fastcheckout template that renders only address regions (not methods).
     *
     * @return array
     */
    public function getShippingAddressComponentConfig()
    {
        $component = $this->getShippingAddressComponent();

        $component['component'] = $component['component'] ?? 'Magento_Checkout/js/view/shipping';
        $component['provider'] = $component['provider'] ?? 'checkoutProvider';
        $component['children'] = $this->getShippingAddressChildren();
        $component['config'] = isset($component['config']) && is_array($component['config'])
            ? $component['config']
            : [];
        // The provider and step-config are initialized in the same reduced app
        // tree. Keeping the core async deps here can deadlock the parent while
        // its children are already registered by the UI layout renderer.
        unset($component['config']['deps']);
        $component['config']['template'] = 'Kkkonrad_Fastcheckout/hyva/shipping-address';
        $component['config']['popUpForm']['options']['appendTo'] =
            '#fastcheckout-checkout .fastcheckout-native-shipping-address';
        $component['config']['popUpForm']['options']['buttons']['save']['text'] =
            (string) __('Deliver to this address');

        return $component;
    }

    /**
     * @return array
     */
    public function getCheckoutProviderConfig()
    {
        $provider = $this->getProcessedCheckoutLayout()['components']['checkoutProvider'] ?? [];

        return is_array($provider) ? $provider : [];
    }

    /**
     * Return additional direct children declared under the standard Magento checkout steps component.
     *
     * The shipping-step and billing-step are handled by dedicated Fastcheckout bridges because their
     * core regions are mapped into the custom Hyvä/KO UI. Other step children, such as MSI
     * Store Pickup, are kept as native KO components so their registry entries and side effects stay
     * compatible with standard checkout modules.
     *
     * @return array
     */
    public function getCheckoutStepChildren()
    {
        $children = $this->getCheckoutStepsChildren();
        unset($children['shipping-step'], $children['billing-step']);

        return $children;
    }

    /**
     * Return custom layout assets declared in the standard Magento checkout layout (checkout_index_index.xml)
     * of active modules.
     *
     * @return array
     */
    public function getCheckoutLayoutAssets()
    {
        return $this->getRawCheckoutLayoutData()['assets'];
    }

    /**
     * @return array
     */
    public function getCheckoutLayoutScripts()
    {
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

        return [
            'modules' => $requireModules,
            'external' => $externalScripts
        ];
    }

    private function getCheckoutStepsChildren(): array
    {
        $children = $this->getProcessedCheckoutLayout()['components']['checkout']['children']['steps']['children']
            ?? [];

        return is_array($children) ? $children : [];
    }

    private function getShippingAddressComponent(): array
    {
        $component = $this->getCheckoutStepsChildren()['shipping-step']['children']['shippingAddress'] ?? [];

        return is_array($component) ? $component : [];
    }

    private function getPaymentComponent(): array
    {
        $component = $this->getCheckoutStepsChildren()['billing-step']['children']['payment'] ?? [];

        return is_array($component) ? $component : [];
    }

    private function getPaymentRendererChildren(): array
    {
        $children = $this->getPaymentComponent()['children']['renders']['children'] ?? [];

        return is_array($children) ? $children : [];
    }

    private function isPaymentRendererEnabled(string $code, array $renderer): bool
    {
        if ($this->_scopeConfig->getValue('payment/' . $code . '/active') === '0') {
            return false;
        }

        $methods = is_array($renderer['methods'] ?? null) ? $renderer['methods'] : [];
        if ($methods === []) {
            return true;
        }

        foreach (array_keys($methods) as $method) {
            if ($this->_scopeConfig->getValue('payment/' . $method . '/active') !== '0') {
                return true;
            }
        }

        return false;
    }

    private function getChildComponents($children, bool $skipUiComponent = false): array
    {
        if (!is_array($children)) {
            return [];
        }

        $components = [];
        foreach ($children as $child) {
            $component = is_array($child) ? ($child['component'] ?? null) : null;
            if (
                is_string($component) &&
                $component !== '' &&
                (!$skipUiComponent || $component !== 'uiComponent')
            ) {
                $components[] = $component;
            }
        }

        return array_values(array_unique($components));
    }

    /**
     * Read every active module's checkout layout once. Only the static XML merge
     * is cached; Magento's processors remain request/quote aware.
     */
    private function getRawCheckoutLayoutData(): array
    {
        if ($this->rawCheckoutLayoutData !== null) {
            return $this->rawCheckoutLayoutData;
        }

        $this->rawCheckoutLayoutData = [
            'jsLayout' => [],
            'assets' => ['css' => [], 'scripts' => []]
        ];
        if ($this->moduleList === null || $this->componentRegistrar === null) {
            return $this->rawCheckoutLayoutData;
        }

        if ($this->serializer !== null) {
            try {
                $cached = $this->_cache->load($this->getRawCheckoutLayoutCacheId());
                $cached = is_string($cached) && $cached !== ''
                    ? $this->serializer->unserialize($cached)
                    : null;
                if (
                    is_array($cached) &&
                    is_array($cached['jsLayout'] ?? null) &&
                    is_array($cached['assets'] ?? null)
                ) {
                    $this->rawCheckoutLayoutData = $cached;
                    return $this->rawCheckoutLayoutData;
                }
            } catch (\Throwable $exception) {
                // A cache miss or stale entry only requires rebuilding the static merge.
            }
        }

        foreach ($this->moduleList->getNames() as $moduleName) {
            $modulePath = $this->componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            $layoutFile = $modulePath
                ? $modulePath . '/view/frontend/layout/checkout_index_index.xml'
                : '';
            if (!is_file($layoutFile)) {
                continue;
            }

            $dom = new \DOMDocument();
            $previous = libxml_use_internal_errors(true);
            try {
                if (!$dom->load($layoutFile)) {
                    continue;
                }

                $xpath = new \DOMXPath($dom);
                $arguments = $xpath->query(
                    '//*[(local-name()="block" or local-name()="referenceBlock") and @name="checkout.root"]' .
                    '/*[local-name()="arguments"]/*[local-name()="argument" and @name="jsLayout"]'
                );
                foreach ($arguments as $argument) {
                    $layout = $this->parseJsLayoutItem($argument);
                    if (is_array($layout)) {
                        $this->rawCheckoutLayoutData['jsLayout'] = $this->mergeJsLayoutArrays(
                            $this->rawCheckoutLayoutData['jsLayout'],
                            $layout
                        );
                    }
                }

                if ($moduleName === 'Kkkonrad_Fastcheckout') {
                    continue;
                }
                foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="css"]') as $node) {
                    $src = $node->getAttribute('src');
                    if ($src !== '') {
                        $this->rawCheckoutLayoutData['assets']['css'][] = [
                            'src' => $src,
                            'src_type' => $node->getAttribute('src_type') ?: null
                        ];
                    }
                }
                foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="script"]') as $node) {
                    $src = $node->getAttribute('src');
                    if ($src !== '') {
                        $this->rawCheckoutLayoutData['assets']['scripts'][] = $src;
                    }
                }
            } catch (\Throwable $exception) {
                // A malformed optional module layout must not break checkout.
            } finally {
                libxml_clear_errors();
                libxml_use_internal_errors($previous);
            }
        }

        $this->rawCheckoutLayoutData['assets']['css'] = array_values(array_unique(
            $this->rawCheckoutLayoutData['assets']['css'],
            SORT_REGULAR
        ));
        $this->rawCheckoutLayoutData['assets']['scripts'] = array_values(array_unique(
            $this->rawCheckoutLayoutData['assets']['scripts']
        ));

        if ($this->serializer !== null) {
            try {
                $this->_cache->save(
                    $this->serializer->serialize($this->rawCheckoutLayoutData),
                    $this->getRawCheckoutLayoutCacheId(),
                    [ConfigCacheType::CACHE_TAG, LayoutCacheType::CACHE_TAG]
                );
            } catch (\Throwable $exception) {
                // Caching is optional.
            }
        }

        return $this->rawCheckoutLayoutData;
    }

    private function getRawCheckoutLayoutCacheId(): string
    {
        $storeId = '';
        $themeId = '';
        try {
            $storeId = (string)$this->_storeManager->getStore()->getId();
            $theme = $this->_design->getDesignTheme();
            $themeId = $theme ? (string)($theme->getId() ?: $theme->getCode()) : '';
        } catch (\Throwable $exception) {
            // Unit tests and early bootstrap can run without a resolved store/theme.
        }

        return 'fastcheckout_raw_layout_' . sha1(implode('|', [
            'v1',
            $storeId,
            $themeId,
            $this->getLocaleCode(),
            implode(',', $this->moduleList !== null ? $this->moduleList->getNames() : [])
        ]));
    }

    private function getProcessedCheckoutLayout(): array
    {
        if ($this->processedCheckoutLayout !== null) {
            return $this->processedCheckoutLayout;
        }

        $raw = $this->getRawCheckoutLayoutData()['jsLayout'];
        $this->processedCheckoutLayout = $this->normalizeStandardStreetLineDefaults($raw);
        if ($raw === [] || $this->blockFactory === null || $this->serializer === null) {
            return $this->processedCheckoutLayout;
        }

        try {
            $onepage = $this->blockFactory->createBlock(Onepage::class, ['data' => ['jsLayout' => $raw]]);
            $processed = $this->serializer->unserialize($onepage->getJsLayout());
            if (is_array($processed)) {
                $this->processedCheckoutLayout = $this->normalizeStandardStreetLineDefaults($processed);
            }
        } catch (\Throwable $exception) {
            $this->_logger->warning('Fastcheckout could not process the native checkout jsLayout.', [
                'exception' => $exception
            ]);
        }

        return $this->processedCheckoutLayout;
    }

    private function removeComponentsByPrefix(array $nodes, string $prefix): array
    {
        foreach ($nodes as $name => $node) {
            if (!is_array($node)) {
                continue;
            }
            if (strpos((string)($node['component'] ?? ''), $prefix) === 0) {
                unset($nodes[$name]);
                continue;
            }
            $nodes[$name] = $this->removeComponentsByPrefix($node, $prefix);
        }

        return $nodes;
    }

    /**
     * Normalize Magento multiline street UI config for shipping and billing.
     *
     * - UI form elements start with `undefined` when checkoutProvider has no
     *   persisted address. Magento's max_text_length validator treats that as an
     *   error; an empty string is the normal form value.
     * - AttributeMerger copies attribute validation (e.g. min_text_length) onto
     *   every street line. Only line 0 is required; optional lines must not
     *   carry required-entry and must accept empty values.
     *
     * @param array $node
     * @return array
     */
    private function normalizeStandardStreetLineDefaults(array $node)
    {
        $dataScope = isset($node['dataScope']) ? (string)$node['dataScope'] : '';
        if (
            substr($dataScope, -7) === '.street' &&
            isset($node['children']) &&
            is_array($node['children'])
        ) {
            $ordinal = 0;
            foreach ($node['children'] as $key => $child) {
                if (!is_array($child)) {
                    continue;
                }

                if (!array_key_exists('value', $child) && !array_key_exists('default', $child)) {
                    $child['default'] = '';
                }

                $lineIndex = $ordinal;
                if (isset($child['dataScope']) && is_numeric($child['dataScope'])) {
                    $lineIndex = (int)$child['dataScope'];
                } elseif (is_numeric($key)) {
                    $lineIndex = (int)$key;
                }

                // Only the first street line is required.
                // Always materialize empty defaults for every line — Magento's
                // max_text_length rule treats `undefined` as invalid and shows
                // "Please enter less or equal than 255 symbols" on empty optional lines.
                $child['default'] = array_key_exists('default', $child) ? $child['default'] : '';
                if ($child['default'] === null) {
                    $child['default'] = '';
                }
                if (!array_key_exists('value', $child)) {
                    $child['value'] = '';
                } elseif ($child['value'] === null) {
                    $child['value'] = '';
                }

                if ($lineIndex > 0) {
                    if (!isset($child['validation']) || !is_array($child['validation'])) {
                        $child['validation'] = [];
                    }
                    unset($child['validation']['required-entry']);
                    if (array_key_exists('min_text_length', $child['validation'])) {
                        $child['validation']['min_text_length'] = 0;
                    }
                    // max_text_length is fine for non-empty values; empty is handled via value "".
                    $child['required'] = false;
                    $child['additionalClasses'] = isset($child['additionalClasses'])
                        ? $child['additionalClasses']
                        : 'additional';
                }

                $node['children'][$key] = $child;
                $ordinal++;
            }
        }

        foreach ($node as $key => $value) {
            if (is_array($value)) {
                $node[$key] = $this->normalizeStandardStreetLineDefaults($value);
            }
        }

        return $node;
    }

    /**
     * @param \DOMElement $node
     * @return array|bool|float|int|string|null
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
        if ($type === 'number') {
            return strpos($value, '.') === false ? (int)$value : (float)$value;
        }
        if ($value === '') {
            return null;
        }

        return $node->getAttribute('translate') === 'true' ? (string)__($value) : $value;
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
     * @return \Magento\Tax\Helper\Data
     */
    public function getTaxHelper()
    {
        return $this->taxHelper;
    }

    /**
     * @return bool
     */
    public function displayCartPriceInclTax(): bool
    {
        return (bool)$this->getTaxHelper()->displayCartPriceInclTax();
    }
}
