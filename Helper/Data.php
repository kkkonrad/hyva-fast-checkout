<?php

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

    const XML_PATH_ENABLE = 'iwd_opc/general/enable';

    const XML_PATH_TITLE = 'iwd_opc/extended/title';
    const XML_PATH_IWD_EXPERIENCE = 'iwd_opc/extended/use_iwd_checkout_experience';
    const XML_PATH_DISCOUNT_VISIBILITY = 'iwd_opc/extended/show_discount';
    const XML_PATH_COMMENT_VISIBILITY = 'iwd_opc/extended/show_comment';
    const XML_PATH_GIFT_MESSAGE_VISIBILITY = 'iwd_opc/extended/show_gift_message';
    const XML_PATH_SUBSCRIBE_VISIBILITY = 'iwd_opc/extended/show_subscribe';
    const XML_PATH_SUBSCRIBE_BY_DEFAULT = 'iwd_opc/extended/subscribe_by_default';
    const XML_PATH_RELOAD_SHIPPING_ON_DISCOUNT = 'iwd_opc/extended/reload_shipping_methods_on_discount';
    const XML_PATH_DEFAULT_SHIPPING_METHOD = 'iwd_opc/extended/default_shipping_method';
    const XML_PATH_DEFAULT_PAYMENT_METHOD = 'iwd_opc/extended/default_payment_method';
    const XML_PATH_PAYMENT_TITLE_TYPE = 'iwd_opc/extended/payment_title_type';
    const XML_PATH_DISPLAY_ALL_METHODS = 'iwd_opc/extended/show_all_ship_methods';
    const XML_PATH_SHIPPING_PAYMENT_MAPPING = 'iwd_opc/extended/shipping_payment_mapping';

    const XML_PATH_RESTRICT_PAYMENT_ENABLE = 'iwd_opc/restrict_payment/enable';
    const XML_PATH_RESTRICT_PAYMENT_METHODS = 'iwd_opc/restrict_payment/methods';

    const XML_PATH_GM_AUTOCOMPLETE_ENABLE = 'iwd_opc/extended/gm_autocomplete';
    const XML_PATH_GM_APIKEY = 'iwd_opc/extended/gm_apikey';

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

    public function isLoginAccountCreationEnabled()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_IWD_EXPERIENCE, ScopeInterface::SCOPE_STORE);
    }

    public function isGmAutocompleteEnabled()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_GM_AUTOCOMPLETE_ENABLE, ScopeInterface::SCOPE_STORE);
    }

    public function getGmApikey()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_GM_APIKEY, ScopeInterface::SCOPE_STORE);
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
        return $mapping ? $this->jsonHelper->jsonDecode($mapping) : [];
    }

    public function getRestrictPaymentMethods()
    {
        $methods = $this->scopeConfig->getValue(self::XML_PATH_RESTRICT_PAYMENT_METHODS, ScopeInterface::SCOPE_STORE);
        return $methods ? $this->jsonHelper->jsonDecode($methods) : [];
    }

    public function isRestrictPaymentEnable()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_RESTRICT_PAYMENT_ENABLE, ScopeInterface::SCOPE_STORE);
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

    public function isAssignOrderToCustomer()
    {
        return true;
    }

    public function isReloadShippingOnDiscount()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_RELOAD_SHIPPING_ON_DISCOUNT, ScopeInterface::SCOPE_STORE);
    }

    public function canUseHyvaNativeCheckout()
    {
        if (!$this->isEnable() || !$this->isModuleOutputEnabled('Kkkonrad_Fastcheckout')) {
            return false;
        }

        if (!class_exists(\Hyva\Theme\ViewModel\HyvaCsp::class)
            || !class_exists(\Magewirephp\Magewire\Component::class)) {
            return false;
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

        return $this->isHyvaThemePath($themePath);
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

    public function getPreSelectedBillingAddressId () {
        try {
            $quote = $this->quoteFactory->create()->load($this->cart->getQuote()->getId());
            return $quote->getBillingAddress()->getCustomerAddressId();
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
