<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Magewire;

use Kkkonrad\Fastcheckout\Magewire\Checkout;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\ShippingMethodManagementInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Quote\Api\Data\PaymentMethodInterface;
use Magento\Customer\Api\AddressRepositoryInterface;
use Magento\Customer\Api\Data\AddressInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Directory\Model\ResourceModel\Country\CollectionFactory as CountryCollectionFactory;
use Magento\Directory\Model\ResourceModel\Region\CollectionFactory as RegionCollectionFactory;
use Magento\Framework\Api\SearchCriteriaBuilder;
use Magento\Newsletter\Model\SubscriberFactory;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as ShippingAddress;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class CheckoutTest extends TestCase
{
    /**
     * @var Checkout
     */
    private $checkoutComponent;

    /**
     * @var CheckoutSession|MockObject
     */
    private $checkoutSessionMock;

    /**
     * @var CartRepositoryInterface|MockObject
     */
    private $cartRepositoryMock;

    /**
     * @var ShippingMethodManagementInterface|MockObject
     */
    private $shippingMethodManagementMock;

    /**
     * @var PaymentMethodManagementInterface|MockObject
     */
    private $paymentMethodManagementMock;

    /**
     * @var CartManagementInterface|MockObject
     */
    private $cartManagementMock;

    /**
     * @var CountryCollectionFactory|MockObject
     */
    private $countryCollectionFactoryMock;

    /**
     * @var RegionCollectionFactory|MockObject
     */
    private $regionCollectionFactoryMock;

    /**
     * @var SubscriberFactory|MockObject
     */
    private $subscriberFactoryMock;

    /**
     * @var \Kkkonrad\Fastcheckout\Helper\Data|MockObject
     */
    private $helperMock;

    /**
     * @var Quote|MockObject
     */
    private $quoteMock;

    protected function setUp(): void
    {
        $this->checkoutSessionMock = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getQuote', 'clearHelperData'])
            ->getMock();

        $this->cartRepositoryMock = $this->createMock(CartRepositoryInterface::class);
        $this->shippingMethodManagementMock = $this->createMock(ShippingMethodManagementInterface::class);
        $this->paymentMethodManagementMock = $this->createMock(PaymentMethodManagementInterface::class);
        $this->cartManagementMock = $this->createMock(CartManagementInterface::class);
        $this->countryCollectionFactoryMock = $this->getMockBuilder(CountryCollectionFactory::class)
            ->disableOriginalConstructor()
            ->getMock();
        $this->regionCollectionFactoryMock = $this->getMockBuilder(RegionCollectionFactory::class)
            ->disableOriginalConstructor()
            ->getMock();
        $this->subscriberFactoryMock = $this->getMockBuilder(SubscriberFactory::class)
            ->disableOriginalConstructor()
            ->getMock();
        $this->helperMock = $this->createMock(\Kkkonrad\Fastcheckout\Helper\Data::class);

        $this->quoteMock = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'getShippingAddress',
                'getBillingAddress',
                'getPayment',
                'isVirtual',
                'getId',
                'hasItems',
                'setCheckoutMethod',
                'collectTotals',
                'getTotals',
                'getAllVisibleItems',
            ])
            ->addMethods([
                'getCustomerId',
                'getCustomerEmail',
                'getCouponCode',
                'setCustomerEmail',
                'setCouponCode',
                'getGrandTotal',
                'getSubtotal',
                'getSubtotalWithDiscount',
            ])
            ->getMock();

        $this->checkoutSessionMock->expects($this->any())
            ->method('getQuote')
            ->willReturn($this->quoteMock);

        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);
        $this->helperMock->method('isHyvaNativePaymentMethodSupported')
            ->willReturnCallback(static function ($methodCode): bool {
                return in_array($methodCode, ['free', 'checkmo', 'banktransfer', 'cashondelivery', 'purchaseorder'], true);
            });
        $this->helperMock->method('isPaymentMethodCodeAllowedByRules')
            ->willReturnCallback(static function ($methodCode, array $allowedRules): bool {
                $methodCode = (string)$methodCode;
                foreach ($allowedRules as $rule) {
                    $rule = trim((string)$rule);
                    if ($rule === $methodCode) {
                        return true;
                    }
                }
                return false;
            });

        $this->checkoutComponent = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $loggerMock
        );
    }

    private function createPaymentMethodMock(string $code, ?string $title = null): PaymentMethodInterface
    {
        $method = $this->createMock(PaymentMethodInterface::class);
        $method->method('getCode')->willReturn($code);
        $method->method('getTitle')->willReturn($title ?? $code);

        return $method;
    }

    private function createPaymentMethodDataObject(string $code, string $title, array $data): PaymentMethodInterface
    {
        return new class($code, $title, $data) extends \Magento\Framework\DataObject implements PaymentMethodInterface {
            private $code;

            private $title;

            public function __construct(string $code, string $title, array $data)
            {
                $this->code = $code;
                $this->title = $title;
                parent::__construct($data);
            }

            public function getCode()
            {
                return $this->code;
            }

            public function getTitle()
            {
                return $this->title;
            }
        };
    }

    private function createAddressMock(array $additionalMethods = []): MockObject
    {
        $realMethods = [
            'getFirstname', 'getLastname', 'getCompany', 'getStreet', 'getCity', 
            'getPostcode', 'getCountryId', 'getRegionId', 'getRegion', 'getTelephone', 
            'getShippingMethod', 'setFirstname', 'setLastname', 'setStreet', 'setCity', 
            'setPostcode', 'setCountryId', 'setRegionId', 'setRegion', 'setTelephone', 
            'setCompany', 'setEmail', 'getGroupedAllShippingRates'
        ];
        
        $magicMethods = array_merge([
            'setShouldIgnoreValidation', 'setCollectShippingRates', 'setShippingMethod'
        ], $additionalMethods);

        return $this->getMockBuilder(ShippingAddress::class)
            ->disableOriginalConstructor()
            ->onlyMethods($realMethods)
            ->addMethods($magicMethods)
            ->getMock();
    }

    public function testMountLoadsDataFromQuote(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->once())
            ->method('getCustomerEmail')
            ->willReturn('test@example.com');
        $this->quoteMock->expects($this->once())
            ->method('getCouponCode')
            ->willReturn('SALE10');
        $this->quoteMock->expects($this->once())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);
        $this->quoteMock->expects($this->once())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $shippingAddressMock->expects($this->once())->method('getFirstname')->willReturn('John');
        $shippingAddressMock->expects($this->once())->method('getLastname')->willReturn('Doe');
        $shippingAddressMock->expects($this->once())->method('getCompany')->willReturn('Acme Corp');
        $shippingAddressMock->expects($this->once())->method('getStreet')->willReturn(['123 Street St', 'Suite A']);
        $shippingAddressMock->expects($this->once())->method('getCity')->willReturn('Warsaw');
        $shippingAddressMock->expects($this->once())->method('getPostcode')->willReturn('00-001');
        $shippingAddressMock->expects($this->any())->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->expects($this->once())->method('getRegionId')->willReturn('1');
        $shippingAddressMock->expects($this->once())->method('getRegion')->willReturn('Mazovia');
        $shippingAddressMock->expects($this->once())->method('getTelephone')->willReturn('123456789');
        $shippingAddressMock->expects($this->any())->method('getShippingMethod')->willReturn('flatrate_flatrate');

        $billingAddressMock->expects($this->once())->method('getFirstname')->willReturn('Jane');
        $billingAddressMock->expects($this->once())->method('getLastname')->willReturn('Smith');
        $billingAddressMock->expects($this->once())->method('getCompany')->willReturn('');
        $billingAddressMock->expects($this->once())->method('getStreet')->willReturn(['456 Road Rd']);
        $billingAddressMock->expects($this->once())->method('getCity')->willReturn('Gdansk');
        $billingAddressMock->expects($this->once())->method('getPostcode')->willReturn('80-001');
        $billingAddressMock->expects($this->once())->method('getCountryId')->willReturn('PL');
        $billingAddressMock->expects($this->once())->method('getRegionId')->willReturn('2');
        $billingAddressMock->expects($this->once())->method('getRegion')->willReturn('Pomerania');
        $billingAddressMock->expects($this->once())->method('getTelephone')->willReturn('987654321');

        $this->checkoutComponent->mount();

        $this->assertEquals('test@example.com', $this->checkoutComponent->email);
        $this->assertEquals('SALE10', $this->checkoutComponent->couponCode);
        $this->assertEquals('John', $this->checkoutComponent->firstname);
        $this->assertEquals('Doe', $this->checkoutComponent->lastname);
        $this->assertEquals('Acme Corp', $this->checkoutComponent->company);
        $this->assertEquals('123 Street St', $this->checkoutComponent->street1);
        $this->assertEquals('Suite A', $this->checkoutComponent->street2);
        $this->assertEquals('flatrate_flatrate', $this->checkoutComponent->shippingMethod);

        $this->assertEquals('Jane', $this->checkoutComponent->billingFirstname);
        $this->assertEquals('Smith', $this->checkoutComponent->billingLastname);
        $this->assertEquals('Gdansk', $this->checkoutComponent->billingCity);
    }

    public function testMountResolvesShippingRegionIdFromRegionName(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getCustomerEmail')->willReturn('test@example.com');
        $this->quoteMock->method('getCouponCode')->willReturn('');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);

        $shippingAddressMock->method('getFirstname')->willReturn('John');
        $shippingAddressMock->method('getLastname')->willReturn('Doe');
        $shippingAddressMock->method('getStreet')->willReturn(['123 Street St']);
        $shippingAddressMock->method('getCity')->willReturn('Warsaw');
        $shippingAddressMock->method('getPostcode')->willReturn('00-001');
        $shippingAddressMock->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->method('getRegionId')->willReturn(null);
        $shippingAddressMock->method('getRegion')->willReturn('Mazowieckie');
        $shippingAddressMock->method('getTelephone')->willReturn('123456789');
        $shippingAddressMock->method('getShippingMethod')->willReturn('flatrate_flatrate');

        $billingAddressMock->method('getStreet')->willReturn([]);
        $billingAddressMock->method('getCountryId')->willReturn('PL');
        $billingAddressMock->method('getRegionId')->willReturn(null);
        $billingAddressMock->method('getRegion')->willReturn('');

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addCountryFilter', 'addRegionCodeOrNameFilter', 'getFirstItem'])
            ->getMock();
        $regionCollectionMock->expects($this->once())
            ->method('addCountryFilter')
            ->with('PL')
            ->willReturnSelf();
        $regionCollectionMock->expects($this->once())
            ->method('addRegionCodeOrNameFilter')
            ->with('Mazowieckie')
            ->willReturnSelf();
        $regionCollectionMock->expects($this->once())
            ->method('getFirstItem')
            ->willReturn(new \Magento\Framework\DataObject(['id' => 10]));

        $this->regionCollectionFactoryMock->expects($this->once())
            ->method('create')
            ->willReturn($regionCollectionMock);

        $this->checkoutComponent->mount();

        $this->assertSame('10', $this->checkoutComponent->regionId);
    }

    public function testMountAutofillsEmptyQuoteShippingAddressFromCustomerDefaultShippingAddress(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();
        $customerSessionMock = $this->getMockBuilder(CustomerSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isLoggedIn', 'getCustomerId', 'getCustomer'])
            ->getMock();
        $addressRepositoryMock = $this->createMock(AddressRepositoryInterface::class);
        $searchCriteriaBuilderMock = $this->createMock(SearchCriteriaBuilder::class);
        $customerAddressMock = $this->createMock(AddressInterface::class);
        $customerMock = new \Magento\Framework\DataObject(['default_shipping' => 77]);

        $this->quoteMock->method('getCustomerEmail')->willReturn('customer@example.com');
        $this->quoteMock->method('getCouponCode')->willReturn('');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);
        $this->quoteMock->method('getPayment')->willReturn(null);

        $shippingAddressMock->method('getFirstname')->willReturn('');
        $shippingAddressMock->method('getLastname')->willReturn('');
        $shippingAddressMock->method('getCompany')->willReturn('');
        $shippingAddressMock->method('getStreet')->willReturn([]);
        $shippingAddressMock->method('getCity')->willReturn('');
        $shippingAddressMock->method('getPostcode')->willReturn('');
        $shippingAddressMock->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->method('getRegionId')->willReturn(null);
        $shippingAddressMock->method('getRegion')->willReturn('');
        $shippingAddressMock->method('getTelephone')->willReturn('');
        $shippingAddressMock->method('getShippingMethod')->willReturn('');

        $billingAddressMock->method('getStreet')->willReturn([]);
        $billingAddressMock->method('getCountryId')->willReturn('PL');
        $billingAddressMock->method('getRegionId')->willReturn(null);
        $billingAddressMock->method('getRegion')->willReturn('');

        $customerSessionMock->method('isLoggedIn')->willReturn(true);
        $customerSessionMock->method('getCustomerId')->willReturn(42);
        $customerSessionMock->method('getCustomer')->willReturn($customerMock);
        $addressRepositoryMock->expects($this->once())
            ->method('getById')
            ->with(77)
            ->willReturn($customerAddressMock);

        $customerAddressMock->method('getCustomerId')->willReturn(42);
        $customerAddressMock->method('getFirstname')->willReturn('Auto');
        $customerAddressMock->method('getLastname')->willReturn('Customer');
        $customerAddressMock->method('getCompany')->willReturn('Auto Company');
        $customerAddressMock->method('getPrefix')->willReturn('');
        $customerAddressMock->method('getMiddlename')->willReturn('');
        $customerAddressMock->method('getSuffix')->willReturn('');
        $customerAddressMock->method('getFax')->willReturn('');
        $customerAddressMock->method('getVatId')->willReturn('');
        $customerAddressMock->method('getStreet')->willReturn(['Default Street 1', 'Suite 2']);
        $customerAddressMock->method('getCity')->willReturn('Warsaw');
        $customerAddressMock->method('getPostcode')->willReturn('00-001');
        $customerAddressMock->method('getCountryId')->willReturn('PL');
        $customerAddressMock->method('getTelephone')->willReturn('123456789');
        $customerAddressMock->method('getRegion')->willReturn('Mazowieckie');
        $customerAddressMock->method('getRegionId')->willReturn(10);

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();
        $this->regionCollectionFactoryMock->expects($this->once())
            ->method('create')
            ->willReturn($regionCollectionMock);
        $regionCollectionMock->expects($this->once())
            ->method('addFieldToFilter')
            ->with('main_table.region_id', 10)
            ->willReturnSelf();
        $regionCollectionMock->expects($this->once())
            ->method('getFirstItem')
            ->willReturn($regionMock);
        $regionMock->method('getId')->willReturn(10);
        $regionMock->method('getName')->willReturn('Mazowieckie');

        $shippingAddressMock->expects($this->once())->method('setFirstname')->with('Auto');
        $shippingAddressMock->expects($this->once())->method('setLastname')->with('Customer');
        $shippingAddressMock->expects($this->once())->method('setStreet')->with(['Default Street 1', 'Suite 2']);
        $shippingAddressMock->expects($this->once())->method('setCity')->with('Warsaw');
        $shippingAddressMock->expects($this->once())->method('setPostcode')->with('00-001');
        $shippingAddressMock->expects($this->once())->method('setCountryId')->with('PL');
        $shippingAddressMock->expects($this->once())->method('setRegionId')->with(10);
        $shippingAddressMock->expects($this->once())->method('setRegion')->with('Mazowieckie');
        $shippingAddressMock->expects($this->once())->method('setTelephone')->with('123456789');
        $shippingAddressMock->expects($this->once())->method('setCompany')->with('Auto Company');
        $shippingAddressMock->expects($this->once())->method('setEmail')->with('customer@example.com');
        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(true);
        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(true);
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $this->createMock(\Psr\Log\LoggerInterface::class),
            null,
            null,
            null,
            $customerSessionMock,
            $addressRepositoryMock,
            $searchCriteriaBuilderMock
        );

        $component->mount();

        $this->assertSame('Auto', $component->firstname);
        $this->assertSame('Customer', $component->lastname);
        $this->assertSame('Default Street 1', $component->street1);
        $this->assertSame('Suite 2', $component->street2);
        $this->assertSame('Warsaw', $component->city);
        $this->assertSame('00-001', $component->postcode);
        $this->assertSame('PL', $component->countryId);
        $this->assertSame('Mazowieckie', $component->region);
        $this->assertSame('10', $component->regionId);
        $this->assertSame('123456789', $component->telephone);
    }

    public function testMountDoesNotOverwriteExistingQuoteShippingAddressWithCustomerDefaultShippingAddress(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();
        $customerSessionMock = $this->getMockBuilder(CustomerSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isLoggedIn', 'getCustomerId', 'getCustomer'])
            ->getMock();
        $addressRepositoryMock = $this->createMock(AddressRepositoryInterface::class);

        $this->quoteMock->method('getCustomerEmail')->willReturn('customer@example.com');
        $this->quoteMock->method('getCouponCode')->willReturn('');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);
        $this->quoteMock->method('getPayment')->willReturn(null);

        $shippingAddressMock->method('getFirstname')->willReturn('Quote');
        $shippingAddressMock->method('getLastname')->willReturn('Customer');
        $shippingAddressMock->method('getCompany')->willReturn('');
        $shippingAddressMock->method('getStreet')->willReturn(['Quote Street 1']);
        $shippingAddressMock->method('getCity')->willReturn('Krakow');
        $shippingAddressMock->method('getPostcode')->willReturn('30-001');
        $shippingAddressMock->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->method('getRegionId')->willReturn(10);
        $shippingAddressMock->method('getRegion')->willReturn('Malopolskie');
        $shippingAddressMock->method('getTelephone')->willReturn('987654321');
        $shippingAddressMock->method('getShippingMethod')->willReturn('flatrate_flatrate');

        $billingAddressMock->method('getStreet')->willReturn([]);
        $billingAddressMock->method('getCountryId')->willReturn('PL');
        $billingAddressMock->method('getRegionId')->willReturn(null);
        $billingAddressMock->method('getRegion')->willReturn('');

        $customerSessionMock->expects($this->never())->method('isLoggedIn');
        $addressRepositoryMock->expects($this->never())->method('getById');
        $this->cartRepositoryMock->expects($this->never())->method('save');

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $this->createMock(\Psr\Log\LoggerInterface::class),
            null,
            null,
            null,
            $customerSessionMock,
            $addressRepositoryMock
        );

        $component->mount();

        $this->assertSame('Quote', $component->firstname);
        $this->assertSame('Customer', $component->lastname);
        $this->assertSame('Quote Street 1', $component->street1);
        $this->assertSame('Krakow', $component->city);
        $this->assertSame('30-001', $component->postcode);
        $this->assertSame('10', $component->regionId);
        $this->assertSame('987654321', $component->telephone);
    }

    public function testRestoreGuestAddressSnapshotPersistsEmptyGuestQuoteAddress(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);
        $loggerMock->method('warning')
            ->willReturnCallback(static function ($message, array $context = []): void {
                $exception = $context['exception'] ?? null;
                throw new \RuntimeException(
                    (string)$message . ($exception ? ': ' . get_class($exception) . ': ' . $exception->getMessage() : '')
                );
            });
        $loggerProperty = new \ReflectionProperty($this->checkoutComponent, 'logger');
        $loggerProperty->setAccessible(true);
        $loggerProperty->setValue($this->checkoutComponent, $loggerMock);

        $this->checkoutComponent->billingSameAsShipping = false;
        $this->checkoutComponent->firstname = 'DeferredFrontendValue';
        $this->checkoutComponent->street1 = 'Deferred Frontend Street';
        $this->quoteMock->setDataChanges(true);
        $shippingAddressMock->setDataChanges(true);
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('recent-guest@example.com');

        $shippingAddressMock->method('getFirstname')->willReturn('');
        $shippingAddressMock->method('getLastname')->willReturn('');
        $shippingAddressMock->method('getStreet')->willReturn([]);
        $shippingAddressMock->method('getCity')->willReturn('');
        $shippingAddressMock->method('getPostcode')->willReturn('');
        $shippingAddressMock->method('getTelephone')->willReturn('');

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();
        $this->regionCollectionFactoryMock->expects($this->once())
            ->method('create')
            ->willReturn($regionCollectionMock);
        $regionCollectionMock->expects($this->once())
            ->method('addFieldToFilter')
            ->with('main_table.region_id', 10)
            ->willReturnSelf();
        $regionCollectionMock->expects($this->once())
            ->method('getFirstItem')
            ->willReturn($regionMock);
        $regionMock->method('getId')->willReturn(10);
        $regionMock->method('getName')->willReturn('Mazowieckie');

        $shippingAddressMock->expects($this->once())->method('setFirstname')->with('RecentGuest');
        $shippingAddressMock->expects($this->once())->method('setLastname')->with('Checkout');
        $shippingAddressMock->expects($this->once())->method('setStreet')->with(['Recent Street 10', '']);
        $shippingAddressMock->expects($this->once())->method('setCity')->with('Warsaw');
        $shippingAddressMock->expects($this->once())->method('setPostcode')->with('00-002');
        $shippingAddressMock->expects($this->once())->method('setCountryId')->with('PL');
        $shippingAddressMock->expects($this->once())->method('setRegionId')->with(10);
        $shippingAddressMock->expects($this->once())->method('setRegion')->with('Mazowieckie');
        $shippingAddressMock->expects($this->once())->method('setTelephone')->with('500600700');
        $shippingAddressMock->expects($this->once())->method('setEmail')->with('recent-guest@example.com');
        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(true);
        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(true);
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->restoreGuestAddressSnapshot([
            'email' => 'recent-guest@example.com',
            'firstname' => 'RecentGuest',
            'lastname' => 'Checkout',
            'street1' => 'Recent Street 10',
            'city' => 'Warsaw',
            'postcode' => '00-002',
            'countryId' => 'PL',
            'regionId' => '10',
            'region' => 'Mazowieckie',
            'telephone' => '500600700',
        ]);

        $this->assertSame('recent-guest@example.com', $this->checkoutComponent->email);
        $this->assertSame('RecentGuest', $this->checkoutComponent->firstname);
        $this->assertSame('Checkout', $this->checkoutComponent->lastname);
        $this->assertSame('Recent Street 10', $this->checkoutComponent->street1);
        $this->assertSame('Warsaw', $this->checkoutComponent->city);
        $this->assertSame('00-002', $this->checkoutComponent->postcode);
        $this->assertSame('PL', $this->checkoutComponent->countryId);
        $this->assertSame('10', $this->checkoutComponent->regionId);
        $this->assertSame('500600700', $this->checkoutComponent->telephone);
    }

    public function testSaveShippingAddress(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->checkoutComponent->firstname = 'John';
        $this->checkoutComponent->lastname = 'Doe';
        $this->checkoutComponent->street1 = '123 Main St';
        $this->checkoutComponent->street2 = '';
        $this->checkoutComponent->city = 'Warsaw';
        $this->checkoutComponent->postcode = '00-001';
        $this->checkoutComponent->countryId = 'PL';
        $this->checkoutComponent->regionId = '1';
        $this->checkoutComponent->region = 'Mazovia';
        $this->checkoutComponent->telephone = '123456789';
        $this->checkoutComponent->company = 'Acme Corp';
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->billingSameAsShipping = false;

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();

        $this->regionCollectionFactoryMock->expects($this->once())
            ->method('create')
            ->willReturn($regionCollectionMock);

        $regionCollectionMock->expects($this->once())
            ->method('addFieldToFilter')
            ->with('main_table.region_id', 1)
            ->willReturnSelf();

        $regionCollectionMock->expects($this->once())
            ->method('getFirstItem')
            ->willReturn($regionMock);

        $regionMock->expects($this->once())
            ->method('getId')
            ->willReturn(1);

        $regionMock->expects($this->once())
            ->method('getName')
            ->willReturn('Mazovia');

        $shippingAddressMock->expects($this->once())->method('setFirstname')->with('John');
        $shippingAddressMock->expects($this->once())->method('setLastname')->with('Doe');
        $shippingAddressMock->expects($this->once())->method('setStreet')->with(['123 Main St', '']);
        $shippingAddressMock->expects($this->once())->method('setCity')->with('Warsaw');
        $shippingAddressMock->expects($this->once())->method('setPostcode')->with('00-001');
        $shippingAddressMock->expects($this->once())->method('setCountryId')->with('PL');
        $shippingAddressMock->expects($this->once())->method('setRegionId')->with(1);
        $shippingAddressMock->expects($this->once())->method('setRegion')->with('Mazovia');
        $shippingAddressMock->expects($this->once())->method('setTelephone')->with('123456789');
        $shippingAddressMock->expects($this->once())->method('setCompany')->with('Acme Corp');
        $shippingAddressMock->expects($this->once())->method('setEmail')->with('guest@example.com');
        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(true);
        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(true);

        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->saveShippingAddress();
    }

    public function testSaveBillingAddress(): void
    {
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $this->checkoutComponent->billingFirstname = 'Jane';
        $this->checkoutComponent->billingLastname = 'Smith';
        $this->checkoutComponent->billingStreet1 = '456 Elm St';
        $this->checkoutComponent->billingStreet2 = '';
        $this->checkoutComponent->billingCity = 'Krakow';
        $this->checkoutComponent->billingPostcode = '30-001';
        $this->checkoutComponent->billingCountryId = 'PL';
        $this->checkoutComponent->billingRegionId = '2';
        $this->checkoutComponent->billingRegion = 'Lesser Poland';
        $this->checkoutComponent->billingTelephone = '987654321';
        $this->checkoutComponent->billingCompany = 'Company';
        $this->checkoutComponent->email = 'billing@example.com';
        $this->checkoutComponent->billingSameAsShipping = false;

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();

        $this->regionCollectionFactoryMock->expects($this->once())
            ->method('create')
            ->willReturn($regionCollectionMock);

        $regionCollectionMock->expects($this->once())
            ->method('addFieldToFilter')
            ->with('main_table.region_id', 2)
            ->willReturnSelf();

        $regionCollectionMock->expects($this->once())
            ->method('getFirstItem')
            ->willReturn($regionMock);

        $regionMock->expects($this->once())
            ->method('getId')
            ->willReturn(2);

        $regionMock->expects($this->once())
            ->method('getName')
            ->willReturn('Lesser Poland');

        $billingAddressMock->expects($this->once())->method('setFirstname')->with('Jane');
        $billingAddressMock->expects($this->once())->method('setLastname')->with('Smith');
        $billingAddressMock->expects($this->once())->method('setStreet')->with(['456 Elm St', '']);
        $billingAddressMock->expects($this->once())->method('setCity')->with('Krakow');
        $billingAddressMock->expects($this->once())->method('setPostcode')->with('30-001');
        $billingAddressMock->expects($this->once())->method('setCountryId')->with('PL');
        $billingAddressMock->expects($this->once())->method('setRegionId')->with(2);
        $billingAddressMock->expects($this->once())->method('setRegion')->with('Lesser Poland');
        $billingAddressMock->expects($this->once())->method('setTelephone')->with('987654321');
        $billingAddressMock->expects($this->once())->method('setCompany')->with('Company');
        $billingAddressMock->expects($this->once())->method('setEmail')->with('billing@example.com');
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(true);

        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->saveBillingAddress();
    }

    public function testSelectShippingMethod(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $shippingAddressMock->expects($this->any())
            ->method('getCountryId')
            ->willReturn('PL');

        $shippingAddressMock->expects($this->once())
            ->method('setShippingMethod')
            ->with('customcarrier_pickup_point_cod');

        $this->checkoutComponent->selectShippingMethod('customcarrier_pickup_point_cod');
        $this->assertEquals('customcarrier_pickup_point_cod', $this->checkoutComponent->shippingMethod);
    }

    public function testUpdatedHookPersistsDirectMagewirePropertyUpdates(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $shippingAddressMock->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->expects($this->once())
            ->method('setShippingMethod')
            ->with('inpostlocker_standard');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->updated('inpostlocker_standard', 'shippingMethod');

        $this->assertSame('inpostlocker_standard', $this->checkoutComponent->shippingMethod);
    }

    public function testSyncAddressFieldsAppliesFullSnapshotInOneSave(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);
        $this->quoteMock->expects($this->once())->method('setCustomerEmail')->with('guest-sync@example.com');

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();

        $this->regionCollectionFactoryMock->method('create')->willReturn($regionCollectionMock);
        $regionCollectionMock->method('addFieldToFilter')->willReturnSelf();
        $regionCollectionMock->method('getFirstItem')->willReturn($regionMock);
        $regionMock->method('getId')->willReturn(1024);
        $regionMock->method('getName')->willReturn('mazowieckie');

        $shippingAddressMock->expects($this->once())->method('setFirstname')->with('Gosc');
        $shippingAddressMock->expects($this->once())->method('setLastname')->with('Testowy');
        $shippingAddressMock->expects($this->once())->method('setPostcode')->with('00-001');
        $shippingAddressMock->expects($this->once())->method('setTelephone')->with('500600700');
        $shippingAddressMock->expects($this->once())->method('setCountryId')->with('PL');
        $shippingAddressMock->expects($this->once())->method('setRegionId')->with(1024);
        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(true);

        // One atomic save for the full address snapshot (no shippingMethod in payload).
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->syncAddressFields([
            'email' => 'guest-sync@example.com',
            'firstname' => 'Gosc',
            'lastname' => 'Testowy',
            'street1' => 'Testowa 12',
            'city' => 'Warszawa',
            'postcode' => '00-001',
            'telephone' => '500600700',
            'countryId' => 'PL',
            'regionId' => '1024',
            'billingSameAsShipping' => true,
            'paymentMethod' => 'checkmo',
            'ignored_field' => 'should-not-assign',
        ]);

        $this->assertSame('guest-sync@example.com', $this->checkoutComponent->email);
        $this->assertSame('Gosc', $this->checkoutComponent->firstname);
        $this->assertSame('Testowy', $this->checkoutComponent->lastname);
        $this->assertSame('00-001', $this->checkoutComponent->postcode);
        $this->assertSame('500600700', $this->checkoutComponent->telephone);
        $this->assertSame('1024', $this->checkoutComponent->regionId);
        $this->assertSame('checkmo', $this->checkoutComponent->paymentMethod);
        $this->assertFalse(isset($this->checkoutComponent->ignored_field));
    }

    public function testSyncAddressFieldsDoesNotClearRegionWhenPayloadIncludesRegionId(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();

        $this->regionCollectionFactoryMock->method('create')->willReturn($regionCollectionMock);
        $regionCollectionMock->method('addFieldToFilter')->willReturnSelf();
        $regionCollectionMock->method('getFirstItem')->willReturn($regionMock);
        $regionMock->method('getId')->willReturn(33);
        $regionMock->method('getName')->willReturn('Michigan');

        $this->checkoutComponent->countryId = 'PL';
        $this->checkoutComponent->regionId = '1024';

        $this->checkoutComponent->syncAddressFields([
            'countryId' => 'US',
            'regionId' => '33',
            'firstname' => 'Veronica',
            'lastname' => 'Costello',
            'street1' => '6146 Honey Bluff Parkway',
            'city' => 'Calder',
            'postcode' => '49628-7978',
            'telephone' => '5552293326',
        ]);

        $this->assertSame('US', $this->checkoutComponent->countryId);
        $this->assertSame('33', $this->checkoutComponent->regionId);
        $this->assertSame('Veronica', $this->checkoutComponent->firstname);
    }

    public function testSyncAddressFieldsIsNoOpWhenSnapshotUnchanged(): void
    {
        $this->checkoutComponent->email = 'same@example.com';
        $this->checkoutComponent->firstname = 'Gosc';
        $this->checkoutComponent->lastname = 'Testowy';
        $this->checkoutComponent->street1 = 'Testowa 12';
        $this->checkoutComponent->city = 'Warszawa';
        $this->checkoutComponent->postcode = '00-001';
        $this->checkoutComponent->telephone = '500600700';
        $this->checkoutComponent->countryId = 'PL';
        $this->checkoutComponent->regionId = '1024';
        $this->checkoutComponent->billingSameAsShipping = true;

        $this->cartRepositoryMock->expects($this->never())->method('save');
        $this->quoteMock->expects($this->never())->method('setCustomerEmail');
        $this->quoteMock->expects($this->never())->method('getShippingAddress');

        $this->checkoutComponent->syncAddressFields([
            'email' => 'same@example.com',
            'firstname' => 'Gosc',
            'lastname' => 'Testowy',
            'street1' => 'Testowa 12',
            'city' => 'Warszawa',
            'postcode' => '00-001',
            'telephone' => '500600700',
            'countryId' => 'PL',
            'regionId' => '1024',
            'billingSameAsShipping' => true,
        ]);

        $this->assertSame('Gosc', $this->checkoutComponent->firstname);
        $this->assertSame('00-001', $this->checkoutComponent->postcode);
    }

    public function testSyncAddressFieldsPersistsAddressAttributeBagsInOneSave(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->checkoutComponent->billingSameAsShipping = false;

        $shippingAddressMock->expects($this->once())
            ->method('setCollectShippingRates')
            ->with(false);
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->syncAddressFields([
            'shippingCustomAttributes' => [
                ['attribute_code' => 'delivery_note', 'value' => 'Leave at reception'],
            ],
            'shippingExtensionAttributes' => [
                'delivery_code' => 'ABC-123',
            ],
        ]);

        $this->assertSame(
            ['delivery_note' => 'Leave at reception'],
            $this->checkoutComponent->shippingCustomAttributes
        );
        $this->assertSame(
            ['delivery_code' => 'ABC-123'],
            $this->checkoutComponent->shippingExtensionAttributes
        );
    }

    public function testSyncAddressFieldsSkipsQuoteSaveWhenOnlyPaymentMethodChanges(): void
    {
        $this->checkoutComponent->firstname = 'Gosc';
        $this->checkoutComponent->paymentMethod = 'checkmo';

        $this->cartRepositoryMock->expects($this->never())->method('save');
        $this->quoteMock->expects($this->never())->method('getShippingAddress');

        $this->checkoutComponent->syncAddressFields([
            'paymentMethod' => 'banktransfer',
            'firstname' => 'Gosc',
        ]);

        $this->assertSame('banktransfer', $this->checkoutComponent->paymentMethod);
        $this->assertSame('Gosc', $this->checkoutComponent->firstname);
    }

    public function testSyncAddressFieldsCollectsRatesOnlyForRateAffectingFields(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);

        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->firstname = 'Old';
        $this->checkoutComponent->lastname = 'Name';
        $this->checkoutComponent->street1 = 'Street 1';
        $this->checkoutComponent->city = 'Warszawa';
        $this->checkoutComponent->postcode = '00-001';
        $this->checkoutComponent->telephone = '500600700';
        $this->checkoutComponent->countryId = 'PL';
        $this->checkoutComponent->billingSameAsShipping = true;

        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(false);
        $this->cartRepositoryMock->expects($this->once())->method('save')->with($this->quoteMock);

        $this->checkoutComponent->syncAddressFields([
            'email' => 'guest@example.com',
            'firstname' => 'New',
            'lastname' => 'Name',
            'street1' => 'Street 1',
            'city' => 'Warszawa',
            'postcode' => '00-001',
            'telephone' => '500600700',
            'countryId' => 'PL',
            'billingSameAsShipping' => true,
        ]);

        $this->assertSame('New', $this->checkoutComponent->firstname);
    }

    public function testSyncAddressFieldsCollectsRatesWhenPostcodeChanges(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);

        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->firstname = 'Gosc';
        $this->checkoutComponent->lastname = 'Testowy';
        $this->checkoutComponent->street1 = 'Street 1';
        $this->checkoutComponent->city = 'Warszawa';
        $this->checkoutComponent->postcode = '00-001';
        $this->checkoutComponent->telephone = '500600700';
        $this->checkoutComponent->countryId = 'PL';
        $this->checkoutComponent->billingSameAsShipping = true;

        $shippingAddressMock->expects($this->once())->method('setCollectShippingRates')->with(true);
        $this->cartRepositoryMock->expects($this->once())->method('save')->with($this->quoteMock);

        $this->checkoutComponent->syncAddressFields([
            'email' => 'guest@example.com',
            'firstname' => 'Gosc',
            'lastname' => 'Testowy',
            'street1' => 'Street 1',
            'city' => 'Warszawa',
            'postcode' => '00-999',
            'telephone' => '500600700',
            'countryId' => 'PL',
            'billingSameAsShipping' => true,
        ]);

        $this->assertSame('00-999', $this->checkoutComponent->postcode);
    }

    public function testSelectShippingMethodClearsQuotePaymentThatIsNotAllowedForNewMethod(): void
    {
        $shippingAddressMock = $this->createAddressMock();
        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getMethod', 'setMethod'])
            ->getMock();

        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $this->quoteMock->method('getPayment')->willReturn($paymentMock);
        $shippingAddressMock->method('getCountryId')->willReturn('PL');
        $shippingAddressMock->method('getShippingMethod')->willReturn('');
        $paymentMock->method('getMethod')->willReturn('cashondelivery');
        $paymentMock->expects($this->once())->method('setMethod')->with('');

        $this->helperMock->method('hasShippingPaymentMapping')->willReturn(true);
        $this->helperMock->method('getMappedPaymentMethodsForShipping')
            ->with('tablerate_bestway')
            ->willReturn([]);
        $this->paymentMethodManagementMock->expects($this->atLeastOnce())
            ->method('getList')
            ->willReturn([]);

        $this->checkoutComponent->selectShippingMethod('tablerate_bestway');

        $this->assertSame('', $this->checkoutComponent->paymentMethod);
    }

    public function testSelectPaymentMethod(): void
    {
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);
        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['additional_data']['terms_accept'] === true
                    && $data['additional_data']['group'] === ''
                    && $data['additional_data']['channel'] === ''
                    && $data['additional_data']['blik_code'] === ''
                    && $data['additional_data']['blik_alias'] === false;
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
        $this->assertEquals('checkmo', $this->checkoutComponent->paymentMethod);
    }

    public function testSelectGenericPaymentMethodImportsChannelAdditionalData(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('generic-150')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'generic-150'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['additional_data']['terms_accept'] === true
                    && $data['additional_data']['group'] === '150'
                    && $data['additional_data']['channel'] === '150'
                    && $data['additional_data']['blik_code'] === ''
                    && $data['additional_data']['blik_alias'] === false;
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('generic-150');

        $this->assertEquals('generic-150', $this->checkoutComponent->paymentMethod);
    }

    public function testSelectPaymentMethodImportsRawKoPaymentPayload(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'checkmo',
                'custom_top_level' => 'custom-value',
                'additional_data' => [
                    'custom_additional' => 'additional-value',
                    'gateway' => [
                        'session_id' => 'raw-session',
                        'risk' => [
                            'provider' => 'gateway-risk',
                            'flags' => [
                                'velocity' => true,
                            ],
                        ],
                    ],
                ],
                'extension_attributes' => [
                    'agreement_ids' => ['1'],
                    'gateway' => [
                        'fingerprint' => 'raw-fingerprint',
                        'metadata' => [
                            'source' => 'raw',
                        ],
                    ],
                ],
            ],
        ];
        $this->checkoutComponent->paymentAdditionalData = [
            'custom_additional' => 'overridden-value',
            'gateway' => [
                'risk' => [
                    'score' => 82,
                ],
            ],
        ];
        $this->checkoutComponent->paymentExtensionAttributes = [
            'agreement_ids' => ['2'],
            'gateway' => [
                'metadata' => [
                    'checked' => true,
                ],
            ],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['custom_top_level'] === 'custom-value'
                    && $data['additional_data']['custom_additional'] === 'overridden-value'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['additional_data']['gateway']['session_id'] === 'raw-session'
                    && $data['additional_data']['gateway']['risk']['provider'] === 'gateway-risk'
                    && $data['additional_data']['gateway']['risk']['flags']['velocity'] === true
                    && $data['additional_data']['gateway']['risk']['score'] === 82
                    && $data['extension_attributes']['agreement_ids'] === ['2']
                    && $data['extension_attributes']['gateway']['fingerprint'] === 'raw-fingerprint'
                    && $data['extension_attributes']['gateway']['metadata']['source'] === 'raw'
                    && $data['extension_attributes']['gateway']['metadata']['checked'] === true;
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
    }

    public function testSelectPaymentMethodImportsSnakeCasePaymentPayload(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $this->checkoutComponent->placeOrderRequestData = [
            'payment_method' => [
                'method' => 'checkmo',
                'additionalData' => [
                    'gateway_session_id' => 'session-1',
                ],
                'extensionAttributes' => [
                    'agreement_ids' => ['9'],
                ],
            ],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['additional_data']['gateway_session_id'] === 'session-1'
                    && $data['extension_attributes']['agreement_ids'] === ['9'];
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
    }

    public function testSelectPaymentMethodAcceptsRendererPayloadWhenSelectedMethodHintMatches(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'external_renderer_backend_code',
                'fastcheckout_selected_method' => 'checkmo',
                'additional_data' => [
                    'fastcheckout_selected_method' => 'checkmo',
                    'selected_variant' => 'wallet',
                ],
            ],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['additional_data']['selected_variant'] === 'wallet'
                    && !array_key_exists('fastcheckout_selected_method', $data)
                    && !array_key_exists('fastcheckoutSelectedMethod', $data)
                    && !array_key_exists('fastcheckout_selected_method', $data['additional_data']);
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
    }

    public function testSelectPaymentMethodRejectsVariantWhenOnlyBaseMethodIsAvailable(): void
    {
        $this->checkoutComponent->shippingMethod = 'customcarrier_pickup';

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('customcarrier_pickup');

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);
        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->helperMock->method('getMappedPaymentMethodsForShipping')
            ->with('customcarrier_pickup')
            ->willReturn(['payu_*']);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('payu')]);

        $this->quoteMock->expects($this->never())
            ->method('getPayment');

        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'payu_blik',
                'additional_data' => [
                    'blik_code' => '123456',
                    'selected_channel' => 'blik',
                ],
            ],
        ];

        $this->quoteMock->expects($this->never())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->never())->method('save');

        $this->checkoutComponent->selectPaymentMethod('payu_blik');

        $this->assertSame('', $this->checkoutComponent->paymentMethod);
    }

    public function testSelectPaymentMethodRefreshesPayloadWhenSameMethodIsAlreadySelected(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData', 'getMethod'])
            ->getMock();

        $paymentMock->method('getMethod')->willReturn('checkmo');

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'checkmo',
                'additional_data' => [
                    'selected_channel' => 'new-channel',
                ],
            ],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['additional_data']['selected_channel'] === 'new-channel';
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');

        $this->assertSame('checkmo', $this->checkoutComponent->paymentMethod);
    }

    public function testGetPaymentMethodsReturnsAllMagentoAvailableMethods(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('checkmo'),
                $this->createPaymentMethodMock('tpay'),
            ]);

        $methods = $this->checkoutComponent->getPaymentMethods();

        $this->assertSame(['checkmo', 'tpay'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));
    }

    public function testRefreshCheckoutStateReturnsTotalsAndPaymentMethods(): void
    {
        $subtotal = new \Magento\Framework\DataObject([
            'title' => 'Subtotal',
            'value' => 80.0,
        ]);
        $grandTotal = new \Magento\Framework\DataObject([
            'title' => 'Grand Total',
            'value' => 100.0,
        ]);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);
        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->quoteMock->expects($this->once())
            ->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);
        $this->quoteMock->expects($this->any())
            ->method('getCouponCode')
            ->willReturn('SALE10');
        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('flatrate_flatrate');
        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);
        $this->quoteMock->expects($this->once())
            ->method('getAllVisibleItems')
            ->willReturn([]);
        $this->quoteMock->expects($this->once())
            ->method('getSubtotal')
            ->willReturn(80.0);
        $this->quoteMock->expects($this->once())
            ->method('getSubtotalWithDiscount')
            ->willReturn(75.0);
        $this->quoteMock->expects($this->once())
            ->method('getGrandTotal')
            ->willReturn(100.0);
        $this->quoteMock->expects($this->once())
            ->method('getTotals')
            ->willReturn([
                'subtotal' => $subtotal,
                'grand_total' => $grandTotal,
            ]);
        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('checkmo', 'Check / Money order'),
                $this->createPaymentMethodDataObject('tpay', 'Tpay', [
                    'additional_data' => [
                        'gateway_family' => 'tpay',
                        'channels' => [
                            [
                                'code' => 'blik',
                                'value' => 'BLIK',
                            ],
                        ],
                    ],
                    'extension_attributes' => [
                        'is_deferred' => false,
                        'risk' => [
                            'provider' => 'tpay-risk',
                        ],
                    ],
                ]),
            ]);

        $this->checkoutComponent->paymentMethod = 'checkmo';

        $state = $this->checkoutComponent->refreshCheckoutState();

        $this->assertSame('checkmo', $state['selected_payment_method']);
        $this->assertSame('checkmo', $state['selectedPaymentMethod']);
        $this->assertSame('checkmo', $state['paymentMethod']);
        $this->assertSame('flatrate_flatrate', $state['selected_shipping_method']);
        $this->assertSame('flatrate_flatrate', $state['selectedShippingMethod']);
        $this->assertSame('flatrate_flatrate', $state['selected_shipping_rate']);
        $this->assertSame('flatrate_flatrate', $state['selectedShippingRate']);
        $this->assertSame('SALE10', $state['coupon_code']);
        $this->assertSame(100.0, $state['totals']['grand_total']);
        $this->assertSame(75.0, $state['totals']['subtotal_with_discount']);
        $this->assertSame('grand_total', $state['totals']['total_segments'][1]['code']);
        $this->assertSame('tpay', $state['payment_methods'][1]['method']);
        $this->assertSame('Tpay', $state['payment_methods'][1]['title']);
        $this->assertSame('tpay', $state['payment_methods'][1]['additional_data']['gateway_family']);
        $this->assertSame('BLIK', $state['payment_methods'][1]['additional_data']['channels']['blik']);
        $this->assertSame($state['payment_methods'][1]['additional_data'], $state['payment_methods'][1]['additionalData']);
        $this->assertFalse($state['payment_methods'][1]['extension_attributes']['is_deferred']);
        $this->assertSame('tpay-risk', $state['payment_methods'][1]['extension_attributes']['risk']['provider']);
        $this->assertSame($state['payment_methods'][1]['extension_attributes'], $state['payment_methods'][1]['extensionAttributes']);
    }

    public function testRefreshCheckoutStateReturnsFlattenedShippingRates(): void
    {
        $shippingAddressMock = $this->createAddressMock(['getCollectShippingRates']);
        $rate = new \Magento\Framework\DataObject([
            'carrier' => 'flatrate',
            'method' => 'flatrate',
            'carrier_title' => 'Flat Rate',
            'method_title' => 'Fixed',
            'price' => 12.5,
            'amount' => 15.25,
            'base_amount' => 13.75,
            'price_excl_tax' => 12.4,
            'price_incl_tax' => 15.25,
            'error_message' => '',
            'extension_attributes' => [
                'pickup_point_required' => true,
                'metadata' => [
                    'provider' => 'locker_vendor',
                ],
            ],
            'custom_attributes' => [
                [
                    'attribute_code' => 'pickup_location_code',
                    'value' => 'POP-42',
                ],
            ],
        ]);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);
        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->quoteMock->expects($this->once())
            ->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);
        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);
        $this->quoteMock->expects($this->once())
            ->method('getAllVisibleItems')
            ->willReturn([]);
        $this->quoteMock->expects($this->once())
            ->method('getTotals')
            ->willReturn([]);
        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([]);

        $shippingAddressMock->expects($this->any())
            ->method('getCountryId')
            ->willReturn('PL');
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('flatrate_flatrate');
        $shippingAddressMock->expects($this->once())
            ->method('getGroupedAllShippingRates')
            ->willReturn(['flatrate' => [$rate]]);
        $shippingAddressMock->expects($this->once())
            ->method('getCollectShippingRates')
            ->willReturn(false);

        $state = $this->checkoutComponent->refreshCheckoutState();

        $this->assertSame('flatrate', $state['shipping_rates'][0]['carrier_code']);
        $this->assertSame('flatrate', $state['shipping_rates'][0]['method_code']);
        $this->assertSame('Flat Rate', $state['shipping_rates'][0]['carrier_title']);
        $this->assertSame('Fixed', $state['shipping_rates'][0]['method_title']);
        $this->assertSame(15.25, $state['shipping_rates'][0]['amount']);
        $this->assertSame(13.75, $state['shipping_rates'][0]['base_amount']);
        $this->assertSame(12.4, $state['shipping_rates'][0]['price_excl_tax']);
        $this->assertSame(15.25, $state['shipping_rates'][0]['price_incl_tax']);
        $this->assertTrue($state['shipping_rates'][0]['available']);
        $this->assertTrue($state['shipping_rates'][0]['extension_attributes']['pickup_point_required']);
        $this->assertSame('locker_vendor', $state['shipping_rates'][0]['extension_attributes']['metadata']['provider']);
        $this->assertSame($state['shipping_rates'][0]['extension_attributes'], $state['shipping_rates'][0]['extensionAttributes']);
        $this->assertSame('POP-42', $state['shipping_rates'][0]['custom_attributes']['pickup_location_code']);
        $this->assertSame($state['shipping_rates'][0]['custom_attributes'], $state['shipping_rates'][0]['customAttributes']);
    }

    public function testGetAllowedPaymentMethodsFiltersMethodsByShippingMapping(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('flatrate_flatrate');

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->paymentMethodManagementMock->expects($this->exactly(1))
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('checkmo'),
                $this->createPaymentMethodMock('cashondelivery'),
                $this->createPaymentMethodMock('payu_gateway'),
            ]);

        $this->helperMock->expects($this->once())
            ->method('getMappedPaymentMethodsForShipping')
            ->with('flatrate_flatrate')
            ->willReturn(['cashondelivery', 'payu_*']);

        $methods = $this->checkoutComponent->getPaymentMethods();

        $this->assertSame(['checkmo', 'cashondelivery', 'payu_gateway'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));

        $methods = $this->checkoutComponent->getAllowedPaymentMethods();

        $this->assertSame(['cashondelivery'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));
    }

    public function testGetAllowedPaymentMethodsDoesNotApplyMappingBeforeShippingSelection(): void
    {
        $this->quoteMock->method('getId')->willReturn(42);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->method('getShippingMethod')->willReturn('');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('checkmo'),
                $this->createPaymentMethodMock('cashondelivery'),
            ]);
        $this->helperMock->method('hasShippingPaymentMapping')->willReturn(true);
        $this->helperMock->expects($this->never())
            ->method('getMappedPaymentMethodsForShipping');

        $methods = $this->checkoutComponent->getAllowedPaymentMethods();

        $this->assertSame(['checkmo', 'cashondelivery'], array_map(
            static function (PaymentMethodInterface $method): string {
                return $method->getCode();
            },
            $methods
        ));
    }

    public function testGetAllowedPaymentMethodsUsesCurrentMagewireShippingMethodBeforeStaleQuoteValue(): void
    {
        $this->checkoutComponent->shippingMethod = 'tablerate_bestway';
        $this->quoteMock->method('getId')->willReturn(42);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->method('getShippingMethod')->willReturn('inpostlocker_standard');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('cashondelivery'),
                $this->createPaymentMethodMock('braintree'),
            ]);
        $this->helperMock->expects($this->once())
            ->method('getMappedPaymentMethodsForShipping')
            ->with('tablerate_bestway')
            ->willReturn(['braintree']);

        $methods = $this->checkoutComponent->getAllowedPaymentMethods();

        $this->assertSame(['braintree'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));
    }

    public function testGetAllowedPaymentMethodsReturnsNoMethodsForUnmappedShippingMethod(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('tablerate_bestway');

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('cashondelivery'),
                $this->createPaymentMethodMock('braintree'),
            ]);

        $this->helperMock->expects($this->once())
            ->method('getMappedPaymentMethodsForShipping')
            ->with('tablerate_bestway')
            ->willReturn([]);
        $this->helperMock->method('hasShippingPaymentMapping')->willReturn(true);

        $this->assertSame([], $this->checkoutComponent->getAllowedPaymentMethods());
    }

    public function testIsPaymentMethodAvailableUsesExactRules(): void
    {
        $this->assertFalse($this->checkoutComponent->isPaymentMethodAvailable('payu_blik', ['payu_*']));
        $this->assertTrue($this->checkoutComponent->isPaymentMethodAvailable('checkmo', ['checkmo']));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodAvailable('stripe_payments', ['*']));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodAvailable('stripe_payments', ['payu_*', 'checkmo']));
    }

    public function testIsPaymentMethodSelectedMatchesExactCodeOnly(): void
    {
        $this->checkoutComponent->paymentMethod = 'payu_blik';

        $this->assertFalse($this->checkoutComponent->isPaymentMethodSelected('payu'));
        $this->assertTrue($this->checkoutComponent->isPaymentMethodSelected('payu_blik'));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodSelected('paypal'));

        $this->checkoutComponent->paymentMethod = 'payu';

        $this->assertFalse($this->checkoutComponent->isPaymentMethodSelected('payu_blik'));

        $this->checkoutComponent->paymentMethod = 'braintree_cc_vault';

        $this->assertTrue($this->checkoutComponent->isPaymentMethodSelected('braintree_cc_vault'));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodSelected('braintree'));

        $this->checkoutComponent->paymentMethod = 'braintree';

        $this->assertTrue($this->checkoutComponent->isPaymentMethodSelected('braintree'));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodSelected('braintree_cc_vault'));
    }

    public function testApplyCoupon(): void
    {
        $this->checkoutComponent->couponCode = 'SALE10';
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->once())
            ->method('setCouponCode')
            ->with('SALE10');

        $this->helperMock->expects($this->once())
            ->method('isReloadShippingOnDiscount')
            ->willReturn(true);

        $shippingAddressMock->expects($this->once())
            ->method('setCollectShippingRates')
            ->with(true);

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->quoteMock->expects($this->once())
            ->method('getCouponCode')
            ->willReturn('SALE10');

        $this->checkoutComponent->applyCoupon();
        $this->assertEquals('Coupon code applied successfully.', $this->checkoutComponent->couponSuccess);
        $this->assertEquals('', $this->checkoutComponent->couponError);
    }

    public function testCancelCoupon(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->once())
            ->method('setCouponCode')
            ->with('');

        $this->helperMock->expects($this->once())
            ->method('isReloadShippingOnDiscount')
            ->willReturn(true);

        $shippingAddressMock->expects($this->once())
            ->method('setCollectShippingRates')
            ->with(true);

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->cancelCoupon();
        $this->assertEquals('Coupon code canceled.', $this->checkoutComponent->couponSuccess);
        $this->assertEquals('', $this->checkoutComponent->couponCode);
    }

    public function testPlaceOrderRejectsDuplicateIdempotencyKey(): void
    {
        $sessionStub = new class extends CheckoutSession {
            public function __construct() {}

            public function getData($key = '', $default = null)
            {
                return ['duplicate-key'];
            }

            public function setData($key, $value)
            {
                return $this;
            }
        };

        $component = new Checkout(
            $sessionStub,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $this->createMock(\Psr\Log\LoggerInterface::class)
        );

        $component->idempotencyKey = 'duplicate-key';
        $component->placeOrder();

        $this->assertStringContainsString('already being processed', $component->orderError);
    }

    public function testPlaceOrderSuccess(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->checkoutComponent->billingSameAsShipping = false;

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');

        $this->quoteMock->expects($this->once())
            ->method('setCheckoutMethod')
            ->with(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $this->checkoutComponent->regionId = '';
        $this->checkoutComponent->billingRegionId = '';

        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);

        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->any())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['additional_data']['terms_accept'] === true;
            }));

        $this->cartRepositoryMock->expects($this->any())
            ->method('save')
            ->with($this->quoteMock);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $this->cartManagementMock->expects($this->once())
            ->method('placeOrder')
            ->with(42)
            ->willReturn(100001);

        $this->checkoutSessionMock->expects($this->once())
            ->method('clearHelperData');

        $response = $this->checkoutComponent->placeOrder();

        $this->assertEquals('', $this->checkoutComponent->orderError);
        $this->assertTrue($response['success']);
        $this->assertSame(100001, $response['orderId']);
        $this->assertSame(100001, $response['order_id']);
        $this->assertSame('checkmo', $response['method']);
        $this->assertSame('checkmo', $response['payment_method']);
    }

    public function testPlaceOrderWithPurchaseOrderReadsPoNumberFromRawPaymentPayload(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'purchaseorder';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'purchaseorder',
                'po_number' => 'PO-123',
                'additional_data' => null,
            ],
        ];

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->checkoutComponent->billingSameAsShipping = false;

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');

        $this->quoteMock->expects($this->once())
            ->method('setCheckoutMethod')
            ->with(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $this->checkoutComponent->regionId = '';
        $this->checkoutComponent->billingRegionId = '';

        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);

        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData', 'setPoNumber'])
            ->getMock();

        $this->quoteMock->expects($this->any())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'purchaseorder'
                    && $data['po_number'] === 'PO-123'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['additional_data']['terms_accept'] === true;
            }));

        $paymentMock->expects($this->once())
            ->method('setPoNumber')
            ->with('PO-123');

        $this->cartRepositoryMock->expects($this->any())
            ->method('save')
            ->with($this->quoteMock);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('purchaseorder')]);

        $this->cartManagementMock->expects($this->once())
            ->method('placeOrder')
            ->with(42)
            ->willReturn(100002);

        $this->checkoutSessionMock->expects($this->once())
            ->method('clearHelperData');

        $response = $this->checkoutComponent->placeOrder();

        $this->assertEquals('', $this->checkoutComponent->orderError);
        $this->assertSame('PO-123', $this->checkoutComponent->poNumber);
        $this->assertTrue($response['success']);
        $this->assertSame(100002, $response['orderId']);
        $this->assertSame('purchaseorder', $response['method']);
        $this->assertSame('purchaseorder', $response['payment_method']);
    }

    public function testPlaceOrderWithPurchaseOrderTreatsExplicitEmptyPoNumberAsMissing(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'purchaseorder';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';
        $this->checkoutComponent->poNumber = 'OLD-PO';
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'purchaseorder',
                'po_number' => '',
                'additional_data' => [
                    'po_number' => '',
                ],
            ],
        ];

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->checkoutComponent->billingSameAsShipping = false;

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');

        $this->quoteMock->expects($this->once())
            ->method('setCheckoutMethod')
            ->with(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $this->checkoutComponent->regionId = '';
        $this->checkoutComponent->billingRegionId = '';

        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);

        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('purchaseorder')]);

        $this->cartManagementMock->expects($this->never())
            ->method('placeOrder');

        $response = $this->checkoutComponent->placeOrder();

        $this->assertFalse($response['success']);
        $this->assertSame('', $this->checkoutComponent->poNumber);
        $this->assertSame('Purchase Order Number is a required field.', $this->checkoutComponent->orderError);
    }

    public function testPlaceOrderStopsWhenConfiguredRequiredPaymentFieldIsMissing(): void
    {
        $this->helperMock->method('getRequiredPaymentFields')
            ->willReturn(['custom_gateway' => ['additional_data.transaction_id']]);

        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'custom_gateway';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'custom_gateway',
                'additional_data' => [],
            ],
        ];

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->checkoutComponent->billingSameAsShipping = false;

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');

        $this->quoteMock->expects($this->once())
            ->method('setCheckoutMethod')
            ->with(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);

        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('custom_gateway')]);

        $this->cartManagementMock->expects($this->never())
            ->method('placeOrder');

        $response = $this->checkoutComponent->placeOrder();

        $this->assertFalse($response['success']);
        $this->assertSame('Please complete the required payment fields.', $this->checkoutComponent->orderError);
    }

    public function testRequiredPaymentFieldValidationReadsAdditionalDataPath(): void
    {
        $this->helperMock->method('getRequiredPaymentFields')
            ->willReturn(['custom_gateway' => ['additional_data.transaction_id']]);

        $this->checkoutComponent->paymentMethod = 'custom_gateway';
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'custom_gateway',
                'additionalData' => [
                    'transaction_id' => 'TX-123',
                ],
            ],
        ];

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('custom_gateway')]);

        $method = new \ReflectionMethod($this->checkoutComponent, 'getMissingRequiredPaymentFields');
        $method->setAccessible(true);

        $this->assertSame([], $method->invoke($this->checkoutComponent, 'custom_gateway'));
    }

    public function testPlaceOrderStopsWhenConfiguredRequiredShippingFieldIsMissing(): void
    {
        $this->helperMock->method('getRequiredShippingFieldsForMethod')
            ->with('customcarrier_pickup')
            ->willReturn(['custom_attributes.pickup_location_code']);

        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->shippingMethod = 'customcarrier_pickup';

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->checkoutComponent->billingSameAsShipping = false;

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');

        $this->quoteMock->expects($this->once())
            ->method('setCheckoutMethod')
            ->with(\Magento\Checkout\Model\Type\Onepage::METHOD_GUEST);

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);

        $shippingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(false);

        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);

        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->paymentMethodManagementMock->expects($this->never())
            ->method('getList');

        $this->cartManagementMock->expects($this->never())
            ->method('placeOrder');

        $response = $this->checkoutComponent->placeOrder();

        $this->assertFalse($response['success']);
        $this->assertSame('Please complete the required shipping fields.', $this->checkoutComponent->orderError);
    }

    public function testRequiredShippingFieldValidationReadsCustomAndExtensionAttributePaths(): void
    {
        $this->helperMock->method('getRequiredShippingFieldsForMethod')
            ->with('customcarrier_pickup')
            ->willReturn([
                'custom_attributes.pickup_location_code',
                'extension_attributes.locker_id',
            ]);

        $this->checkoutComponent->shippingMethod = 'customcarrier_pickup';
        $this->checkoutComponent->placeOrderRequestData = [
            'addressInformation' => [
                'shippingAddress' => [
                    'customAttributes' => [
                        [
                            'attribute_code' => 'pickup_location_code',
                            'value' => 'POP-42',
                        ],
                    ],
                    'extensionAttributes' => [
                        'locker_id' => 'LOCKER-42',
                    ],
                ],
            ],
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'getMissingRequiredShippingFields');
        $method->setAccessible(true);

        $this->assertSame([], $method->invoke($this->checkoutComponent, 'customcarrier_pickup'));
    }

    public function testRequiredShippingFieldValidationMapsInStorePickupLocationCodeAlias(): void
    {
        $this->helperMock->method('getRequiredShippingFieldsForMethod')
            ->with('instore_pickup')
            ->willReturn(['extension_attributes.pickup_location_code']);

        $this->checkoutComponent->shippingMethod = 'instore_pickup';
        $this->checkoutComponent->placeOrderRequestData = [
            'addressInformation' => [
                'shippingAddress' => [
                    'selectedPickupAddress' => [
                        'extension_attributes' => [
                            'pickup_location_code' => 'eu-1',
                        ],
                    ],
                ],
            ],
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'getMissingRequiredShippingFields');
        $method->setAccessible(true);

        $this->assertSame([], $method->invoke($this->checkoutComponent, 'instore_pickup'));
    }

    public function testRequiredFieldDiagnosticsExposeKeysWithoutValues(): void
    {
        $method = new \ReflectionMethod($this->checkoutComponent, 'buildRequiredFieldDiagnostics');
        $method->setAccessible(true);

        $diagnostics = $method->invoke(
            $this->checkoutComponent,
            [
                'method' => 'custom_gateway',
                'additional_data' => [
                    'transaction_id' => 'secret-transaction-value',
                    'nested' => [
                        'token' => 'secret-token-value',
                    ],
                ],
                'extension_attributes' => [
                    'agreement_ids' => ['1'],
                ],
            ],
            ['additional_data.customer_id'],
            ['additional_data', 'extension_attributes']
        );

        $encodedDiagnostics = json_encode($diagnostics);

        $this->assertContains('transaction_id', $diagnostics['available_container_keys']['additional_data']);
        $this->assertContains('nested.token', $diagnostics['available_container_keys']['additional_data']);
        $this->assertContains('agreement_ids', $diagnostics['available_container_keys']['extension_attributes']);
        $this->assertStringNotContainsString('secret-transaction-value', $encodedDiagnostics);
        $this->assertStringNotContainsString('secret-token-value', $encodedDiagnostics);
    }

    public function testPlaceOrderStopsWhenCheckoutAgreementsAreInvalid(): void
    {
        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);
        $agreementsValidatorMock = $this->createMock(\Magento\Checkout\Api\AgreementsValidatorInterface::class);

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $loggerMock,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            $agreementsValidatorMock
        );

        $component->email = 'guest@example.com';
        $component->firstname = 'Jan';
        $component->lastname = 'Kowalski';
        $component->street1 = 'Testowa 1';
        $component->city = 'Warszawa';
        $component->postcode = '00-001';
        $component->countryId = 'PL';
        $component->telephone = '123456789';
        $component->paymentMethod = 'checkmo';
        $component->shippingMethod = 'flatrate_flatrate';
        $component->paymentExtensionAttributes = ['agreement_ids' => []];

        $shippingAddressMock = $this->createAddressMock();
        $billingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);
        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);
        $this->quoteMock->expects($this->once())
            ->method('setCustomerEmail')
            ->with('guest@example.com');
        $this->quoteMock->expects($this->once())
            ->method('isVirtual')
            ->willReturn(false);
        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);
        $this->quoteMock->expects($this->any())
            ->method('getBillingAddress')
            ->willReturn($billingAddressMock);
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $this->cartRepositoryMock->expects($this->exactly(2))
            ->method('save')
            ->with($this->quoteMock);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([$this->createPaymentMethodMock('checkmo')]);

        $agreementsValidatorMock->expects($this->once())
            ->method('isValid')
            ->with([])
            ->willReturn(false);

        $this->cartManagementMock->expects($this->never())
            ->method('placeOrder');

        $component->placeOrder();

        $this->assertStringContainsString('agree to the terms and conditions', $component->orderError);
    }

    public function testAgreementIdsAreReadFromRawPlaceOrderPaymentPayload(): void
    {
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->paymentExtensionAttributes = [];
        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'checkmo',
                'extensionAttributes' => [
                    'agreement_ids' => ['7', 8],
                ],
            ],
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'getAgreementIds');
        $method->setAccessible(true);

        $this->assertSame(['7', '8'], $method->invoke($this->checkoutComponent));
    }

    public function testResolveOrderRedirectUrlReadsPaymentAdditionalInformation(): void
    {
        $payment = new class {
            public function getAdditionalInformation($key = null)
            {
                $data = [
                    'checkout_redirect_url' => 'https://payments.example/redirect/123',
                ];

                if ($key === null) {
                    return $data;
                }

                return $data[$key] ?? null;
            }
        };

        $order = new class($payment) {
            private $payment;

            public function __construct($payment)
            {
                $this->payment = $payment;
            }

            public function getPayment()
            {
                return $this->payment;
            }
        };

        $method = new \ReflectionMethod($this->checkoutComponent, 'resolveOrderRedirectUrl');
        $method->setAccessible(true);

        $this->assertSame(
            'https://payments.example/redirect/123',
            $method->invoke($this->checkoutComponent, 100001, $order)
        );
    }

    public function testPlaceOrderResponseIncludesRedirectAliases(): void
    {
        $this->checkoutComponent->paymentMethod = 'external_gateway';

        $method = new \ReflectionMethod($this->checkoutComponent, 'buildPlaceOrderResponse');
        $method->setAccessible(true);

        $response = $method->invoke(
            $this->checkoutComponent,
            true,
            100001,
            'https://payments.example/redirect/123'
        );

        $this->assertTrue($response['success']);
        $this->assertSame(100001, $response['orderId']);
        $this->assertSame(100001, $response['order_id']);
        $this->assertSame('https://payments.example/redirect/123', $response['redirectUrl']);
        $this->assertSame('https://payments.example/redirect/123', $response['redirect_url']);
        $this->assertSame('https://payments.example/redirect/123', $response['redirectUri']);
        $this->assertSame('external_gateway', $response['payment_method']);
    }

    public function testPlaceOrderValidationError(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';

        $this->quoteMock->expects($this->once())
            ->method('hasItems')
            ->willReturn(true);

        $this->quoteMock->expects($this->once())
            ->method('getCustomerId')
            ->willReturn(null);

        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->willThrowException(new \Magento\Framework\Exception\LocalizedException(__('Postcode is required.')));

        $response = $this->checkoutComponent->placeOrder();

        $this->assertStringContainsString('Please check your address details', $this->checkoutComponent->orderError);
        $this->assertFalse($response['success']);
        $this->assertStringContainsString('Please check your address details', $response['message']);
    }

    public function testUpdatedResetsRegionOnCountryChange(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->checkoutComponent->billingSameAsShipping = false;
        $this->checkoutComponent->regionId = '12';
        $this->checkoutComponent->region = 'Some Region';
        
        $this->checkoutComponent->updated('US', 'countryId');
        
        $this->assertEquals('', $this->checkoutComponent->regionId);
        $this->assertEquals('', $this->checkoutComponent->region);
    }

    public function testGetPaymentMethodDetailsReturnsArray(): void
    {
        $details = $this->checkoutComponent->getPaymentMethodDetails('checkmo');
        $this->assertIsArray($details);
        $this->assertArrayHasKey('instructions', $details);
        $this->assertArrayHasKey('payable_to', $details);
        $this->assertArrayHasKey('mailing_address', $details);
    }

    public function testGetSavedAddressesReturnsEmptyForGuest(): void
    {
        // No customerSession injected → returns []
        $this->assertSame([], $this->checkoutComponent->getSavedAddresses());
    }

    public function testGetSavedAddressesReturnsEmptyWhenNotLoggedIn(): void
    {
        $customerSessionMock = $this->getMockBuilder(\Magento\Customer\Model\Session::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isLoggedIn', 'getCustomerId'])
            ->getMock();
        $customerSessionMock->method('isLoggedIn')->willReturn(false);

        $addressRepoMock = $this->createMock(\Magento\Customer\Api\AddressRepositoryInterface::class);
        $searchBuilderMock = $this->getMockBuilder(\Magento\Framework\Api\SearchCriteriaBuilder::class)
            ->disableOriginalConstructor()
            ->getMock();

        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $loggerMock,
            null, null, null,
            $customerSessionMock,
            $addressRepoMock,
            $searchBuilderMock
        );

        $this->assertSame([], $component->getSavedAddresses());
    }

    public function testFillFromSavedAddressPopulatesFields(): void
    {
        $regionMock = $this->getMockBuilder(\Magento\Customer\Api\Data\RegionInterface::class)
            ->getMock();
        $regionMock->method('getRegionId')->willReturn('10');
        $regionMock->method('getRegion')->willReturn('Mazowieckie');

        $addressMock = $this->getMockBuilder(\Magento\Customer\Api\Data\AddressInterface::class)
            ->getMock();
        $addressMock->method('getFirstname')->willReturn('Jan');
        $addressMock->method('getLastname')->willReturn('Kowalski');
        $addressMock->method('getCompany')->willReturn('ACME');
        $addressMock->method('getStreet')->willReturn(['ul. Testowa 1', 'm. 2']);
        $addressMock->method('getCity')->willReturn('Warszawa');
        $addressMock->method('getPostcode')->willReturn('00-001');
        $addressMock->method('getCountryId')->willReturn('PL');
        $addressMock->method('getTelephone')->willReturn('123456789');
        $addressMock->method('getRegion')->willReturn($regionMock);
        $addressMock->method('getCustomerId')->willReturn(123);

        $addressRepoMock = $this->createMock(\Magento\Customer\Api\AddressRepositoryInterface::class);
        $addressRepoMock->method('getById')->with(42)->willReturn($addressMock);

        $customerSessionMock = $this->getMockBuilder(\Magento\Customer\Model\Session::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isLoggedIn', 'getCustomerId'])
            ->getMock();
        $customerSessionMock->method('isLoggedIn')->willReturn(true);
        $customerSessionMock->method('getCustomerId')->willReturn(123);

        $searchBuilderMock = $this->getMockBuilder(\Magento\Framework\Api\SearchCriteriaBuilder::class)
            ->disableOriginalConstructor()
            ->getMock();

        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->method('getShippingMethod')->willReturn(null);
        $shippingAddressMock->method('getRegionId')->willReturn('10');
        $this->quoteMock->method('getShippingAddress')->willReturn($shippingAddressMock);
        $billingAddressMock = $this->createAddressMock();
        $this->quoteMock->method('getBillingAddress')->willReturn($billingAddressMock);
        $this->quoteMock->method('isVirtual')->willReturn(false);
        $this->quoteMock->method('getId')->willReturn(1);

        // Region collection mock so saveShippingAddress doesn't fail
        $regionItemMock = $this->getMockBuilder(\Magento\Directory\Model\Region::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getName'])
            ->getMock();
        $regionItemMock->method('getId')->willReturn(10);
        $regionItemMock->method('getName')->willReturn('Mazowieckie');

        $regionCollectionMock = $this->getMockBuilder(\Magento\Directory\Model\ResourceModel\Region\Collection::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['addFieldToFilter', 'getFirstItem'])
            ->getMock();
        $regionCollectionMock->method('addFieldToFilter')->willReturnSelf();
        $regionCollectionMock->method('getFirstItem')->willReturn($regionItemMock);

        $this->regionCollectionFactoryMock->method('create')->willReturn($regionCollectionMock);

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $loggerMock,
            null, null, null,
            $customerSessionMock,
            $addressRepoMock,
            $searchBuilderMock
        );

        $component->fillFromSavedAddress(42);

        $this->assertSame('Jan', $component->firstname);
        $this->assertSame('Kowalski', $component->lastname);
        $this->assertSame('Warszawa', $component->city);
        $this->assertSame('00-001', $component->postcode);
        $this->assertSame('PL', $component->countryId);
        $this->assertSame('ul. Testowa 1', $component->street1);
        $this->assertSame('m. 2', $component->street2);
    }

    public function testFillFromSavedAddressRejectsAddressOwnedByAnotherCustomer(): void
    {
        $addressMock = $this->getMockBuilder(\Magento\Customer\Api\Data\AddressInterface::class)
            ->getMock();
        $addressMock->method('getCustomerId')->willReturn(456);

        $addressRepoMock = $this->createMock(\Magento\Customer\Api\AddressRepositoryInterface::class);
        $addressRepoMock->expects($this->once())->method('getById')->with(42)->willReturn($addressMock);

        $customerSessionMock = $this->getMockBuilder(\Magento\Customer\Model\Session::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isLoggedIn', 'getCustomerId'])
            ->getMock();
        $customerSessionMock->method('isLoggedIn')->willReturn(true);
        $customerSessionMock->method('getCustomerId')->willReturn(123);

        $loggerMock = $this->createMock(\Psr\Log\LoggerInterface::class);
        $loggerMock->expects($this->once())->method('warning');

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->helperMock,
            $loggerMock,
            null,
            null,
            null,
            $customerSessionMock,
            $addressRepoMock,
            null
        );

        $component->fillFromSavedAddress(42);

        $this->assertSame('', $component->firstname);
        $this->assertSame('', $component->street1);
    }

    public function testNormalizePaymentPayloadPreservesCompatibleNestedData(): void
    {
        $arrayableObject = new class {
            public function toArray()
            {
                return ['token' => 'tok_123'];
            }
        };
        $stringableObject = new class {
            public function __toString()
            {
                return 'string-token';
            }
        };
        $simpleObject = new class {
            public function __toArray()
            {
                return [
                    'masked_id' => 'abc123',
                    'nested' => [
                        'provider' => 'gateway_api',
                    ],
                ];
            }
        };
        $dataObject = new \Magento\Framework\DataObject([
            'fraud_session_id' => 'fraud-1',
        ]);
        $attributeObject = new class {
            public function getAttributeCode()
            {
                return 'delivery_note';
            }

            public function getValue()
            {
                return 'call before delivery';
            }
        };
        $codeAttributeObject = new class {
            public function getCode()
            {
                return 'courier_service';
            }

            public function getValue()
            {
                return 'same-day';
            }
        };

        $unsupportedObject = new \stdClass();

        $method = new \ReflectionMethod($this->checkoutComponent, 'normalizePaymentPayload');
        $method->setAccessible(true);

        $result = $method->invoke($this->checkoutComponent, [
            'method' => 'external_gateway',
            'additionalData' => [
                'blik_code' => '123456',
                'nested' => [
                    'customer' => 'guest',
                    'unsafe' => $unsupportedObject,
                ],
            ],
            'extensionAttributes' => [
                'agreement_ids' => [1, '2'],
            ],
            'custom_attributes' => [
                [
                    'attribute_code' => 'locker_id',
                    'value' => 'KRA01A',
                ],
                [
                    'attributeCode' => 'pickup_location_code',
                    'value' => 'POP-42',
                ],
                [
                    'code' => 'delivery_zone',
                    'value' => 'Z1',
                ],
                [
                    'name' => 'delivery_hint',
                    'value' => 'side door',
                ],
                $attributeObject,
                $codeAttributeObject,
            ],
            'token_data' => $arrayableObject,
            'string_token' => $stringableObject,
            'api_object' => $simpleObject,
            'data_object' => $dataObject,
            'callback' => static function (): void {
            },
        ]);

        $this->assertSame('external_gateway', $result['method']);
        $this->assertSame('123456', $result['additional_data']['blik_code']);
        $this->assertSame('guest', $result['additional_data']['nested']['customer']);
        $this->assertArrayNotHasKey('unsafe', $result['additional_data']['nested']);
        $this->assertSame([1, '2'], $result['extension_attributes']['agreement_ids']);
        $this->assertSame('KRA01A', $result['custom_attributes']['locker_id']);
        $this->assertSame('POP-42', $result['custom_attributes']['pickup_location_code']);
        $this->assertSame('Z1', $result['custom_attributes']['delivery_zone']);
        $this->assertSame('side door', $result['custom_attributes']['delivery_hint']);
        $this->assertSame('call before delivery', $result['custom_attributes']['delivery_note']);
        $this->assertSame('same-day', $result['custom_attributes']['courier_service']);
        $this->assertSame('tok_123', $result['token_data']['token']);
        $this->assertSame('string-token', $result['string_token']);
        $this->assertSame('abc123', $result['api_object']['masked_id']);
        $this->assertSame('gateway_api', $result['api_object']['nested']['provider']);
        $this->assertSame('fraud-1', $result['data_object']['fraud_session_id']);
        $this->assertArrayNotHasKey('callback', $result);
        $this->assertArrayNotHasKey('additionalData', $result);
        $this->assertArrayNotHasKey('extensionAttributes', $result);
    }

    public function testNormalizePaymentAdditionalAliasesKeepsCommonGatewayKeyVariants(): void
    {
        $method = new \ReflectionMethod($this->checkoutComponent, 'normalizePaymentAdditionalAliases');
        $method->setAccessible(true);

        $result = $method->invoke($this->checkoutComponent, [
            'blikCode' => '123456',
            'regulationAccept' => true,
            'methodId' => '154',
            'channel_id' => '64',
            'saveAlias' => true,
            'savedId' => 'card-42',
            'card_short_code' => '1111',
            'cardData' => 'encrypted-card-payload',
            'cardSave' => true,
            'cardVendor' => 'VI',
            'session_id' => 'SESSION-1',
            'ref_id' => 'REF-1',
            'card_type' => 'visa',
            'card_date' => '12/30',
            'card_mask' => '411111******1111',
        ]);

        $this->assertSame('123456', $result['blikCode']);
        $this->assertSame('123456', $result['blik_code']);
        $this->assertTrue($result['regulationAccept']);
        $this->assertTrue($result['regulation_accept']);
        $this->assertSame('154', $result['method']);
        $this->assertSame('154', $result['methodId']);
        $this->assertSame('64', $result['channel']);
        $this->assertSame('64', $result['channelId']);
        $this->assertTrue($result['blik_alias']);
        $this->assertTrue($result['saveAlias']);
        $this->assertSame('card-42', $result['card_id']);
        $this->assertSame('card-42', $result['savedId']);
        $this->assertSame('1111', $result['short_code']);
        $this->assertSame('1111', $result['card_short_code']);
        $this->assertSame('encrypted-card-payload', $result['card_data']);
        $this->assertTrue($result['card_save']);
        $this->assertSame('VI', $result['card_vendor']);
        $this->assertSame('SESSION-1', $result['sessionId']);
        $this->assertSame('REF-1', $result['refId']);
        $this->assertSame('visa', $result['cardType']);
        $this->assertSame('12/30', $result['cardDate']);
        $this->assertSame('411111******1111', $result['cardMask']);
    }

    public function testApplyAddressAttributesPersistsCustomAndExtensionData(): void
    {
        $address = new class {
            public $customAttributes = [];
            public $data = [];
            public $extensionAttributes;

            public function __construct()
            {
                $this->extensionAttributes = new class {
                    public $lockerId = null;
                    public $deliveryComment = null;

                    public function setLockerId($value): void
                    {
                        $this->lockerId = $value;
                    }

                    public function setDeliveryComment($value): void
                    {
                        $this->deliveryComment = $value;
                    }
                };
            }

            public function setCustomAttribute($code, $value): void
            {
                $this->customAttributes[$code] = $value;
            }

            public function setData($code, $value): void
            {
                $this->data[$code] = $value;
            }

            public function getExtensionAttributes()
            {
                return $this->extensionAttributes;
            }

            public function setExtensionAttributes($extensionAttributes): void
            {
                $this->extensionAttributes = $extensionAttributes;
            }
        };

        $stringableComment = new class {
            public function __toString()
            {
                return 'leave at reception';
            }
        };
        $pickupPoint = new class {
            public function __toArray()
            {
                return [
                    'id' => 'POP-1',
                    'type' => 'pickup',
                ];
            }
        };
        $attributeObject = new class {
            public function getAttributeCode()
            {
                return 'floor';
            }

            public function getValue()
            {
                return '3';
            }
        };

        $method = new \ReflectionMethod($this->checkoutComponent, 'applyAddressAttributes');
        $method->setAccessible(true);

        $method->invoke(
            $this->checkoutComponent,
            $address,
            [
                [
                    'attribute_code' => 'door_code',
                    'value' => '12A',
                ],
                'delivery_window' => [
                    'from' => '10:00',
                    'to' => '12:00',
                ],
                'pickup_point' => $pickupPoint,
                $attributeObject,
            ],
            [
                'locker_id' => 'KRA01A',
                'delivery_comment' => $stringableComment,
            ]
        );

        $this->assertSame('12A', $address->customAttributes['door_code']);
        $this->assertSame('3', $address->customAttributes['floor']);
        $this->assertSame(['from' => '10:00', 'to' => '12:00'], $address->customAttributes['delivery_window']);
        $this->assertSame(['id' => 'POP-1', 'type' => 'pickup'], $address->customAttributes['pickup_point']);
        $this->assertSame('KRA01A', $address->data['locker_id']);
        $this->assertSame('leave at reception', $address->data['delivery_comment']);
        $this->assertSame('KRA01A', $address->extensionAttributes->lockerId);
        $this->assertSame('leave at reception', $address->extensionAttributes->deliveryComment);
    }

    public function testApplyQuoteInpostLockerIdPersistsSmartmageCartAttribute(): void
    {
        $quote = new class {
            public $data = [];
            public $extensionAttributes;

            public function __construct()
            {
                $this->extensionAttributes = new class {
                    public $inpostLockerId = null;

                    public function setInpostLockerId($value): void
                    {
                        $this->inpostLockerId = $value;
                    }
                };
            }

            public function setData($code, $value): void
            {
                $this->data[$code] = $value;
            }

            public function getExtensionAttributes()
            {
                return $this->extensionAttributes;
            }

            public function setExtensionAttributes($extensionAttributes): void
            {
                $this->extensionAttributes = $extensionAttributes;
            }
        };

        $this->checkoutComponent->shippingMethod = 'inpostlocker_standard';
        $this->checkoutComponent->shippingExtensionAttributes = [
            'point' => [
                'name' => 'KRA01A',
                'type' => 'parcel_locker',
            ],
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'applyQuoteInpostLockerId');
        $method->setAccessible(true);
        $method->invoke($this->checkoutComponent, $quote);

        $this->assertSame('KRA01A', $quote->data['inpost_locker_id']);
        $this->assertSame('KRA01A', $quote->extensionAttributes->inpostLockerId);
    }

    public function testApplyQuoteInpostLockerIdIgnoresNonInpostShippingMethod(): void
    {
        $quote = new class {
            public $data = [];

            public function setData($code, $value): void
            {
                $this->data[$code] = $value;
            }
        };

        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';
        $this->checkoutComponent->shippingExtensionAttributes = [
            'inpost_locker_id' => 'KRA01A',
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'applyQuoteInpostLockerId');
        $method->setAccessible(true);
        $method->invoke($this->checkoutComponent, $quote);

        $this->assertArrayNotHasKey('inpost_locker_id', $quote->data);
    }

    public function testRawPlaceOrderAddressAttributesAreMergedWithMagewireAddressAttributes(): void
    {
        $this->checkoutComponent->placeOrderRequestData = [
            'addressInformation' => [
                'shipping_address' => [
                    'custom_attributes' => [
                        [
                            'attribute_code' => 'pickup_location_code',
                            'value' => 'ADDR-POINT',
                        ],
                    ],
                    'extensionAttributes' => [
                        'locker_id' => 'ADDR-LOCKER',
                        'metadata' => [
                            'source' => 'address',
                        ],
                    ],
                ],
                'extension_attributes' => [
                    'delivery_comment' => 'top-level comment',
                    'metadata' => [
                        'top_level' => true,
                    ],
                ],
                'billing_address' => [
                    'extension_attributes' => [
                        'invoice_code' => 'RAW-BILL',
                    ],
                ],
            ],
            'shippingAddress' => [
                'customAttributes' => [
                    [
                        'attributeCode' => 'shipping_gate_code',
                        'value' => 'GATE-7',
                    ],
                ],
                'extension_attributes' => [
                    'locker_id' => 'TOP-LOCKER',
                    'metadata' => [
                        'top_shipping' => true,
                    ],
                ],
            ],
            'billingAddress' => [
                'customAttributes' => [
                    [
                        'attributeCode' => 'billing_note',
                        'value' => 'raw billing note',
                    ],
                ],
            ],
        ];
        $this->checkoutComponent->shippingCustomAttributes = [
            'pickup_location_code' => 'COMPONENT-POINT',
            'delivery_note' => 'component note',
        ];
        $this->checkoutComponent->shippingExtensionAttributes = [
            'metadata' => [
                'source' => 'component',
            ],
            'component_only' => true,
        ];
        $this->checkoutComponent->billingExtensionAttributes = [
            'invoice_code' => 'COMPONENT-BILL',
        ];

        $customMethod = new \ReflectionMethod($this->checkoutComponent, 'getMergedAddressCustomAttributes');
        $customMethod->setAccessible(true);
        $extensionMethod = new \ReflectionMethod($this->checkoutComponent, 'getMergedAddressExtensionAttributes');
        $extensionMethod->setAccessible(true);

        $shippingCustomAttributes = $customMethod->invoke($this->checkoutComponent, false);
        $shippingExtensionAttributes = $extensionMethod->invoke($this->checkoutComponent, false);
        $billingCustomAttributes = $customMethod->invoke($this->checkoutComponent, true);
        $billingExtensionAttributes = $extensionMethod->invoke($this->checkoutComponent, true);

        $this->assertSame('COMPONENT-POINT', $shippingCustomAttributes['pickup_location_code']);
        $this->assertSame('component note', $shippingCustomAttributes['delivery_note']);
        $this->assertSame('GATE-7', $shippingCustomAttributes['shipping_gate_code']);
        $this->assertSame('ADDR-LOCKER', $shippingExtensionAttributes['locker_id']);
        $this->assertSame('top-level comment', $shippingExtensionAttributes['delivery_comment']);
        $this->assertSame('component', $shippingExtensionAttributes['metadata']['source']);
        $this->assertTrue($shippingExtensionAttributes['metadata']['top_level']);
        $this->assertTrue($shippingExtensionAttributes['metadata']['top_shipping']);
        $this->assertTrue($shippingExtensionAttributes['component_only']);
        $this->assertSame('raw billing note', $billingCustomAttributes['billing_note']);
        $this->assertSame('COMPONENT-BILL', $billingExtensionAttributes['invoice_code']);
    }

    public function testRawEmailIsReadFromNestedAddressPayload(): void
    {
        $this->checkoutComponent->email = '';
        $this->checkoutComponent->placeOrderRequestData = [
            'addressInformation' => [
                'shipping_address' => [
                    'email' => 'shipping@example.com',
                ],
            ],
            'billing_address' => [
                'email' => 'billing@example.com',
            ],
        ];

        $method = new \ReflectionMethod($this->checkoutComponent, 'applyRawEmailIfMissing');
        $method->setAccessible(true);
        $method->invoke($this->checkoutComponent);

        $this->assertSame('billing@example.com', $this->checkoutComponent->email);
    }

    public function testRawShippingMethodIsAppliedWhenMagewireShippingMethodIsMissing(): void
    {
        $this->checkoutComponent->shippingMethod = '';
        $this->checkoutComponent->placeOrderRequestData = [
            'addressInformation' => [
                'shippingMethod' => [
                    'carrierCode' => 'customcarrier',
                    'methodCode' => 'pickup_point_cod',
                ],
            ],
        ];

        $address = new class {
            public $shippingMethod = '';

            public function setShippingMethod($shippingMethod): void
            {
                $this->shippingMethod = $shippingMethod;
            }
        };

        $quote = new class($address) {
            private $address;

            public function __construct($address)
            {
                $this->address = $address;
            }

            public function getShippingAddress()
            {
                return $this->address;
            }
        };

        $method = new \ReflectionMethod($this->checkoutComponent, 'applyRawShippingMethodIfMissing');
        $method->setAccessible(true);
        $method->invoke($this->checkoutComponent, $quote);

        $this->assertSame('customcarrier_pickup_point_cod', $this->checkoutComponent->shippingMethod);
        $this->assertSame('customcarrier_pickup_point_cod', $address->shippingMethod);
    }
}
