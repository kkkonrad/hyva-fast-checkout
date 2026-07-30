<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Quote\CustomerManagementPlugin;
use Magento\Customer\Api\AddressRepositoryInterface;
use Magento\Customer\Api\Data\AddressInterfaceFactory;
use Magento\Customer\Model\AddressFactory;
use Magento\Framework\Validator\Factory as ValidatorFactory;
use Magento\Quote\Model\CustomerManagement;
use Magento\Quote\Model\Quote;
use PHPUnit\Framework\TestCase;

class CustomerManagementPluginTest extends TestCase
{
    public function testDisabledModuleUsesMagentoValidation(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(false);
        $quote = $this->createMock(Quote::class);
        $called = false;
        $plugin = new CustomerManagementPlugin(
            $this->createMock(AddressInterfaceFactory::class),
            $this->createMock(ValidatorFactory::class),
            $this->createMock(AddressFactory::class),
            $this->createMock(AddressRepositoryInterface::class),
            $helper
        );

        $plugin->aroundValidateAddresses(
            $this->createMock(CustomerManagement::class),
            static function (Quote $validatedQuote) use ($quote, &$called): void {
                $called = $validatedQuote === $quote;
            },
            $quote
        );

        $this->assertTrue($called);
    }
}
