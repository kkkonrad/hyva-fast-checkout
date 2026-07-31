<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Quote\CustomerManagementPlugin;
use Magento\Customer\Api\AddressMetadataInterface;
use Magento\Customer\Api\AddressRepositoryInterface;
use Magento\Customer\Api\Data\AddressInterfaceFactory;
use Magento\Customer\Api\Data\AttributeMetadataInterface;
use Magento\Customer\Model\AddressFactory;
use Magento\Framework\Validator\Factory as ValidatorFactory;
use Magento\Quote\Model\CustomerManagement;
use Magento\Quote\Model\Quote;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class CustomerManagementPluginTest extends TestCase
{
    public function testDisabledModuleUsesMagentoValidation(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(false);

        $this->assertTrue($this->runPlugin($helper, $this->metadata([])));
    }

    /**
     * The forked copy of core validateAddresses() only exists for stores that made
     * company/fax/prefix/suffix required. A standard store must stay on core.
     */
    public function testStandardAddressAttributesKeepMagentoValidation(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);

        $metadata = $this->metadata([
            'company' => false,
            'fax' => false,
            'prefix' => false,
            'suffix' => false,
        ]);

        $this->assertTrue($this->runPlugin($helper, $metadata));
    }

    public function testRequiredCompanyAttributeSwitchesToTheWorkaround(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);

        $metadata = $this->metadata(['company' => true]);

        $this->assertFalse($this->runPlugin($helper, $metadata));
    }

    public function testUnknownAttributeIsTreatedAsNotRequired(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);

        $metadata = $this->createMock(AddressMetadataInterface::class);
        $metadata->method('getAttributeMetadata')
            ->willThrowException(new \Magento\Framework\Exception\NoSuchEntityException(__('nope')));

        $this->assertTrue($this->runPlugin($helper, $metadata));
    }

    /**
     * @return bool whether Magento's own validation ran
     */
    private function runPlugin(Helper $helper, AddressMetadataInterface $metadata): bool
    {
        $quote = $this->createMock(Quote::class);
        $quote->method('getBillingAddress')->willReturn(null);
        $proceeded = false;

        $plugin = new CustomerManagementPlugin(
            $this->createMock(AddressInterfaceFactory::class),
            $this->createMock(ValidatorFactory::class),
            $this->createMock(AddressFactory::class),
            $this->createMock(AddressRepositoryInterface::class),
            $helper,
            $metadata
        );

        try {
            $plugin->aroundValidateAddresses(
                $this->createMock(CustomerManagement::class),
                static function (Quote $validatedQuote) use ($quote, &$proceeded): void {
                    $proceeded = $validatedQuote === $quote;
                },
                $quote
            );
        } catch (\Throwable $exception) {
            // The forked branch dereferences the quote addresses; a null billing address
            // there proves the plugin did not delegate to Magento.
        }

        return $proceeded;
    }

    /**
     * @param array<string, bool> $required
     * @return AddressMetadataInterface&MockObject
     */
    private function metadata(array $required)
    {
        $metadata = $this->createMock(AddressMetadataInterface::class);
        $metadata->method('getAttributeMetadata')
            ->willReturnCallback(function (string $code) use ($required) {
                $attribute = $this->createMock(AttributeMetadataInterface::class);
                $attribute->method('isRequired')->willReturn($required[$code] ?? false);

                return $attribute;
            });

        return $metadata;
    }
}
