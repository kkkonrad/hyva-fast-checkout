<?php

namespace IWD\Opc\Model;

use Magento\Checkout\Model\ConfigProviderInterface;
use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository;

class ExtendedCheckoutConfigProvider implements ConfigProviderInterface
{
    public $opcHelper;
    public $checkoutSession;
    public $urlBuilder;
    public $assetRepo;

    public function __construct(
        OpcHelper $opcHelper,
        UrlInterface $urlBuilder,
        Repository $assetRepo,
        CheckoutSession $checkoutSession
    ) {
        $this->assetRepo = $assetRepo;
        $this->opcHelper = $opcHelper;
        $this->urlBuilder = $urlBuilder;
        $this->checkoutSession = $checkoutSession;
    }

    public function getConfig()
    {
        $config = [];
        $config['iwdOpcSettings'] = $this->getSettings();

        return $config;
    }

    public function getViewUrl($fileId)
    {
        $params = ['_secure' => $this->opcHelper->isCurrentlySecure()];
        return $this->assetRepo->getUrlWithParams($fileId, $params);
    }

    public function getSettings()
    {
        $settings = [];
        $settings['isRestrictPaymentEnable'] = $this->opcHelper->isRestrictPaymentEnable();
        $settings['restrictedPaymentMethods'] = $this->opcHelper->getRestrictPaymentMethods();
        $settings['defaultShippingMethod'] = $this->opcHelper->getDefaultShippingMethod();
        $settings['defaultPaymentMethod'] = $this->opcHelper->getDefaultPaymentMethod();
        $settings['isReloadShippingOnDiscount'] = $this->opcHelper->isReloadShippingOnDiscount();
        $settings['paymentTitleType'] = $this->opcHelper->getPaymentTitleType();
        $settings['paymentLogosImages'] = [
            'paypal' => $this->getViewUrl('IWD_Opc::images/paypal_logo.png'),
            'apple_pay' => $this->getViewUrl('IWD_Opc::images/apple_pay_logo.png'),
        ];
        $settings['isCurrentlySecure'] = $this->opcHelper->isCurrentlySecure();
        $settings['isShowComment'] = $this->opcHelper->isShowComment();
        $settings['isShowDiscount'] = $this->opcHelper->isShowDiscount();
        $settings['isShowGiftMessage'] = $this->opcHelper->isShowGiftMessage();
        $settings['isShowSubscribe'] = $this->opcHelper->isShowSubscribe();
        $settings['isSubscribeByDefault'] = $this->opcHelper->isSubscribeByDefault();
        $settings['isShowLoginButton'] = $this->opcHelper->isShowLoginButton();
        $settings['forgotPasswordUrl'] = $this->urlBuilder->getUrl('onepage/index/forgotpasswordpost');
        $settings['logoutUrl'] = $this->urlBuilder->getUrl('customer/account/logout');
        $settings['displayAllMethods'] = $this->opcHelper->getDisplayAllMethods();

        return $settings;
    }
}
