<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Customer\Api\AddressMetadataInterface;
use Magento\Quote\Model\CustomerManagement;
use Magento\Quote\Model\Quote;

/** Let core validate addresses after exposing fields it otherwise omits. */
class CustomerManagementPlugin
{
    private const CORE_OMITTED_ATTRIBUTES = ['company', 'fax', 'prefix', 'suffix'];

    private Helper $helper;
    private AddressMetadataInterface $addressMetadata;

    /** @var array<string, bool> */
    private array $required = [];

    public function __construct(Helper $helper, AddressMetadataInterface $addressMetadata)
    {
        $this->helper = $helper;
        $this->addressMetadata = $addressMetadata;
    }

    /**
     * Magento copies custom attributes into its validation DTO but omits four
     * standard optional fields. Mirror only fields configured as required, then
     * let CustomerManagement::validateAddresses() run unchanged.
     *
     * @return array{0: Quote}
     */
    public function beforeValidateAddresses(CustomerManagement $subject, Quote $quote): array
    {
        if (!$this->helper->isEnable() || !$quote->getCustomerIsGuest()) {
            return [$quote];
        }

        $billing = $quote->getBillingAddress();
        if (!$billing || $billing->getCustomerAddressId()) {
            return [$quote];
        }

        foreach (self::CORE_OMITTED_ATTRIBUTES as $code) {
            $value = $billing->getData($code);
            if (!$this->isRequired($code) || $value === null || $value === '') {
                continue;
            }
            if (method_exists($billing, 'getCustomAttribute') && $billing->getCustomAttribute($code)) {
                continue;
            }
            if (method_exists($billing, 'setCustomAttribute')) {
                $billing->setCustomAttribute($code, $value);
            }
        }

        return [$quote];
    }

    private function isRequired(string $code): bool
    {
        if (!array_key_exists($code, $this->required)) {
            try {
                $this->required[$code] = $this->addressMetadata
                    ->getAttributeMetadata($code)
                    ->isRequired();
            } catch (\Throwable $exception) {
                $this->required[$code] = false;
            }
        }

        return $this->required[$code];
    }
}
