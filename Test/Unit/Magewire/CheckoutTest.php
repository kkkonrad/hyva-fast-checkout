<?php

declare(strict_types=1);

namespace IWD\Opc\Test\Unit\Magewire;

use IWD\Opc\Magewire\Checkout;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\ShippingMethodManagementInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Directory\Model\ResourceModel\Country\CollectionFactory as CountryCollectionFactory;
use Magento\Directory\Model\ResourceModel\Region\CollectionFactory as RegionCollectionFactory;
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
     * @var \IWD\Opc\Helper\Data|MockObject
     */
    private $opcHelperMock;

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
        $this->opcHelperMock = $this->createMock(\IWD\Opc\Helper\Data::class);

        $this->quoteMock = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getShippingAddress', 'getBillingAddress', 'getPayment', 'isVirtual', 'getId', 'setCheckoutMethod', 'collectTotals'])
            ->addMethods(['getCustomerId', 'getCustomerEmail', 'getCouponCode', 'setCustomerEmail', 'setCouponCode'])
            ->getMock();

        $this->checkoutSessionMock->expects($this->any())
            ->method('getQuote')
            ->willReturn($this->quoteMock);

        $this->checkoutComponent = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $this->opcHelperMock
        );
    }

    private function createAddressMock(array $additionalMethods = []): MockObject
    {
        $realMethods = [
            'getFirstname', 'getLastname', 'getCompany', 'getStreet', 'getCity', 
            'getPostcode', 'getCountryId', 'getRegionId', 'getRegion', 'getTelephone', 
            'getShippingMethod', 'setFirstname', 'setLastname', 'setStreet', 'setCity', 
            'setPostcode', 'setCountryId', 'setRegionId', 'setRegion', 'setTelephone', 
            'setCompany'
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
        $shippingAddressMock->expects($this->once())->method('getCountryId')->willReturn('PL');
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
        $billingAddressMock->expects($this->once())->method('setShouldIgnoreValidation')->with(true);

        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->saveBillingAddress();
    }

    public function testSelectShippingMethod(): void
    {
        $shippingAddressMock = $this->createAddressMock();

        $this->quoteMock->expects($this->once())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $shippingAddressMock->expects($this->once())
            ->method('setShippingMethod')
            ->with('flatrate_flatrate');
        $shippingAddressMock->expects($this->once())
            ->method('setCollectShippingRates')
            ->with(true);

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectShippingMethod('flatrate_flatrate');
        $this->assertEquals('flatrate_flatrate', $this->checkoutComponent->shippingMethod);
    }

    public function testSelectPaymentMethod(): void
    {
        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('setMethod')
            ->with('checkmo');

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
        $this->assertEquals('checkmo', $this->checkoutComponent->paymentMethod);
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

        $this->opcHelperMock->expects($this->once())
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

        $this->opcHelperMock->expects($this->once())
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

    public function testPlaceOrderSuccess(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';
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
            ->getMock();

        $this->quoteMock->expects($this->any())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $paymentMock->expects($this->once())
            ->method('setMethod')
            ->with('checkmo');

        $this->cartRepositoryMock->expects($this->any())
            ->method('save')
            ->with($this->quoteMock);

        $this->quoteMock->expects($this->once())
            ->method('getId')
            ->willReturn(42);

        $this->cartManagementMock->expects($this->once())
            ->method('placeOrder')
            ->with(42)
            ->willReturn(100001);

        $this->checkoutSessionMock->expects($this->once())
            ->method('clearHelperData');

        $this->checkoutComponent->placeOrder();
        $this->assertEquals('', $this->checkoutComponent->orderError);
    }

    public function testPlaceOrderValidationError(): void
    {
        $this->checkoutComponent->email = 'guest@example.com';
        $this->checkoutComponent->paymentMethod = 'checkmo';
        $this->checkoutComponent->shippingMethod = 'flatrate_flatrate';

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

        $this->checkoutComponent->placeOrder();
        $this->assertStringContainsString('Address validation failed', $this->checkoutComponent->orderError);
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
}
