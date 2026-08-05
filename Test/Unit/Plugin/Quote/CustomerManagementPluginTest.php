<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Quote\CustomerManagementPlugin;
use Magento\Customer\Api\AddressMetadataInterface;
use Magento\Customer\Api\Data\AttributeMetadataInterface;
use Magento\Quote\Model\CustomerManagement;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address;
use PHPUnit\Framework\TestCase;

class CustomerManagementPluginTest extends TestCase
{
    public function testRequiredCoreOmittedFieldIsExposedToMagentoValidation(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);
        $attribute = $this->createMock(AttributeMetadataInterface::class);
        $attribute->method('isRequired')->willReturn(true);
        $metadata = $this->createMock(AddressMetadataInterface::class);
        $metadata->method('getAttributeMetadata')->willReturn($attribute);

        $billing = $this->createMock(Address::class);
        $billing->method('getCustomerAddressId')->willReturn(null);
        $billing->method('getData')->willReturnCallback(
            static fn(string $code) => $code === 'company' ? 'ACME' : null
        );
        $billing->method('getCustomAttribute')->willReturn(null);
        $billing->expects($this->once())->method('setCustomAttribute')->with('company', 'ACME');

        $quote = $this->createMock(Quote::class);
        $quote->method('getCustomerIsGuest')->willReturn(true);
        $quote->method('getBillingAddress')->willReturn($billing);

        $plugin = new CustomerManagementPlugin($helper, $metadata);
        $this->assertSame(
            [$quote],
            $plugin->beforeValidateAddresses($this->createMock(CustomerManagement::class), $quote)
        );
    }

    public function testDisabledModuleLeavesQuoteUntouched(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(false);
        $quote = $this->createMock(Quote::class);
        $quote->expects($this->never())->method('getBillingAddress');

        $plugin = new CustomerManagementPlugin(
            $helper,
            $this->createMock(AddressMetadataInterface::class)
        );

        $this->assertSame(
            [$quote],
            $plugin->beforeValidateAddresses($this->createMock(CustomerManagement::class), $quote)
        );
    }
}
