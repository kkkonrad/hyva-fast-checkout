<?php

namespace Kkkonrad\Fastcheckout\Model;

use Magento\Checkout\Model\ConfigProviderInterface;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository;

class ExtendedCheckoutConfigProvider implements ConfigProviderInterface
{
    public $helper;
    public $checkoutSession;
    public $urlBuilder;
    public $assetRepo;

    public function __construct(
        Helper $helper,
        UrlInterface $urlBuilder,
        Repository $assetRepo,
        CheckoutSession $checkoutSession
    ) {
        $this->assetRepo = $assetRepo;
        $this->helper = $helper;
        $this->urlBuilder = $urlBuilder;
        $this->checkoutSession = $checkoutSession;
    }

    public function getConfig()
    {
        $config = [];
        $config['fastcheckoutSettings'] = $this->getSettings();

        return $config;
    }

    public function getViewUrl($fileId)
    {
        $params = ['_secure' => $this->helper->isCurrentlySecure()];
        return $this->assetRepo->getUrlWithParams($fileId, $params);
    }

    public function getSettings()
    {
        $settings = [];
        $settings['isRestrictPaymentEnable'] = $this->helper->isRestrictPaymentEnable();
        $settings['restrictedPaymentMethods'] = $this->helper->getRestrictPaymentMethods();
        $settings['defaultShippingMethod'] = $this->helper->getDefaultShippingMethod();
        $settings['defaultPaymentMethod'] = $this->helper->getDefaultPaymentMethod();
        $settings['shippingPaymentMapping'] = $this->helper->getShippingPaymentMapping();
        $settings['isReloadShippingOnDiscount'] = $this->helper->isReloadShippingOnDiscount();
        $settings['paymentTitleType'] = $this->helper->getPaymentTitleType();
        $settings['paymentLogosImages'] = [
            'paypal' => $this->getViewUrl('Kkkonrad_Fastcheckout::images/paypal_logo.png'),
            'apple_pay' => $this->getViewUrl('Kkkonrad_Fastcheckout::images/apple_pay_logo.png'),
        ];
        $settings['isCurrentlySecure'] = $this->helper->isCurrentlySecure();
        $settings['isShowComment'] = $this->helper->isShowComment();
        $settings['isShowDiscount'] = $this->helper->isShowDiscount();
        $settings['isShowGiftMessage'] = $this->helper->isShowGiftMessage();
        $settings['isShowSubscribe'] = $this->helper->isShowSubscribe();
        $settings['isSubscribeByDefault'] = $this->helper->isSubscribeByDefault();
        $settings['isShowLoginButton'] = $this->helper->isShowLoginButton();
        $settings['forgotPasswordUrl'] = $this->urlBuilder->getUrl('onepage/index/forgotpasswordpost');
        $settings['logoutUrl'] = $this->urlBuilder->getUrl('customer/account/logout');
        $settings['displayAllMethods'] = $this->helper->getDisplayAllMethods();

        return $settings;
    }
}
