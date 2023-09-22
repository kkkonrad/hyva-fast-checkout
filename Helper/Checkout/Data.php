<?php

namespace IWD\Opc\Helper\Checkout;

/**
 * Checkout default helper
 *
 * @SuppressWarnings(PHPMD.CouplingBetweenObjects)
 */
class Data extends \Magento\Checkout\Helper\Data
{

    const XML_PATH_IWD_EXPERIENCE = 'iwd_opc/extended/use_iwd_checkout_experience';

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
    
    /**
     * Check is allowed Guest Checkout
     * Use config settings and observer
     *
     * @param \Magento\Quote\Model\Quote $quote
     * @param int|Store $store
     * @return bool
     */
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
        $iwdExperience = $this->scopeConfig->isSetFlag(
            self::XML_PATH_IWD_EXPERIENCE
        );
    
        if ($iwdExperience) {
            $guestCheckout = true;
        }
        if ($guestCheckout) {
            $result = \Magento\Framework\App\ObjectManager::getInstance()->get(\Magento\Framework\DataObject::class);
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
