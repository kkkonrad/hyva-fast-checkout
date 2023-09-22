<?php

namespace IWD\Opc\Model\Customer;

class AccountManagement extends \Magento\Customer\Model\AccountManagement
{
    /**
     * @param \Magento\Customer\Api\Data\CustomerInterface $customer
     * @param string $redirectUrl
     * @throws \ReflectionException
     */
    protected function sendEmailConfirmation(\Magento\Customer\Api\Data\CustomerInterface $customer, $redirectUrl, $extension = [])
    {
        $om = \Magento\Framework\App\ObjectManager::getInstance();
        $logger = $om->get("\Psr\Log\LoggerInterface");

        try {
            $customerRegistry = $om->get('Magento\Customer\Model\CustomerRegistry');
            $registry = $om->get('\Magento\Framework\Registry');

            $hash = $customerRegistry->retrieveSecureData($customer->getId())->getPasswordHash();
            $templateType = self::NEW_ACCOUNT_EMAIL_REGISTERED;
            if ($this->isConfirmationRequired($customer) && $hash != '') {
                $templateType = self::NEW_ACCOUNT_EMAIL_CONFIRMATION;
            } elseif ($hash == '') {
                $templateType = self::NEW_ACCOUNT_EMAIL_REGISTERED_NO_PASSWORD;
            }
            if (!$registry->registry('isIWDcreateAccount')) {
                $method = new \ReflectionMethod($this,'getEmailNotification');
                $method->setAccessible(true);
                $method->invoke($this)->newAccount($customer, $templateType, $redirectUrl, $customer->getStoreId());
            }
        } catch (\Magento\Framework\Exception\MailException $e) {
            // If we are not able to send a new account email, this should be ignored
            $logger->critical($e);
        } catch (\UnexpectedValueException $e) {
            $logger->error($e);
        }
    }
}
