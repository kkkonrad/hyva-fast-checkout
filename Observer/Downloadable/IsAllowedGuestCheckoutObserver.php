<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */
namespace IWD\Opc\Observer\Downloadable;

use \Magento\Store\Model\ScopeInterface;

class IsAllowedGuestCheckoutObserver extends \Magento\Downloadable\Observer\IsAllowedGuestCheckoutObserver
{
    /**
     *  Xml path to disable checkout
     */
    const XML_PATH_DISABLE_GUEST_CHECKOUT = 'catalog/downloadable/disable_guest_checkout';

    /**
     * Core store config
     *
     * @var \Magento\Framework\App\Config\ScopeConfigInterface
     */
    protected $scopeConfig;

    /**
     * @param \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig
    ) {
        $this->scopeConfig = $scopeConfig;
    }

    /**
     * Check is allowed guest checkout if quote contain downloadable product(s)
     * Overriding original to allow guest checkout for downloadable
     * @param \Magento\Framework\Event\Observer $observer
     * @return $this
     */
    public function execute(\Magento\Framework\Event\Observer $observer)
    {
        $store = $observer->getEvent()->getStore();
        $result = $observer->getEvent()->getResult();

        $result->setIsAllowed(true);

        if (!$this->scopeConfig->isSetFlag(
            self::XML_PATH_DISABLE_GUEST_CHECKOUT,
            ScopeInterface::SCOPE_STORE,
            $store
        )) {
            return $this;
        }

        /**
         * @var $quote \Magento\Quote\Model\Quote
         */
        $quote = $observer->getEvent()->getQuote();

        foreach ($quote->getAllItems() as $item) {
            if (($product = $item->getProduct())
                && $product->getTypeId() == \Magento\Downloadable\Model\Product\Type::TYPE_DOWNLOADABLE
            ) {
                $result->setIsAllowed(true);
                break;
            }
        }

        return $this;
    }
}
