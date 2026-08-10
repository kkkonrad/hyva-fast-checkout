<?php

namespace Kkkonrad\Fastcheckout\Block\Onepage;

use Magento\Checkout\Block\Onepage\Success as CheckoutSuccess;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Sales\Model\Order\Config;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Customer\Model\Session as CustomerSession;

class Success extends CheckoutSuccess
{
    /** @var CustomerSession */
    public $customerSession;

    /** @var Helper */
    public $helper;

    public function __construct(
        Context $context,
        CheckoutSession $checkoutSession,
        Config $orderConfig,
        HttpContext $httpContext,
        CustomerSession $customerSession,
        Helper $helper,
        array $data = []
    ) {
        $data['module_name'] = 'Magento_Checkout';
        parent::__construct($context, $checkoutSession, $orderConfig, $httpContext, $data);
        $this->customerSession = $customerSession;
        $this->helper = $helper;
    }

    protected function _toHtml()
    {
        if ($this->helper->isEnable() &&
            $this->helper->isModuleOutputEnabled('Kkkonrad_Fastcheckout')) {
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

    public function isCustomerLoggedIn()
    {
        return $this->customerSession->isLoggedIn();
    }

}
