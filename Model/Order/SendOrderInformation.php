<?php

namespace IWD\Opc\Model\Order;

use Magento\Framework\HTTP\Client\Curl;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\Session\SessionManager;

class SendOrderInformation
{

    const ORDER_ID = 'order_id';
    const SHIPPING_METHOD_TITLE = 'shipping_method_title';
    const SHIPPING_METHOD_CODE = 'shipping_method_code';
    const PAYMENT_METHOD_TITLE = 'payment_method_title';
    const PAYMENT_METHOD_CODE = 'payment_method_code';
    const CURRENCY = 'currency';
    const TOTAL = 'total';
    const STORE_URL = 'store_url';
    const PLATFORM = 'platform_name_version';
    const ORDER_STATUS = 'order_status';
    const CUSTOMER_SESSION_ID = 'customer_session_id';
    const CUSTOMER_EMAIL = 'customer_email';
    const GUEST_CUSTOMER = 'guest_customer';
    const PAYMENT_GATEWAY_MODE = 'payment_gateway_mode';
    const BN_CODE = 'bn_code';
    const PAGE_LAYOUT = 'page_layout';
    const COUPON_CODE = 'coupon_used';
    const TRACK_SYSTEM_URL = 'https://38d21773a4.nxcli.net/orders/save'; //todo: remove later


    /**
     * @var Curl
     */
    private $curl;

    /**
     * @var StoreManagerInterface
     */
    protected $_storeManager;

    /**
     * @var SessionManager
     */
    protected $sessionManager;


    /**
     * @param Curl $curl
     */
    public function __construct(
        Curl $curl,
        StoreManagerInterface $storeManager,
        SessionManager $sessionManager
    )
    {
        $this->curl = $curl;
        $this->_storeManager = $storeManager;
        $this->sessionManager = $sessionManager;
    }

    /**
     * @param $order
     */
    public function sendOrderInformation($order)
    {
        $payment = $order->getPayment();
        $method = $payment->getMethodInstance();
        $body = [
            self::ORDER_ID              => $order->getRealOrderId(),
            self::SHIPPING_METHOD_TITLE => $order->getShippingDescription(),
            self::SHIPPING_METHOD_CODE  => $order->getShippingMethod(),
            self::PAYMENT_METHOD_TITLE  => $method->getTitle(),
            self::PAYMENT_METHOD_CODE   => $method->getCode(),
            self::CURRENCY              => $order->getOrderCurrencyCode(),
            self::TOTAL                 => $order->getGrandTotal(),
            self::STORE_URL             => $this->_storeManager->getStore()->getBaseUrl(),
            self::PLATFORM              => 'Magento 2 OPC',
            self::ORDER_STATUS          => $order->getStatusLabel(),
            self::CUSTOMER_SESSION_ID   => $this->sessionManager->getSessionId(),
            self::CUSTOMER_EMAIL        => $order->getCustomerEmail(),
            self::GUEST_CUSTOMER        => $order->getCustomerIsGuest() ? 'YES' : 'NO',
            self::PAYMENT_GATEWAY_MODE  => $method->getConfigData('environment') ? $method->getConfigData('environment') :
                ($method->getConfigData('sandbox_flag') == 1 ? 'sandbox' : 'live'),
            self::BN_CODE               => 'IWD_SP_PCP',
            self::PAGE_LAYOUT           => 'onepage',
            self::COUPON_CODE           => $order->getCouponCode() ? 'YES' : 'NO',
        ];

        $this->curl->post(self::TRACK_SYSTEM_URL, $body);
    }
}
