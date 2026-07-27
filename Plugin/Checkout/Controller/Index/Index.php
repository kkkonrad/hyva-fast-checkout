<?php

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Index;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\Controller\Result\ForwardFactory;

class Index
{
    private $helper;
    private $forwardFactory;

    public function __construct(
        Helper $helper,
        ForwardFactory $forwardFactory
    ) {
        $this->helper = $helper;
        $this->forwardFactory = $forwardFactory;
    }

    public function aroundExecute($subject, callable $proceed)
    {
        if ($this->helper->canUseHyvaNativeCheckout()) {
            return $this->forwardFactory->create()
                ->setModule('fast-checkout')
                ->setController('index')
                ->forward('index');
        }

        return $proceed();
    }
}
