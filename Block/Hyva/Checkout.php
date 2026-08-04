<?php

namespace Kkkonrad\Fastcheckout\Block\Hyva;

use Hyva\Theme\Model\ViewModelRegistry;
use Hyva\Theme\ViewModel\HyvaCsp;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Block\Onepage;
use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Checkout\Model\Session as CheckoutSession;
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
use Kkkonrad\Fastcheckout\Model\CheckoutLayoutCollector;
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
     * Checkout config per quote object, shared by every block instance in the request.
     *
     * @var array<int, array>
     */
    private static $checkoutConfigCache = [];

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

    /** @var CheckoutLayoutCollector|null */
    private $layoutCollector;

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
        ?ModuleListInterface $moduleList = null,
        ?ComponentRegistrarInterface $componentRegistrar = null,
        ?ResolverInterface $localeResolver = null,
        array $data = [],
        ?TaxHelper $taxHelper = null,
        ?PaymentMethodManagementInterface $paymentMethodManagement = null,
        ?PaymentHelper $paymentHelper = null,
        ?SerializerInterface $serializer = null,
        ?BlockFactory $blockFactory = null,
        ?CheckoutLayoutCollector $layoutCollector = null
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
        $this->layoutCollector = $layoutCollector;

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
    public function getAvailablePaymentMethods(): array
    {
        if ($this->paymentMethodsCache !== null) {
            return $this->paymentMethodsCache;
        }

        $this->paymentMethodsCache = [];
        $quote = $this->getQuote();
        if (!$quote || !$quote->getId()) {
            return $this->paymentMethodsCache;
        }

        $configuredMethods = $this->getCheckoutConfig()['paymentMethods'] ?? null;
        $configuredMethods = is_array($configuredMethods) ? $configuredMethods : null;

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

    public function isPaymentMethodAvailable(string $paymentMethodCode, ?array $allowedCodes = null): bool
    {
        if (!$this->helper->hasShippingPaymentMapping()) {
            // No mapping configured → all payment methods allowed.
            return true;
        }

        $allowedCodes = $allowedCodes !== null ? $allowedCodes : $this->getAllowedPaymentMethodCodes();
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
     * Apply the Magento default destination (country / optional origin postcode,
     * region and city) so already-collected rates can be read before the shopper
     * types an address, and report which fields were written so the caller can put
     * the address back the way the shopper left it.
     *
     * @return string[] data keys written by this call
     */
    private function applyDefaultShippingDestination(): array
    {
        $quote = $this->getQuote();
        if (!$quote || $quote->isVirtual()) {
            return [];
        }

        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress) {
            return [];
        }

        $applied = [];

        if (!(string)$shippingAddress->getCountryId()) {
            $country = $this->getDefaultDestinationCountryId();
            if ($country !== '') {
                $shippingAddress->setCountryId($country);
                $applied[] = 'country_id';
            }
        }

        if (!(string)$shippingAddress->getPostcode()) {
            $postcode = (string)$this->_scopeConfig->getValue(
                'shipping/origin/postcode',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($postcode !== '') {
                $shippingAddress->setPostcode($postcode);
                $applied[] = 'postcode';
            }
        }

        if (!(int)$shippingAddress->getRegionId()) {
            $regionId = (int)$this->_scopeConfig->getValue(
                'shipping/origin/region_id',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($regionId > 0) {
                $shippingAddress->setRegionId($regionId);
                $applied[] = 'region_id';
            }
        }

        if (!(string)$shippingAddress->getCity()) {
            $city = (string)$this->_scopeConfig->getValue(
                'shipping/origin/city',
                \Magento\Store\Model\ScopeInterface::SCOPE_STORE
            );
            if ($city !== '') {
                $shippingAddress->setCity($city);
                $applied[] = 'city';
            }
        }

        return $applied;
    }

    /**
     * Drop the placeholder destination again. Rendering must not leave the shipping
     * origin on the quote: anything saving the quote later in the request would
     * persist the store address as the shopper's own.
     *
     * @param string[] $applied
     */
    private function revertDefaultShippingDestination(array $applied): void
    {
        if ($applied === []) {
            return;
        }

        $quote = $this->getQuote();
        $shippingAddress = $quote ? $quote->getShippingAddress() : null;
        if (!$shippingAddress) {
            return;
        }

        foreach ($applied as $field) {
            $shippingAddress->unsetData($field);
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

        $applied = $this->applyDefaultShippingDestination();
        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress || !$shippingAddress->getCountryId()) {
            $this->revertDefaultShippingDestination($applied);
            return $this->shippingMethodsCache;
        }

        try {
            $rates = $shippingAddress->getGroupedAllShippingRates();
            $this->shippingMethodsCache = is_array($rates) ? $rates : [];
        } catch (\Throwable $exception) {
            $this->shippingMethodsCache = [];
        } finally {
            $this->revertDefaultShippingDestination($applied);
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
     * JSON for an inline <script> block.
     *
     * JSON_HEX_TAG is what keeps shopper-supplied values (city, postcode, saved
     * address inside checkoutConfig) from closing the script element. Matches
     * Magento\Framework\Serialize\Serializer\JsonHexTag, which core uses for the
     * same purpose in Template::getJsLayout().
     *
     * @param mixed $data
     * @return string
     */
    public function serializeForScript($data): string
    {
        $json = json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

        return $json === false ? 'null' : $json;
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

    /**
     * The checkout page renders two instances of this block (the Tailwind shell and
     * the Knockout bridge), so the memo is shared per quote instead of per block.
     * CompositeConfigProvider is one of the most expensive calls in the request.
     *
     * ponytail: per-request static keyed by quote object; move to a DI-scoped service
     * if the module ever runs under a persistent app server (RoadRunner/FrankenPHP).
     */
    public function getCheckoutConfig()
    {
        $quote = $this->getQuote();
        $cacheKey = $quote ? spl_object_id($quote) : 0;
        if (array_key_exists($cacheKey, self::$checkoutConfigCache)) {
            return self::$checkoutConfigCache[$cacheKey];
        }

        if (!$quote || !$quote->getId() || !$quote->hasItems() || $this->configProvider === null) {
            return self::$checkoutConfigCache[$cacheKey] = [];
        }

        try {
            return self::$checkoutConfigCache[$cacheKey] = $this->configProvider->getConfig();
        } catch (\Throwable $exception) {
            return self::$checkoutConfigCache[$cacheKey] = [];
        }
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
     * Discount (coupon form) is extracted separately via getPaymentDiscountComponent()
     * and mounted in the Fastcheckout summary column — strip it here so it is not
     * left only in the hidden payment root.
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

        if (
            isset($result['afterMethods']['children']['discount']) &&
            is_array($result['afterMethods']['children']['discount'])
        ) {
            // Deep-copy before mutating so the processed layout cache stays intact.
            $result['afterMethods'] = $this->deepCopyArray($result['afterMethods']);
            unset($result['afterMethods']['children']['discount']);
        }

        return $result;
    }

    /**
     * Magento_SalesRule payment discount (coupon) component from native jsLayout.
     * Mounted in the Fastcheckout summary column with FC styling.
     *
     * @return array
     */
    public function getPaymentDiscountComponent(): array
    {
        $discount = $this->getPaymentComponent()
            ['children']['afterMethods']['children']['discount'] ?? [];

        return is_array($discount) ? $discount : [];
    }

    /**
     * @param array $value
     * @return array
     */
    private function deepCopyArray(array $value): array
    {
        return json_decode(json_encode($value), true) ?: [];
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
     * Native Magento checkout sidebar summary (cart items + totals) from processed
     * jsLayout, including Magento_Tax component overrides. Used by Fastcheckout to
     * mount stock KO summary instead of a PHP-only totals renderer.
     *
     * @return array
     */
    public function getCheckoutSidebarSummary(): array
    {
        $summary = $this->getProcessedCheckoutLayout()
            ['components']['checkout']['children']['sidebar']['children']['summary'] ?? [];

        return is_array($summary) ? $summary : [];
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
     * Collect native checkout jsLayout + head assets.
     *
     * Primary: Magento layout merge for handle checkout_index_index (modules + theme).
     * Fallback: module/theme filesystem XML scan (unit tests and merge failures).
     *
     * LayoutProcessors still run in getProcessedCheckoutLayout() via Onepage.
     */
    private function getRawCheckoutLayoutData(): array
    {
        if ($this->rawCheckoutLayoutData !== null) {
            return $this->rawCheckoutLayoutData;
        }

        $collector = $this->getLayoutCollector();
        $collected = $collector->collect();
        $this->rawCheckoutLayoutData = [
            'jsLayout' => is_array($collected['jsLayout'] ?? null) ? $collected['jsLayout'] : [],
            'assets' => is_array($collected['assets'] ?? null)
                ? $collected['assets']
                : ['css' => [], 'scripts' => []],
            'source' => (string)($collected['source'] ?? 'unknown')
        ];

        return $this->rawCheckoutLayoutData;
    }

    /**
     * Which collector path produced the raw layout (for diagnostics / tests).
     */
    public function getCheckoutLayoutSource(): string
    {
        return (string)($this->getRawCheckoutLayoutData()['source'] ?? '');
    }

    private function getLayoutCollector(): CheckoutLayoutCollector
    {
        if ($this->layoutCollector !== null) {
            return $this->layoutCollector;
        }

        // Lazy fallback for unit tests / partial DI that still pass moduleList.
        $this->layoutCollector = new CheckoutLayoutCollector(
            null,
            $this->moduleList,
            $this->componentRegistrar,
            $this->serializer,
            $this->_cache,
            $this->_storeManager,
            $this->_design,
            $this->_logger,
            $this->getLocaleCode()
        );

        return $this->layoutCollector;
    }

    private function getProcessedCheckoutLayout(): array
    {
        if ($this->processedCheckoutLayout !== null) {
            return $this->processedCheckoutLayout;
        }

        $layout = $this->getRawCheckoutLayoutData()['jsLayout'];

        if ($layout !== [] && $this->blockFactory !== null && $this->serializer !== null) {
            try {
                $onepage = $this->blockFactory->createBlock(Onepage::class, ['data' => ['jsLayout' => $layout]]);
                $processed = $this->serializer->unserialize($onepage->getJsLayout());
                if (is_array($processed)) {
                    $layout = $processed;
                }
            } catch (\Throwable $exception) {
                $this->_logger->warning('Fastcheckout could not process the native checkout jsLayout.', [
                    'exception' => $exception
                ]);
            }
        }

        // One normalization pass over the final tree. Normalizing the raw layout first
        // only to overwrite it with the processed one walked the whole tree twice.
        $this->processedCheckoutLayout = $this->normalizeStandardStreetLineDefaults($layout);

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
        // Magento cart "both" still has a primary amount; prefer incl when configured
        // for incl/both (standard Magento item price renderer shows incl first for both).
        if ($this->displayCartPriceInclTax() || $this->displayCartBothPrices()) {
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
     * Get summary totals dynamically collected, sorted, and translated based on store configuration.
     * Honors Magento tax/cart_display for subtotal, shipping and grand total (excl/incl/both).
     *
     * @return array<int, array{code: string, label: string|\Magento\Framework\Phrase, value: float, strong: bool}>
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
        $taxTotalValue = 0.0;
        $quoteTotals = $quote->getTotals();
        if (isset($quoteTotals['tax'])) {
            $taxTotalValue = (float)$quoteTotals['tax']->getValue();
        }

        foreach ($quoteTotals as $code => $total) {
            foreach ($this->buildSummaryTotalRows((string)$code, $total, $taxTotalValue) as $row) {
                $value = (float)$row['value'];
                // Skip zero values for optional segments (like tax, discount, fees),
                // but always show subtotal and grand total even if zero.
                if ($value == 0.0 && !in_array($row['code'], ['subtotal', 'subtotal_excl', 'subtotal_incl', 'grand_total', 'grand_total_excl', 'grand_total_incl'], true)) {
                    continue;
                }
                $totals[] = $row;
            }
        }

        $this->summaryTotalsCache = $totals;

        return $this->summaryTotalsCache;
    }

    /**
     * Expand one Magento quote total into one or more display rows per tax cart settings.
     *
     * @param string $code
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @param float $taxTotalValue
     * @return array<int, array{code: string, label: string|\Magento\Framework\Phrase, value: float, strong: bool}>
     */
    public function buildSummaryTotalRows(string $code, $total, float $taxTotalValue = 0.0): array
    {
        $title = $total->getTitle();
        $strong = ($total->getArea() === 'footer' || $code === 'grand_total');
        $value = (float)$total->getValue();
        $taxConfig = $this->getTaxConfig();

        if ($code === 'subtotal') {
            // Magento Tax::fetch for both/incl sets value=INCL and value_excl_tax=excl
            // (see Magento\Tax\Model\Sales\Total\Quote\Tax). Cart uses getValueExclTax().
            $excl = $this->resolveSubtotalExclTax($total);
            $incl = $this->resolveSubtotalInclTax($total);
            if ($taxConfig && $taxConfig->displayCartSubtotalBoth()) {
                return [
                    [
                        'code' => 'subtotal_excl',
                        'label' => __('%1 (Excl. Tax)', $title),
                        'value' => $excl,
                        'strong' => false,
                    ],
                    [
                        'code' => 'subtotal_incl',
                        'label' => __('%1 (Incl. Tax)', $title),
                        'value' => $incl,
                        'strong' => false,
                    ],
                ];
            }
            if ($taxConfig && $taxConfig->displayCartSubtotalInclTax()) {
                return [[
                    'code' => 'subtotal',
                    'label' => $title,
                    'value' => $incl,
                    'strong' => false,
                ]];
            }

            return [[
                'code' => 'subtotal',
                'label' => $title,
                'value' => $excl,
                'strong' => false,
            ]];
        }

        if ($code === 'shipping') {
            // Shipping total keeps getValue() as excl; incl is shipping_incl_tax
            // (Magento\Tax\Block\Checkout\Shipping::getShippingExcludeTax / IncludeTax).
            $excl = $this->resolveShippingExclTax($total);
            $incl = $this->resolveShippingInclTax($total);
            if ($taxConfig && $taxConfig->displayCartShippingBoth()) {
                return [
                    [
                        'code' => 'shipping_excl',
                        'label' => __('%1 (Excl. Tax)', $title),
                        'value' => $excl,
                        'strong' => false,
                    ],
                    [
                        'code' => 'shipping_incl',
                        'label' => __('%1 (Incl. Tax)', $title),
                        'value' => $incl,
                        'strong' => false,
                    ],
                ];
            }
            if ($taxConfig && $taxConfig->displayCartShippingInclTax()) {
                return [[
                    'code' => 'shipping',
                    'label' => $title,
                    'value' => $incl,
                    'strong' => false,
                ]];
            }

            return [[
                'code' => 'shipping',
                'label' => $title,
                'value' => $excl,
                'strong' => false,
            ]];
        }

        if ($code === 'grand_total') {
            $grandIncl = $value;
            if ($taxConfig && $taxConfig->displayCartTaxWithGrandTotal() && $grandIncl != 0.0) {
                $grandExcl = max($grandIncl - $taxTotalValue, 0.0);

                return [
                    [
                        'code' => 'grand_total_incl',
                        'label' => __('Grand Total Incl. Tax'),
                        'value' => $grandIncl,
                        'strong' => true,
                    ],
                    [
                        'code' => 'grand_total_excl',
                        'label' => __('Grand Total Excl. Tax'),
                        'value' => $grandExcl,
                        'strong' => true,
                    ],
                ];
            }

            return [[
                'code' => 'grand_total',
                'label' => $title,
                'value' => $grandIncl,
                'strong' => true,
            ]];
        }

        return [[
            'code' => $code,
            'label' => $title,
            'value' => $value,
            'strong' => $strong,
        ]];
    }

    /**
     * Magento Tax\Model\Config from the injected TaxHelper (null-safe).
     *
     * @return \Magento\Tax\Model\Config|null
     */
    public function getTaxConfig()
    {
        $helper = $this->getTaxHelper();
        if (!$helper || !method_exists($helper, 'getConfig')) {
            return null;
        }

        return $helper->getConfig();
    }

    /**
     * Subtotal excluding tax.
     * Magento Tax::fetch (both/incl) sets value=INCL and value_excl_tax=excl.
     * Excl-only collectors leave value=excl without value_excl_tax.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveSubtotalExclTax($total): float
    {
        if (method_exists($total, 'getValueExclTax')) {
            $excl = $total->getValueExclTax();
            if ($excl !== null && $excl !== '') {
                return (float)$excl;
            }
        }
        $excl = $total->getData('value_excl_tax');
        if ($excl !== null && $excl !== '') {
            return (float)$excl;
        }

        // Excl-only mode: getValue() is excl. Both/incl always sets value_excl_tax above.
        return (float)$total->getValue();
    }

    /**
     * Subtotal including tax.
     * Magento both/incl: value and value_incl_tax are INCL.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveSubtotalInclTax($total): float
    {
        if (method_exists($total, 'getValueInclTax')) {
            $incl = $total->getValueInclTax();
            if ($incl !== null && $incl !== '') {
                return (float)$incl;
            }
        }
        $incl = $total->getData('value_incl_tax');
        if ($incl === null || $incl === '') {
            $incl = $total->getData('subtotal_incl_tax');
        }
        if ($incl === null || $incl === '') {
            $quote = $this->getQuote();
            $address = $quote ? $quote->getShippingAddress() : null;
            if ($address && $address->getSubtotalInclTax() !== null && $address->getSubtotalInclTax() !== '') {
                $incl = $address->getSubtotalInclTax();
            }
        }
        if ($incl !== null && $incl !== '') {
            return (float)$incl;
        }

        // Both/incl Magento fetch stores INCL in value when value_incl_tax missing.
        return (float)$total->getValue();
    }

    /**
     * Shipping excl tax — Magento total value stays excl for shipping.
     *
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveShippingExclTax($total): float
    {
        return (float)$total->getValue();
    }

    /**
     * @param \Magento\Quote\Model\Quote\Address\Total|\Magento\Framework\DataObject $total
     * @return float
     */
    public function resolveShippingInclTax($total): float
    {
        $incl = null;
        if (method_exists($total, 'getShippingInclTax')) {
            $incl = $total->getShippingInclTax();
        }
        if ($incl === null || $incl === '') {
            $incl = $total->getData('shipping_incl_tax');
        }
        if ($incl === null || $incl === '') {
            $quote = $this->getQuote();
            $address = $quote ? $quote->getShippingAddress() : null;
            if ($address) {
                $incl = $address->getShippingInclTax();
            }
        }

        return $incl !== null && $incl !== '' ? (float)$incl : (float)$total->getValue();
    }

    /**
     * @return string
     */
    public function getCartUrl()
    {
        return $this->getUrl('checkout/cart');
    }

    /**
     * @return \Magento\Tax\Helper\Data|null
     */
    public function getTaxHelper()
    {
        return $this->taxHelper;
    }

    /**
     * Magento tax/cart/display/price = Including Tax
     */
    public function displayCartPriceInclTax(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayCartPriceInclTax() : false;
    }

    /**
     * Magento tax/cart/display/price = Excluding Tax
     */
    public function displayCartPriceExclTax(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayCartPriceExclTax() : true;
    }

    /**
     * Magento tax/cart/display/price = Including and Excluding Tax
     */
    public function displayCartBothPrices(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayCartBothPrices() : false;
    }

    /**
     * Magento tax/cart/display/shipping = Excluding Tax
     */
    public function displayShippingPriceExclTax(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayShippingPriceExcludingTax() : true;
    }

    /**
     * Magento tax/cart/display/shipping = Including and Excluding Tax
     */
    public function displayShippingBothPrices(): bool
    {
        $helper = $this->getTaxHelper();

        return $helper ? (bool)$helper->displayShippingBothPrices() : false;
    }

    /**
     * @param Item $item
     * @return float
     */
    public function getItemRowTotalExclTax(Item $item): float
    {
        return (float)($item->getRowTotal() ?? 0);
    }

    /**
     * @param Item $item
     * @return float
     */
    public function getItemRowTotalInclTax(Item $item): float
    {
        $incl = $item->getRowTotalInclTax();
        if ($incl === null || $incl === '') {
            return $this->getItemRowTotalExclTax($item);
        }

        return (float)$incl;
    }

    /**
     * Rate amount excluding tax (Magento TaxHelper::getShippingPrice).
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateAmountExclTax($rate): float
    {
        return $this->getShippingRateAmountWithTaxFlag($rate, false);
    }

    /**
     * Rate amount including tax (Magento TaxHelper::getShippingPrice).
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateAmountInclTax($rate): float
    {
        return $this->getShippingRateAmountWithTaxFlag($rate, true);
    }

    /**
     * Primary shipping price amount for the current Magento display setting.
     *
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @return float
     */
    public function getShippingRateDisplayAmount($rate): float
    {
        if ($this->displayShippingPriceExclTax()) {
            return $this->getShippingRateAmountExclTax($rate);
        }

        return $this->getShippingRateAmountInclTax($rate);
    }

    /**
     * @param \Magento\Quote\Model\Quote\Address\Rate|\Magento\Framework\DataObject $rate
     * @param bool $includingTax
     * @return float
     */
    private function getShippingRateAmountWithTaxFlag($rate, bool $includingTax): float
    {
        $price = (float)($rate && method_exists($rate, 'getPrice') ? $rate->getPrice() : 0);
        $helper = $this->getTaxHelper();
        if (!$helper) {
            return $price;
        }

        $quote = $this->getQuote();
        $address = $quote ? $quote->getShippingAddress() : null;
        $ctc = $quote ? $quote->getCustomerTaxClassId() : null;

        return (float)$helper->getShippingPrice($price, $includingTax, $address, $ctc);
    }
}
