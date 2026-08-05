<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\View\LayoutInterface;

class AddCheckoutLayoutHandle implements ObserverInterface
{
    private Helper $helper;

    public function __construct(Helper $helper)
    {
        $this->helper = $helper;
    }

    public function execute(Observer $observer): void
    {
        $layout = $observer->getData('layout');
        if (
            $observer->getData('full_action_name') === 'checkout_index_index' &&
            $this->helper->canUseHyvaNativeCheckout() &&
            $layout instanceof LayoutInterface
        ) {
            $layout->getUpdate()->addHandle('fastcheckout_index_index');
        }
    }
}
