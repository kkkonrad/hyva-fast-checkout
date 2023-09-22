<?php

namespace IWD\Opc\Helper;

use Magento\Framework\App\Helper\Context;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\HTTP\Adapter\CurlFactory;
use Magento\Framework\Message\Session as Session;
use Magento\Framework\App\Config\ConfigResource\ConfigInterface;
use Magento\Customer\Model\Session as CustomerSession;
use IWD\Opc\Model\FlagFactory;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\App\Helper\AbstractHelper;
use Magento\Framework\UrlInterface;
use \Magento\Framework\Mail\Template\TransportBuilder;
use Magento\Store\Model\ScopeInterface;
use Magento\Checkout\Model\Cart;

class Data extends AbstractHelper
{

    const XML_PATH_ENABLE = 'iwd_opc/general/enable';
    const XML_PATH_CHECKOUT_SUITE_DESIGN = 'iwd_opc/general/checkout_suite_design';

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

    const XML_PATH_RESTRICT_PAYMENT_ENABLE = 'iwd_opc/restrict_payment/enable';
    const XML_PATH_RESTRICT_PAYMENT_METHODS = 'iwd_opc/restrict_payment/methods';

    const XML_PATH_GA_AB_TEST_ENABLE = 'iwd_opc/ga_ab_test/enable';
    const XML_PATH_GA_AB_TEST_CODE = 'iwd_opc/ga_ab_test/code';

    const XML_PATH_GM_AUTOCOMPLETE_ENABLE = 'iwd_opc/extended/gm_autocomplete';
    const XML_PATH_GM_APIKEY = 'iwd_opc/extended/gm_apikey';


    //Layout
    const XML_PATH_DESKTOP_RESOLUTION = 'iwd_opc/design/layout/desktop';
    const XML_PATH_MOBILE_RESOLUTION = 'iwd_opc/design/layout/mobile';
    const XML_PATH_TABLET_RESOLUTION = 'iwd_opc/design/layout/tablet';
    const XML_PATH_ADDRESS_TYPE_ORDER = 'iwd_opc/design/layout/address_type_order';

    //Style
    const XML_PATH_FONT_FAMILY = 'iwd_opc/design/style/font';

    const XML_PATH_MAIN_BACKGROUND = 'iwd_opc/design/style/page_background';
    const XML_PATH_SUMMARY_BACKGROUND = 'iwd_opc/design/style/sidebar_background';

    const XML_PATH_MAIN_COLOR = 'iwd_opc/design/style/body_text_color';
    const XML_PATH_HEADING_COLOR = 'iwd_opc/design/style/heading_text_color';
    const XML_PATH_LINK_COLOR = 'iwd_opc/design/style/link_color';
    const XML_PATH_HIGHLIGHT_COLOR = 'iwd_opc/design/style/input_highlight_color';

    const XML_PATH_PRIMARY_BUTTON_BACKGROUND = 'iwd_opc/design/style/primary_btn_background';
    const XML_PATH_PRIMARY_BUTTON_TEXT_COLOR = 'iwd_opc/design/style/primary_btn_text_color';

    const XML_PATH_SECONDARY_BUTTON_BACKGROUND = 'iwd_opc/design/style/secondary_btn_background';
    const XML_PATH_SECONDARY_BUTTON_TEXT_COLOR = 'iwd_opc/design/style/secondary_btn_text_color';

    public $storeManager;
    public $resourceConfig;
    public $curlFactory;
    public $session;
    public $customerSession;
    public $flagFactory;
    public $response = null;
    public $jsonHelper;
    public $request;
    protected $transportBuilder;
    protected $cart;

    public function __construct(
        Context $context,
        StoreManagerInterface $storeManager,
        CustomerSession $customerSession,
        CurlFactory $curlFactory,
        Session $session,
        ConfigInterface $resourceConfig,
        FlagFactory $flagFactory,
        JsonHelper $jsonHelper,
        TransportBuilder $transportBuilder,
        Cart $cart
    ) {
        parent::__construct($context);
        $this->resourceConfig = $resourceConfig;
        $this->storeManager = $storeManager;
        $this->curlFactory = $curlFactory;
        $this->session = $session;
        $this->customerSession = $customerSession;
        $this->flagFactory = $flagFactory;
        $this->jsonHelper = $jsonHelper;
        $this->transportBuilder = $transportBuilder;
        $this->cart = $cart;
    }

    public function isEnable()
    {
        $status = $this->scopeConfig->getValue(self::XML_PATH_ENABLE, ScopeInterface::SCOPE_STORE);
        return (bool)$status;
    }

    public function isCheckoutDesign()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_CHECKOUT_SUITE_DESIGN, ScopeInterface::SCOPE_STORE);
    }

    public function isLoginAccountCreationEnabled()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_IWD_EXPERIENCE, ScopeInterface::SCOPE_STORE);
    }

    public function isGaAbEnable()
    {
        return (bool)$this->scopeConfig->getValue(self::XML_PATH_GA_AB_TEST_ENABLE, ScopeInterface::SCOPE_STORE);
    }

    public function getGaAbCode()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_GA_AB_TEST_CODE, ScopeInterface::SCOPE_STORE );
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
            && $this->isCheckoutDesign()
            && $this->isModuleOutputEnabled('IWD_Opc');
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

    public function getPaymentTitleType()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PAYMENT_TITLE_TYPE, ScopeInterface::SCOPE_STORE);
    }

    public function getClientEmail()
    {
        return trim($this->scopeConfig->getValue('iwd_opc/general/license_email'));
    }

    public function isBluePayEnabled()
    {
        return false;
    }

    public function setModuleActive($isActive)
    {
        $this->resourceConfig->saveConfig(self::XML_PATH_ENABLE, (int)$isActive, 'default', 0);
    }

    public function changeModuleOutput($outputDisabled)
    {
        $this->resourceConfig->saveConfig('advanced/modules_disable_output/IWD_Opc', $outputDisabled, 'default', 0);
    }

    public function getLicensingInformation()
    {
        return '<a href="https://www.iwdagency.com/help/general-information/managing-your-product-license">
                    licensing information
                </a>';
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

    public function getMainBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MAIN_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    public function getMainColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MAIN_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getSummaryBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SUMMARY_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    public function getHeadingColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_HEADING_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getLinkColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_LINK_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getHighlightColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_HIGHLIGHT_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getPrimaryButtonBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PRIMARY_BUTTON_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    public function getPrimaryButtonTextColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_PRIMARY_BUTTON_TEXT_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getSecondaryButtonBackground()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SECONDARY_BUTTON_BACKGROUND, ScopeInterface::SCOPE_STORE);
    }

    public function getSecondaryButtonTextColor()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_SECONDARY_BUTTON_TEXT_COLOR, ScopeInterface::SCOPE_STORE);
    }

    public function getFontFamily()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_FONT_FAMILY, ScopeInterface::SCOPE_STORE);
    }

    public function getDesktopResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_DESKTOP_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    public function getMobileResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_MOBILE_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    public function getTabletResolution()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_TABLET_RESOLUTION, ScopeInterface::SCOPE_STORE);
    }

    public function getAddressTypeOrder()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_ADDRESS_TYPE_ORDER, ScopeInterface::SCOPE_STORE);
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
}
