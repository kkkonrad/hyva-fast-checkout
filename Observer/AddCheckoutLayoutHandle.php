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
        if (!$layout instanceof LayoutInterface || !$this->helper->canUseHyvaNativeCheckout()) {
            return;
        }

        $action = $observer->getData('full_action_name');
        if ($action === 'checkout_index_index') {
            $layout->getUpdate()->addHandle('fastcheckout_index_index');
        } elseif ($action === 'checkout_onepage_success') {
            $layout->getUpdate()->addHandle('fastcheckout_checkout_onepage_success');
        }
    }
}
