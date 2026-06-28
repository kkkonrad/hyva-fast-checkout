<?php

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Index;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\UrlInterface;

class Index
{
    private $helper;
    private $url;
    private $redirectFactory;

    public function __construct(
        Helper $helper,
        RedirectFactory $redirectFactory,
        UrlInterface $url
    ) {
        $this->helper = $helper;
        $this->redirectFactory = $redirectFactory;
        $this->url = $url;
    }

    public function aroundExecute($subject, callable $proceed)
    {
        if ($this->helper->canUseHyvaNativeCheckout()) {
            return $this->redirectFactory->create()
                ->setUrl($this->url->getUrl('fast-checkout', ['_secure' => true]));
        }

        return $proceed();
    }
}
