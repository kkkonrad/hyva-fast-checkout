<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Helper;

use Magento\Framework\App\Helper\Context;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\Message\Session as Session;

use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\App\Helper\AbstractHelper;
use Magento\Framework\UrlInterface;

use Magento\Store\Model\ScopeInterface;
use Magento\Checkout\Model\Cart;
use Magento\Quote\Model\QuoteFactory;
use Magento\Directory\Model\ResourceModel\Region\CollectionFactory;
use Magento\Framework\View\DesignInterface;
use Magento\Theme\Model\ThemeFactory;

class Data extends AbstractHelper
{

    const XML_PATH_ENABLE = 'fastcheckout/general/enable';

    const XML_PATH_TITLE = 'fastcheckout/extended/title';
    const XML_PATH_DISCOUNT_VISIBILITY = 'fastcheckout/extended/show_discount';
    const XML_PATH_COMMENT_VISIBILITY = 'fastcheckout/extended/show_comment';
    const XML_PATH_GIFT_MESSAGE_VISIBILITY = 'fastcheckout/extended/show_gift_message';
    const XML_PATH_SUBSCRIBE_VISIBILITY = 'fastcheckout/extended/show_subscribe';
    const XML_PATH_SUBSCRIBE_BY_DEFAULT = 'fastcheckout/extended/subscribe_by_default';
    const XML_PATH_RELOAD_SHIPPING_ON_DISCOUNT = 'fastcheckout/extended/reload_shipping_methods_on_discount';
    const XML_PATH_DEFAULT_SHIPPING_METHOD = 'fastcheckout/extended/default_shipping_method';
    const XML_PATH_DEFAULT_PAYMENT_METHOD = 'fastcheckout/extended/default_payment_method';
    const XML_PATH_PAYMENT_TITLE_TYPE = 'fastcheckout/extended/payment_title_type';
    const XML_PATH_DISPLAY_ALL_METHODS = 'fastcheckout/extended/show_all_ship_methods';
    const XML_PATH_SHIPPING_PAYMENT_MAPPING = 'fastcheckout/extended/shipping_payment_mapping';
    const XML_PATH_REQUIRED_SHIPPING_FIELDS = 'fastcheckout/extended/required_shipping_fields';
    const XML_PATH_REQUIRED_PAYMENT_FIELDS = 'fastcheckout/extended/required_payment_fields';

    public $storeManager;
    public $session;
    public $customerSession;
    public $response = null;
    public $jsonHelper;
    public $request;


    protected $cart;
    protected $quoteFactory;
    protected $regionCollectionFactory;
    protected $design;
    protected $themeFactory;

    /**
     * Per-request memo of canUseHyvaNativeCheckout() (theme/config checks are not free).
     *
     * @var bool|null
     */
    private $canUseHyvaNativeCheckoutCache = null;

    public function __construct(
        Context $context,
        StoreManagerInterface $storeManager,
        CustomerSession $customerSession,
        Session $session,
        JsonHelper $jsonHelper,
        Cart $cart,
        QuoteFactory $quoteFactory,
        CollectionFactory $regionCollectionFactory,
        DesignInterface $design,
        ThemeFactory $themeFactory
    ) {
        parent::__construct($context);
        $this->storeManager = $storeManager;
        $this->session = $session;
        $this->customerSession = $customerSession;
        $this->jsonHelper = $jsonHelper;
        $this->cart = $cart;
        $this->quoteFactory = $quoteFactory;
        $this->regionCollectionFactory = $regionCollectionFactory;
        $this->design = $design;
        $this->themeFactory = $themeFactory;
    }

    public function isEnable()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_ENABLE, ScopeInterface::SCOPE_STORE);
    }

    public function isCheckoutPage()
    {
        return $this->_getRequest()->getModuleName() === 'onepage'
            && $this->isEnable()
            && $this->isModuleOutputEnabled('Kkkonrad_Fastcheckout');
    }

    public function isCurrentlySecure()
    {
        return (bool)$this->storeManager->getStore()->isCurrentlySecure();
    }

    public function getTitle()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_TITLE, ScopeInterface::SCOPE_STORE);
    }

    public function getDefaultShippingMethod()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_DEFAULT_SHIPPING_METHOD, ScopeInterface::SCOPE_STORE);
    }

    public function getDefaultPaymentMethod()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_DEFAULT_PAYMENT_METHOD, ScopeInterface::SCOPE_STORE);
    }

    public function getShippingPaymentMapping()
    {
        $mapping = $this->scopeConfig->getValue(self::XML_PATH_SHIPPING_PAYMENT_MAPPING, ScopeInterface::SCOPE_STORE);

        if (empty($mapping)) {
            return [];
        }

        try {
            $decoded = $this->jsonHelper->jsonDecode($mapping);
            return is_array($decoded) ? $decoded : [];
        } catch (\Exception $e) {
            $this->_logger->warning('Invalid fastcheckout shipping/payment mapping', ['exception' => $e]);
            return [];
        }
    }

    public function hasShippingPaymentMapping(): bool
    {
        foreach ($this->getShippingPaymentMapping() as $rule) {
            if (
                is_array($rule)
                && trim((string)($rule['shipping_method'] ?? '')) !== ''
                && trim((string)($rule['payment_method'] ?? '')) !== ''
            ) {
                return true;
            }
        }

        return false;
    }

    public function getMappedPaymentMethodsForShipping($shippingMethod): array
    {
        $shippingMethod = (string)$shippingMethod;
        if ($shippingMethod === '') {
            return [];
        }

        $mapping = $this->getShippingPaymentMapping();
        if (empty($mapping)) {
            return [];
        }

        $mappedPayments = [];
        foreach ($mapping as $rule) {
            if (
                !is_array($rule) ||
                !isset($rule['shipping_method'], $rule['payment_method']) ||
                (string)$rule['payment_method'] === ''
            ) {
                continue;
            }

            if ($this->shippingMappingRuleMatches((string)$rule['shipping_method'], $shippingMethod)) {
                $mappedPayments[] = (string)$rule['payment_method'];
            }
        }

        return array_values(array_unique($mappedPayments));
    }

    public function isPaymentMethodCodeAllowedByRules($paymentMethodCode, array $allowedPaymentRules): bool
    {
        $paymentMethodCode = (string)$paymentMethodCode;
        if ($paymentMethodCode === '') {
            return false;
        }

        foreach ($allowedPaymentRules as $rule) {
            $rule = trim((string)$rule);
            if ($rule === '') {
                continue;
            }

            if ($rule === $paymentMethodCode) {
                return true;
            }
        }

        return false;
    }

    private function shippingMappingRuleMatches(string $ruleShippingMethod, string $shippingMethod): bool
    {
        $ruleShippingMethod = trim($ruleShippingMethod);
        if ($ruleShippingMethod === '') {
            return false;
        }

        if ($ruleShippingMethod === '*' || $ruleShippingMethod === $shippingMethod) {
            return true;
        }

        $carrierCode = $this->extractCarrierCode($shippingMethod);
        if ($carrierCode === '') {
            return false;
        }

        if ($ruleShippingMethod === $carrierCode || $ruleShippingMethod === $carrierCode . '_*') {
            return true;
        }

        if (substr($ruleShippingMethod, -1) === '*') {
            $prefix = rtrim(substr($ruleShippingMethod, 0, -1), '_');
            return $prefix !== '' && strpos($shippingMethod, $prefix . '_') === 0;
        }

        return false;
    }

    private function extractCarrierCode(string $shippingMethod): string
    {
        $parts = explode('_', $shippingMethod, 2);
        return (string)($parts[0] ?? '');
    }

    public function getRequiredPaymentFields(): array
    {
        $fields = $this->scopeConfig->getValue(self::XML_PATH_REQUIRED_PAYMENT_FIELDS, ScopeInterface::SCOPE_STORE);
        if (empty($fields)) {
            return [];
        }

        try {
            $decoded = $this->jsonHelper->jsonDecode($fields);
            return is_array($decoded) ? $decoded : [];
        } catch (\Exception $e) {
            $this->_logger->warning('Invalid fastcheckout required payment fields', ['exception' => $e]);
            return [];
        }
    }

    public function getRequiredShippingFields(): array
    {
        $fields = $this->scopeConfig->getValue(self::XML_PATH_REQUIRED_SHIPPING_FIELDS, ScopeInterface::SCOPE_STORE);
        if (empty($fields)) {
            return [];
        }

        try {
            $decoded = $this->jsonHelper->jsonDecode($fields);
            return is_array($decoded) ? $decoded : [];
        } catch (\Exception $e) {
            $this->_logger->warning('Invalid fastcheckout required shipping fields', ['exception' => $e]);
            return [];
        }
    }

    public function getRequiredShippingFieldsForMethod($shippingMethod): array
    {
        $shippingMethod = (string)$shippingMethod;
        if ($shippingMethod === '') {
            return [];
        }

        $fieldRules = $this->getRequiredShippingFields();
        if ($fieldRules === []) {
            return [];
        }

        $fieldPaths = [];
        foreach ($fieldRules as $shippingMethodRule => $paths) {
            if (!is_array($paths) || !$this->shippingMappingRuleMatches((string)$shippingMethodRule, $shippingMethod)) {
                continue;
            }

            foreach ($paths as $path) {
                $path = trim((string)$path);
                if ($path !== '') {
                    $fieldPaths[] = $path;
                }
            }
        }

        return array_values(array_unique($fieldPaths));
    }

    public function isShowComment()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_COMMENT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowDiscount()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_DISCOUNT_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowGiftMessage()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_GIFT_MESSAGE_VISIBILITY, ScopeInterface::SCOPE_STORE);
    }

    public function isShowLoginButton()
    {
        return true;
    }

    public function isSuccessPageAccountCreationEnabled()
    {
        return true;
    }

    public function isShowSuccessPage()
    {
        return true;
    }

    public function isShowSubscribe()
    {
        $moduleStatus = $this->isModuleOutputEnabled('Magento_Newsletter');
        return $this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_VISIBILITY, ScopeInterface::SCOPE_STORE)
            && $moduleStatus;
    }

    public function isSubscribeByDefault()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_SUBSCRIBE_BY_DEFAULT, ScopeInterface::SCOPE_STORE);
    }

    public function isReloadShippingOnDiscount()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_RELOAD_SHIPPING_ON_DISCOUNT, ScopeInterface::SCOPE_STORE);
    }

    public function canUseHyvaNativeCheckout()
    {
        if ($this->canUseHyvaNativeCheckoutCache !== null) {
            return $this->canUseHyvaNativeCheckoutCache;
        }

        if (!$this->isEnable() || !$this->isModuleOutputEnabled('Kkkonrad_Fastcheckout')) {
            return $this->canUseHyvaNativeCheckoutCache = false;
        }

        if (!class_exists(\Hyva\Theme\ViewModel\HyvaCsp::class)
            || !class_exists(\Magewirephp\Magewire\Component::class)) {
            return $this->canUseHyvaNativeCheckoutCache = false;
        }

        $themePath = '';
        try {
            $theme = $this->design ? $this->design->getDesignTheme() : null;
            $themePath = $theme ? (string)$theme->getFullPath() : '';
        } catch (\Exception $e) {
            $themePath = '';
        }

        if (!$this->isHyvaThemePath($themePath) && $this->themeFactory !== null) {
            try {
                $themeId = (int)$this->scopeConfig->getValue(
                    'design/theme/theme_id',
                    ScopeInterface::SCOPE_STORE
                );
                if ($themeId > 0) {
                    $themePath = (string)$this->themeFactory->create()
                        ->load($themeId)
                        ->getFullPath();
                }
            } catch (\Exception $e) {
                $themePath = '';
            }
        }

        return $this->canUseHyvaNativeCheckoutCache = $this->isHyvaThemePath($themePath);
    }

    public function isHyvaNativePaymentMethodSupported($methodCode)
    {
        return true;
    }

    private function isHyvaThemePath($themePath)
    {
        $themePath = (string)$themePath;

        return stripos($themePath, 'frontend/Hyva/') === 0
            || stripos($themePath, '/hyva') !== false;
    }

    public function getPaymentTitleType()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PAYMENT_TITLE_TYPE, ScopeInterface::SCOPE_STORE);
    }


    public function getBaseUrl()
    {
        $defaultStore = $this->storeManager->getDefaultStoreView();
        if (!$defaultStore) {
            $allStores = $this->storeManager->getStores();
            if (isset($allStores[0])) {
                $defaultStore = $allStores[0];
            }
        }

        return $defaultStore->getBaseUrl(UrlInterface::URL_TYPE_LINK);
    }

    public function getDisplayAllMethods()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_DISPLAY_ALL_METHODS, ScopeInterface::SCOPE_STORE);
    }

    public function getDefaultShipping()
    {
        $quote = $this->cart->getQuote();
        $shippingMethod = $this->scopeConfig->getValue(self::XML_PATH_DEFAULT_SHIPPING_METHOD, ScopeInterface::SCOPE_STORE);

        if($quote->getShippingAddress() && $quote->getShippingAddress()->getShippingMethod()) {
            $shippingMethod = $quote->getShippingAddress()->getShippingMethod();
        }

        return $shippingMethod;
    }

    public function getDefaultPayment()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_DEFAULT_PAYMENT_METHOD, ScopeInterface::SCOPE_STORE);
    }

    public function getPreSelectedBillingAddressId()
    {
        try {
            $quote = $this->cart->getQuote();
            if ($quote && $quote->getBillingAddress()) {
                return $quote->getBillingAddress()->getCustomerAddressId();
            }
            return '';
        } catch (\Exception $e) {
            return '';
        }
    }

    public function getRegionCollection() {
        $collection = $this->regionCollectionFactory->create();

        if($collection->toArray()) {
            return $collection->toArray()['items'];
        }

        return [];
    }
}
