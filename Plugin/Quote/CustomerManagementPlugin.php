<?php
/**
 * Copyright © Kkkonrad. All rights reserved.
 */
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Quote\Model\Quote as QuoteEntity;
use Magento\Quote\Model\CustomerManagement;

class CustomerManagementPlugin
{
    /**
     * @var \Magento\Customer\Api\Data\AddressInterfaceFactory
     */
    private $customerAddressFactory;

    /**
     * @var \Magento\Framework\Validator\Factory
     */
    private $validatorFactory;

    /**
     * @var \Magento\Customer\Model\AddressFactory
     */
    private $addressFactory;

    /**
     * @var \Magento\Customer\Api\AddressRepositoryInterface
     */
    private $customerAddressRepository;

    /**
     * CustomerManagementPlugin constructor.
     *
     * @param \Magento\Customer\Api\Data\AddressInterfaceFactory $customerAddressFactory
     * @param \Magento\Framework\Validator\Factory $validatorFactory
     * @param \Magento\Customer\Model\AddressFactory $addressFactory
     * @param \Magento\Customer\Api\AddressRepositoryInterface $customerAddressRepository
     */
    public function __construct(
        \Magento\Customer\Api\Data\AddressInterfaceFactory $customerAddressFactory,
        \Magento\Framework\Validator\Factory $validatorFactory,
        \Magento\Customer\Model\AddressFactory $addressFactory,
        \Magento\Customer\Api\AddressRepositoryInterface $customerAddressRepository
    ) {
        $this->customerAddressFactory = $customerAddressFactory;
        $this->validatorFactory = $validatorFactory;
        $this->addressFactory = $addressFactory;
        $this->customerAddressRepository = $customerAddressRepository;
    }

    /**
     * Around validateAddresses to fix Magento 2 core bug where required customer address fields
     * (like company, fax, prefix, suffix) fail validation for guests because they are not copied.
     *
     * @param CustomerManagement $subject
     * @param callable $proceed
     * @param QuoteEntity $quote
     * @return void
     * @throws \Magento\Framework\Validator\Exception
     */
    public function aroundValidateAddresses(
        CustomerManagement $subject,
        callable $proceed,
        QuoteEntity $quote
    ) {
        $addresses = [];
        if ($quote->getBillingAddress()->getCustomerAddressId()) {
            $addresses[] = $this->customerAddressRepository->getById(
                $quote->getBillingAddress()->getCustomerAddressId()
            );
        }
        if ($quote->getShippingAddress()->getCustomerAddressId()) {
            $addresses[] = $this->customerAddressRepository->getById(
                $quote->getShippingAddress()->getCustomerAddressId()
            );
        }
        if (empty($addresses) && $quote->getCustomerIsGuest()) {
            $billingAddress = $quote->getBillingAddress();
            $customerAddress = $this->customerAddressFactory->create();
            $customerAddress->setFirstname($billingAddress->getFirstname());
            $customerAddress->setLastname($billingAddress->getLastname());
            $customerAddress->setStreet($billingAddress->getStreet());
            $customerAddress->setCity($billingAddress->getCity());
            $customerAddress->setPostcode($billingAddress->getPostcode());
            $customerAddress->setTelephone($billingAddress->getTelephone());
            $customerAddress->setCountryId($billingAddress->getCountryId());
            $customerAddress->setCompany($billingAddress->getCompany());
            $customerAddress->setFax($billingAddress->getFax());
            $customerAddress->setPrefix($billingAddress->getPrefix());
            $customerAddress->setSuffix($billingAddress->getSuffix());
            $customerAddress->setCustomAttributes($billingAddress->getCustomAttributes());
            $addresses[] = $customerAddress;
        }
        foreach ($addresses as $address) {
            $validator = $this->validatorFactory->createValidator('customer_address', 'save');
            $addressModel = $this->addressFactory->create();
            $addressModel->updateData($address);
            if (!$validator->isValid($addressModel)) {
                throw new \Magento\Framework\Validator\Exception(
                    null,
                    null,
                    $validator->getMessages()
                );
            }
        }
    }
}
