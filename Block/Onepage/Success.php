<?php

namespace Kkkonrad\Fastcheckout\Block\Onepage;

use Magento\Checkout\Block\Onepage\Success as CheckoutSuccess;
use Kkkonrad\Fastcheckout\Helper\Data as OpcHelper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Sales\Model\Order\Config;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Customer\Model\Registration;
use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Sales\Model\Order\Address\Validator;
use Magento\Sales\Api\OrderRepositoryInterface;

class Success extends CheckoutSuccess
{
    /** @var Registration */
    public $registration;

    /** @var AccountManagementInterface */
    public $accountManagement;

    /** @var CustomerSession */
    public $customerSession;

    /** @var Validator */
    public $addressValidator;

    /** @var OrderRepositoryInterface */
    public $orderRepository;

    /** @var OpcHelper */
    public $opcHelper;

    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        Config $orderConfig,
        HttpContext $httpContext,
        Registration $registration,
        AccountManagementInterface $accountManagement,
        CustomerSession $customerSession,
        Validator $addressValidator,
        OrderRepositoryInterface $orderRepository,
        OpcHelper $opcHelper,
        array $data = []
    ) {
        $data['module_name'] = 'Magento_Checkout';
        parent::__construct($context, $checkoutSession, $orderConfig, $httpContext, $data);
        $this->accountManagement = $accountManagement;
        $this->registration = $registration;
        $this->customerSession = $customerSession;
        $this->addressValidator = $addressValidator;
        $this->orderRepository = $orderRepository;
        $this->opcHelper = $opcHelper;
    }

    protected function _toHtml()
    {
        if ($this->opcHelper->isEnable() &&
            $this->opcHelper->isModuleOutputEnabled('Kkkonrad_Fastcheckout')) {
            $this->setTemplate('Kkkonrad_Fastcheckout::success/success.phtml');
            if ($this->getNameInLayout() === 'checkout.success.print.button') {
                return '';
            }
        }

        return parent::_toHtml();
    }

    public function getCustomerAccountUrl()
    {
        return $this->getUrl('customer/account');
    }

    public function getLogInUrl()
    {
        return $this->getUrl('customer/account/login');
    }

    public function getStoreName()
    {
        return $this->_storeManager->getStore()->getName();
    }

    public function getEmailAddress()
    {
        return $this->_checkoutSession->getLastRealOrder()->getCustomerEmail();
    }

    public function isCustomerLoggedIn()
    {
        return $this->customerSession->isLoggedIn();
    }

    public function getOrder()
    {
        return $this->orderRepository->get($this->_checkoutSession->getLastOrderId());
    }
}
