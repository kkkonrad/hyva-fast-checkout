<?php
/**
 * Copyright © Kkkonrad. All rights reserved.
 */
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Quote\Model\Quote as QuoteEntity;
use Magento\Quote\Model\CustomerManagement;

class CustomerManagementPlugin
{
    /**
     * Customer address attributes that Magento's own validateAddresses() does not copy
     * from the guest quote address. Only a store that made one of them required is
     * affected by the core bug this plugin works around.
     */
    private const UNCOPIED_ADDRESS_ATTRIBUTES = ['company', 'fax', 'prefix', 'suffix'];

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

    /** @var Helper */
    private $helper;

    /** @var \Magento\Customer\Api\AddressMetadataInterface */
    private $addressMetadata;

    /** @var bool|null */
    private $workaroundNeeded;

    /**
     * CustomerManagementPlugin constructor.
     *
     * @param \Magento\Customer\Api\Data\AddressInterfaceFactory $customerAddressFactory
     * @param \Magento\Framework\Validator\Factory $validatorFactory
     * @param \Magento\Customer\Model\AddressFactory $addressFactory
     * @param \Magento\Customer\Api\AddressRepositoryInterface $customerAddressRepository
     * @param Helper $helper
     * @param \Magento\Customer\Api\AddressMetadataInterface $addressMetadata
     */
    public function __construct(
        \Magento\Customer\Api\Data\AddressInterfaceFactory $customerAddressFactory,
        \Magento\Framework\Validator\Factory $validatorFactory,
        \Magento\Customer\Model\AddressFactory $addressFactory,
        \Magento\Customer\Api\AddressRepositoryInterface $customerAddressRepository,
        Helper $helper,
        \Magento\Customer\Api\AddressMetadataInterface $addressMetadata
    ) {
        $this->customerAddressFactory = $customerAddressFactory;
        $this->validatorFactory = $validatorFactory;
        $this->addressFactory = $addressFactory;
        $this->customerAddressRepository = $customerAddressRepository;
        $this->helper = $helper;
        $this->addressMetadata = $addressMetadata;
    }

    /**
     * Is any attribute that core forgets to copy actually required in this store?
     *
     * Keeping the answer false means checkout runs Magento's own validateAddresses(),
     * so the forked copy below stays dormant on a standard configuration.
     */
    private function isWorkaroundNeeded(): bool
    {
        if ($this->workaroundNeeded !== null) {
            return $this->workaroundNeeded;
        }

        $this->workaroundNeeded = false;
        foreach (self::UNCOPIED_ADDRESS_ATTRIBUTES as $attributeCode) {
            try {
                if ($this->addressMetadata->getAttributeMetadata($attributeCode)->isRequired()) {
                    $this->workaroundNeeded = true;
                    break;
                }
            } catch (\Throwable $exception) {
                // Unknown attribute cannot be required.
            }
        }

        return $this->workaroundNeeded;
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
        if (!$this->helper->isEnable() || !$this->isWorkaroundNeeded()) {
            return $proceed($quote);
        }

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
