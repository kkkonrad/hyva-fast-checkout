<?php

namespace Kkkonrad\Fastcheckout\Helper\Checkout;

/**
 * Checkout default helper
 *
 * @SuppressWarnings(PHPMD.CouplingBetweenObjects)
 */
class Data extends \Magento\Checkout\Helper\Data
{

    /**
     * Get onepage checkout availability
     *
     * @return bool
     */
    public function canOnepageCheckout()
    {
        return (bool)$this->scopeConfig->getValue(
            'checkout/options/onepage_checkout_enabled',
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
    }
    
    public function isAllowedGuestCheckout(\Magento\Quote\Model\Quote $quote, $store = null)
    {
        if ($store === null) {
            $store = $quote->getStoreId();
        }
        $guestCheckout = $this->scopeConfig->isSetFlag(
            self::XML_PATH_GUEST_CHECKOUT,
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE,
            $store
        );
    
        if ($guestCheckout) {
            $result = new \Magento\Framework\DataObject();
            $result->setIsAllowed($guestCheckout);
            $this->_eventManager->dispatch(
                'checkout_allow_guest',
                ['quote' => $quote, 'store' => $store, 'result' => $result]
            );

            $guestCheckout = $result->getIsAllowed();
        }
    
        return $guestCheckout;
    }
    
    /**
     * Check if user must be logged during checkout process
     *
     * @return boolean
     * @codeCoverageIgnore
     */
    public function isCustomerMustBeLogged()
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_CUSTOMER_MUST_BE_LOGGED,
            \Magento\Store\Model\ScopeInterface::SCOPE_STORE
        );
    }
}
