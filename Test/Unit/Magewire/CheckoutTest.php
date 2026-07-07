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
        $this->helperMock->method('isRestrictPaymentEnable')
            ->willReturn(false);
        $this->helperMock->method('getRestrictPaymentMethods')
            ->willReturn([]);
        $this->helperMock->method('isPaymentMethodCodeAllowedByRules')
            ->willReturnCallback(static function ($methodCode, array $allowedRules): bool {
                $methodCode = (string)$methodCode;
                foreach ($allowedRules as $rule) {
                    $rule = trim((string)$rule);
                    if ($rule === '*' || $rule === $methodCode) {
                        return true;
                    }
                    if (substr($rule, -1) === '*') {
                        $prefix = rtrim(substr($rule, 0, -1), '_-');
                        if (
                            $prefix !== ''
                            && (
                                $methodCode === $prefix
                                || strpos($methodCode, $prefix . '_') === 0
                                || strpos($methodCode, $prefix . '-') === 0
                            )
                        ) {
                            return true;
                        }
                    }
                }
                return false;
            });
        $this->helperMock->method('paymentMethodCodeMatches')
            ->willReturnCallback(static function ($baseCode, $selectedCode): bool {
                $baseCode = trim((string)$baseCode);
                $selectedCode = trim((string)$selectedCode);

                return $baseCode !== ''
                    && $selectedCode !== ''
                    && (
                        $baseCode === $selectedCode
                        || strpos($selectedCode, $baseCode . '_') === 0
                        || strpos($selectedCode, $baseCode . '-') === 0
                    );
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

    private function createAddressMock(array $additionalMethods = []): MockObject
    {
        $realMethods = [
            'getFirstname', 'getLastname', 'getCompany', 'getStreet', 'getCity', 
            'getPostcode', 'getCountryId', 'getRegionId', 'getRegion', 'getTelephone', 
            'getShippingMethod', 'setFirstname', 'setLastname', 'setStreet', 'setCity', 
            'setPostcode', 'setCountryId', 'setRegionId', 'setRegion', 'setTelephone', 
            'setCompany', 'getGroupedAllShippingRates'
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
                ],
                'extension_attributes' => [
                    'agreement_ids' => ['1'],
                ],
            ],
        ];
        $this->checkoutComponent->paymentAdditionalData = [
            'custom_additional' => 'overridden-value',
        ];
        $this->checkoutComponent->paymentExtensionAttributes = [
            'agreement_ids' => ['2'],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'checkmo'
                    && $data['custom_top_level'] === 'custom-value'
                    && $data['additional_data']['custom_additional'] === 'overridden-value'
                    && $data['additional_data']['accept_tos'] === true
                    && $data['extension_attributes']['agreement_ids'] === ['2'];
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('checkmo');
    }

    public function testSelectPaymentMethodImportsVariantPayloadThroughAvailableBaseMethod(): void
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

        $paymentMock = $this->getMockBuilder(\Magento\Quote\Model\Quote\Payment::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['importData'])
            ->getMock();

        $this->quoteMock->expects($this->once())
            ->method('getPayment')
            ->willReturn($paymentMock);

        $this->checkoutComponent->placeOrderRequestData = [
            'paymentMethod' => [
                'method' => 'payu_blik',
                'additional_data' => [
                    'blik_code' => '123456',
                    'selected_channel' => 'blik',
                ],
            ],
        ];

        $paymentMock->expects($this->once())
            ->method('importData')
            ->with($this->callback(static function (array $data): bool {
                return $data['method'] === 'payu'
                    && $data['additional_data']['blik_code'] === '123456'
                    && $data['additional_data']['selected_channel'] === 'blik';
            }));

        $this->quoteMock->expects($this->once())->method('collectTotals');
        $this->cartRepositoryMock->expects($this->once())
            ->method('save')
            ->with($this->quoteMock);

        $this->checkoutComponent->selectPaymentMethod('payu_blik');

        $this->assertSame('payu_blik', $this->checkoutComponent->paymentMethod);
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
                $this->createPaymentMethodMock('tpay', 'Tpay'),
            ]);

        $this->checkoutComponent->paymentMethod = 'checkmo';

        $state = $this->checkoutComponent->refreshCheckoutState();

        $this->assertSame('checkmo', $state['selected_payment_method']);
        $this->assertSame('SALE10', $state['coupon_code']);
        $this->assertSame(100.0, $state['totals']['grand_total']);
        $this->assertSame(75.0, $state['totals']['subtotal_with_discount']);
        $this->assertSame('grand_total', $state['totals']['total_segments'][1]['code']);
        $this->assertSame('tpay', $state['payment_methods'][1]['method']);
        $this->assertSame('Tpay', $state['payment_methods'][1]['title']);
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
            'error_message' => '',
            'extension_attributes' => [
                'pickup_point_required' => true,
                'metadata' => [
                    'provider' => 'locker_vendor',
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
        $this->assertSame(12.5, $state['shipping_rates'][0]['amount']);
        $this->assertTrue($state['shipping_rates'][0]['available']);
        $this->assertTrue($state['shipping_rates'][0]['extension_attributes']['pickup_point_required']);
        $this->assertSame('locker_vendor', $state['shipping_rates'][0]['extension_attributes']['metadata']['provider']);
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

        $this->assertSame(['cashondelivery', 'payu_gateway'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));
    }

    public function testGetAllowedPaymentMethodsAppliesGlobalPaymentRestrictions(): void
    {
        $this->quoteMock->expects($this->any())
            ->method('getId')
            ->willReturn(42);

        $shippingAddressMock = $this->createAddressMock();
        $shippingAddressMock->expects($this->any())
            ->method('getShippingMethod')
            ->willReturn('customcarrier_pickup');

        $this->quoteMock->expects($this->any())
            ->method('getShippingAddress')
            ->willReturn($shippingAddressMock);

        $this->paymentMethodManagementMock->expects($this->once())
            ->method('getList')
            ->with(42)
            ->willReturn([
                $this->createPaymentMethodMock('checkmo'),
                $this->createPaymentMethodMock('payu_blik'),
                $this->createPaymentMethodMock('payu_card'),
                $this->createPaymentMethodMock('stripe_payments'),
            ]);

        $helperMock = $this->createMock(\Kkkonrad\Fastcheckout\Helper\Data::class);
        $helperMock->method('getMappedPaymentMethodsForShipping')
            ->with('customcarrier_pickup')
            ->willReturn(['*']);
        $helperMock->method('isRestrictPaymentEnable')
            ->willReturn(true);
        $helperMock->method('getRestrictPaymentMethods')
            ->willReturn(['payu_*', 'checkmo']);
        $helperMock->method('isPaymentMethodCodeAllowedByRules')
            ->willReturnCallback(static function ($methodCode, array $allowedRules): bool {
                $methodCode = (string)$methodCode;
                foreach ($allowedRules as $rule) {
                    $rule = trim((string)$rule);
                    if ($rule === '*' || $rule === $methodCode) {
                        return true;
                    }
                    if (substr($rule, -1) === '*') {
                        $prefix = rtrim(substr($rule, 0, -1), '_');
                        if ($prefix !== '' && strpos($methodCode, $prefix . '_') === 0) {
                            return true;
                        }
                    }
                }
                return false;
            });

        $component = new Checkout(
            $this->checkoutSessionMock,
            $this->cartRepositoryMock,
            $this->shippingMethodManagementMock,
            $this->paymentMethodManagementMock,
            $this->cartManagementMock,
            $this->countryCollectionFactoryMock,
            $this->regionCollectionFactoryMock,
            $this->subscriberFactoryMock,
            $helperMock,
            $this->createMock(\Psr\Log\LoggerInterface::class)
        );

        $methods = $component->getAllowedPaymentMethods();

        $this->assertSame(['checkmo', 'payu_blik', 'payu_card'], array_map(static function (PaymentMethodInterface $method): string {
            return $method->getCode();
        }, $methods));
    }

    public function testIsPaymentMethodAvailableUsesWildcardRules(): void
    {
        $this->assertTrue($this->checkoutComponent->isPaymentMethodAvailable('payu_blik', ['payu_*']));
        $this->assertTrue($this->checkoutComponent->isPaymentMethodAvailable('checkmo', ['checkmo']));
        $this->assertFalse($this->checkoutComponent->isPaymentMethodAvailable('stripe_payments', ['payu_*', 'checkmo']));
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

        $this->checkoutComponent->placeOrder();
        $this->assertEquals('', $this->checkoutComponent->orderError);
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

        $this->checkoutComponent->placeOrder();
        $this->assertStringContainsString('Please check your address details', $this->checkoutComponent->orderError);
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
                $attributeObject,
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
        $this->assertSame('call before delivery', $result['custom_attributes']['delivery_note']);
        $this->assertSame('tok_123', $result['token_data']['token']);
        $this->assertSame('string-token', $result['string_token']);
        $this->assertSame('abc123', $result['api_object']['masked_id']);
        $this->assertSame('gateway_api', $result['api_object']['nested']['provider']);
        $this->assertSame('fraud-1', $result['data_object']['fraud_session_id']);
        $this->assertArrayNotHasKey('callback', $result);
        $this->assertArrayNotHasKey('additionalData', $result);
        $this->assertArrayNotHasKey('extensionAttributes', $result);
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
}
