<?php
namespace IWD\Opc\Plugin\Block;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Customer\Model\AttributeMetadataDataProvider;
use Magento\Ui\Component\Form\AttributeMapper;
use Magento\Checkout\Block\Checkout\AttributeMerger;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Model\Options;
use Magento\Checkout\Helper\Data;

class LayoutProcessor
{
    /**
     * @var AttributeMetadataDataProvider
     */
    public $attributeMetadataDataProvider;

    /**
     * @var AttributeMapper
     */
    public $attributeMapper;

    /**
     * @var AttributeMerger
     */
    public $merger;

    /**
     * @var CheckoutSession
     */
    public $checkoutSession;

    /**
     * @var null
     */
    public $quote = null;

    /**
     * @var Options
     */
    public $options;

    /**
     * @var Data
     */
    private $checkoutDataHelper;

    /**
     * @var OpcHelper
     */
    public $opcHelper;

    /**
     * LayoutProcessor constructor.
     *
     * @param AttributeMetadataDataProvider $attributeMetadataDataProvider
     * @param AttributeMapper $attributeMapper
     * @param AttributeMerger $merger
     * @param CheckoutSession $checkoutSession
     * @param Data $checkoutDataHelper
     * @param Options $options
     */
    public function __construct(
        AttributeMetadataDataProvider $attributeMetadataDataProvider,
        AttributeMapper $attributeMapper,
        AttributeMerger $merger,
        CheckoutSession $checkoutSession,
        Data $checkoutDataHelper,
        Options $options = null,
        OpcHelper $opcHelper
    ) {
        $this->attributeMetadataDataProvider = $attributeMetadataDataProvider;
        $this->attributeMapper = $attributeMapper;
        $this->merger = $merger;
        $this->checkoutSession = $checkoutSession;
        $this->checkoutDataHelper = $checkoutDataHelper;
        $this->options = $options ?: \Magento\Framework\App\ObjectManager::getInstance()
            ->get(\Magento\Customer\Model\Options::class);
        $this->opcHelper = $opcHelper;
    }

    /**
     * Get Quote
     *
     * @return \Magento\Quote\Model\Quote|null
     */
    public function getQuote()
    {
        if (null === $this->quote) {
            $this->quote = $this->checkoutSession->getQuote();
        }

        return $this->quote;
    }

    /**
     * @param \Magento\Checkout\Block\Checkout\LayoutProcessor $subject
     * @param array $jsLayoutResult
     * @return array
     */
    public function afterProcess(
        \Magento\Checkout\Block\Checkout\LayoutProcessor $subject,
        array $jsLayoutResult
    ) {

        if ($this->opcHelper->isEnable()) {
            if (!$this->opcHelper->isCheckoutPage()) {
                return $jsLayoutResult;
            }
        } else if(!$this->opcHelper->isEnable()) {
            return $jsLayoutResult;
        }

        if($this->getQuote()->isVirtual()) {
            return $jsLayoutResult;
        }

        $attributesToConvert = [
            'prefix' => [$this->options, 'getNamePrefixOptions'],
            'suffix' => [$this->options, 'getNameSuffixOptions'],
        ];

        if(isset($jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']['children']
            ['shippingAddress']['children']['shipping-address-fieldset'])) {

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['shipping-address-fieldset']['children']['street']['children'][0]['placeholder'] = __('Street Address');
            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['shipping-address-fieldset']['children']['street']['children'][1]['placeholder'] = __('Street line 2');

            $elements = $this->getAddressAttributes();
            $elements = $this->convertElementsToSelect($elements, $attributesToConvert);
            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address'] = $this->getCustomBillingAddressComponent($elements);

            // Update Billing First Name Field
            $firstname = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['firstname'];

            $firstname['label'] = new \Magento\Framework\Phrase('First Name *');
            $firstname['sortOrder'] = '10';
            $firstname['placeholder'] = false;
            $firstname['config']['template'] = 'IWD_Opc/form/field';
            $firstname['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $firstname['config']['additionalClasses'] = 'float-left';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['firstname'] = $firstname;

            // Update Billing Last Name Field
            $lastname = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['lastname'];

            $lastname['label'] = new \Magento\Framework\Phrase('Last Name *');
            $lastname['sortOrder'] = '20';
            $lastname['placeholder'] = false;
            $lastname['config']['template'] = 'IWD_Opc/form/field';
            $lastname['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $lastname['config']['additionalClasses'] = 'float-right';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['lastname'] = $lastname;

            // Update Billing Street Field
            $street = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['street'];

            $street['sortOrder'] = '30';
            $street['config']['template'] = 'IWD_Opc/group/group';
            $street['children'][0]['visible'] = true;
            $street['children'][0]['label'] = new \Magento\Framework\Phrase('Street Address *');
            $street['children'][0]['placeholder'] = __('Street Address *');
            $street['children'][0]['config']['template'] = 'IWD_Opc/form/field';
            $street['children'][0]['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $street['children'][1]['visible'] = true;
            $street['children'][1]['label'] = new \Magento\Framework\Phrase('Apartment / Suite / Building');
            $street['children'][1]['placeholder'] = __('Apartment / Suite / Building');
            $street['children'][1]['config']['template'] = 'IWD_Opc/form/field';
            $street['children'][1]['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $street['children'][1]['config']['validation'] = ['required-entry' => false];
            $street['children'][2]['visible'] = false;

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['street'] = $street;

            // Update Billing Country Field
            $country = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['country_id'];

            $country['label'] = new \Magento\Framework\Phrase('Select Country *');
            $country['sortOrder'] = '40';
            $country['placeholder'] = __('Select Country *');
            $country['config']['template'] = 'IWD_Opc/form/field';
            $country['config']['additionalClasses'] = 'float-left wd30-66 mr4';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['country_id'] = $country;

            // Update Billing Region Field
            $region = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['region'];

            $region['label'] = new \Magento\Framework\Phrase('State');
            $region['visible'] = false;
            $region['sortOrder'] = '50';
            $region['config']['template'] = 'IWD_Opc/form/field';
            $region['config']['additionalClasses'] = 'float-left wd30-66 mr4';
            $region['config']['elementTmpl'] = 'IWD_Opc/form/element/input';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['region'] = $region;

            // Update Billing Region ID Field
            $region_id = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['region_id'];

            $region_id['label'] = new \Magento\Framework\Phrase('');
            $region_id['sortOrder'] = '50';
            $region_id['placeholder'] = __('');
            $region_id['component'] = 'IWD_Opc/js/form/billing-address/element/region';
            $region_id['config']['template'] = 'IWD_Opc/form/field';
            $region_id['config']['elementTmpl'] = 'IWD_Opc/form/billing-address/element/select';
            $region_id['config']['customEntry'] = 'billingAddress.region';
            $region_id['config']['additionalClasses'] = 'float-left wd30-66 mr4';
            $region_id['validation']['required-entry'] = true;
            $region_id['filterBy']['target'] = '${ $.provider }:${ $.parentScope }.country_id';
            $region_id['filterBy']['field'] = 'country_id';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['region_id'] = $region_id;

            // Update Billing City Field
            $city = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['city'];

            $city['label'] = new \Magento\Framework\Phrase('Town / City *');
            $city['sortOrder'] = '60';
            $city['placeholder'] = __('Town / City *');
            $city['config']['template'] = 'IWD_Opc/form/field';
            $city['config']['additionalClasses'] = 'float-left wd30-66';
            $city['config']['elementTmpl'] = 'IWD_Opc/form/element/input';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['city'] = $city;

            // Update Billing Post Code Field
            $postcode = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['postcode'];

            $postcode['label'] = new \Magento\Framework\Phrase('Postcode / Zip *');
            $postcode['sortOrder'] = '70';
            $postcode['placeholder'] = __('Postcode / Zip *');
            $postcode['component'] = 'Magento_Ui/js/form/element/post-code';
            $postcode['validation']['required-entry'] = true;
            $postcode['config']['template'] = 'IWD_Opc/form/field';
            $postcode['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $postcode['config']['additionalClasses'] = 'float-left wd30-66 mr4';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['postcode'] = $postcode;

            // Update Billing Telephone Field
            $telephone = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['telephone'];

            $telephone['label'] = new \Magento\Framework\Phrase('Phone *');
            $telephone['sortOrder'] = '80';
            $telephone['placeholder'] = __('Phone *');
            $telephone['config']['tooltip'] = false;
            $telephone['config']['template'] = 'IWD_Opc/form/field';
            $telephone['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $telephone['config']['additionalClasses'] = 'float-left wd30-66 mr4';

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['telephone'] = $telephone;

            // Update Billing Company Field
            $company = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['company'];

            $company['visible'] = false;

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['company'] = $company;

            // Update Billing Fax Field
            $fax = $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['fax'];

            $fax['visible'] = false;

            $jsLayoutResult['components']['checkout']['children']['steps']['children']['shipping-step']
            ['children']['shippingAddress']['children']['billing-address']['children']['form-fields']['children']['fax'] = $fax;
        }

        //Remove billing address from payment step
        if ($this->checkoutDataHelper->isDisplayBillingOnPaymentMethodAvailable()) {
            if(isset($jsLayoutResult['components']['checkout']['children']['steps']['children']['billing-step']['children']
                ['payment']['children']['payments-list']['children'])) {
                $paymentListChildren = $jsLayoutResult['components']['checkout']['children']['steps']['children']['billing-step']['children']
                ['payment']['children']['payments-list']['children'];

                foreach ($paymentListChildren as $childKey=>$childInfos) {
                    if(!empty($childInfos['component']) && $childInfos['component'] == 'Magento_Checkout/js/view/billing-address') {
                        unset($paymentListChildren[$childKey]);
                    }
                }
                $jsLayoutResult['components']['checkout']['children']['steps']['children']['billing-step']['children']
                ['payment']['children']['payments-list']['children'] = $paymentListChildren;
            }
        } else {
            if (isset($jsLayoutResult['components']['checkout']['children']['steps']['children']['billing-step']['children']
                ['payment']['children']['afterMethods']['children']['billing-address-form']) ) {
                unset($jsLayoutResult['components']['checkout']['children']['steps']['children']['billing-step']['children']
                    ['payment']['children']['afterMethods']['children']['billing-address-form']);
            }
        }

        return $jsLayoutResult;
    }

    /**
     * Get all visible address attribute
     *
     * @return array
     */
    private function getAddressAttributes()
    {
        /** @var \Magento\Eav\Api\Data\AttributeInterface[] $attributes */
        $attributes = $this->attributeMetadataDataProvider->loadAttributesCollection(
            'customer_address',
            'customer_register_address'
        );

        $elements = [];
        foreach ($attributes as $attribute) {
            $code = $attribute->getAttributeCode();
            if ($attribute->getIsUserDefined()) {
                continue;
            }
            $elements[$code] = $this->attributeMapper->map($attribute);
            if (isset($elements[$code]['label'])) {
                $label = $elements[$code]['label'];
                $elements[$code]['label'] = __($label);
            }
        }
        return $elements;
    }

    /**
     * Prepare billing address field for shipping step for physical product
     *
     * @param $elements
     * @return array
     */
    public function getCustomBillingAddressComponent($elements)
    {
        return [
            'component' => 'IWD_Opc/js/view/billing-address',
            'displayArea' => 'billing-address',
            'provider' => 'checkoutProvider',
            'deps' => ['checkoutProvider'],
            'dataScopePrefix' => 'billingAddress',
            'children' => [
                'form-fields' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'additional-fieldsets',
                    'children' => $this->merger->merge(
                        $elements,
                        'checkoutProvider',
                        'billingAddress',
                        [
                            'country_id' => [
                                'component' => 'IWD_Opc/js/form/billing-address/element/select',
                                'config' => [
                                    'elementTmpl' => 'IWD_Opc/form/billing-address/element/select',
                                    'customEntry' => 'billingAddress.country_id',
                                ],
                            ],
//                            'region' => [
//                                'visible' => false,
//                            ],
                            'region_id' => [
                                'component' => 'Magento_Ui/js/form/element/region',
                                'config' => [
                                    'template' => 'IWD_Opc/form/field',
                                    'elementTmpl' => 'ui/form/element/select',
                                    'customEntry' => 'billingAddress.region',
                                ],
                                'validation' => [
                                    'required-entry' => true,
                                ],
                                'filterBy' => [
                                    'target' => '${ $.provider }:${ $.parentScope }.country_id',
                                    'field' => 'country_id',
                                ],
                            ],
                            'postcode' => [
                                'component' => 'Magento_Ui/js/form/element/post-code',
                                'validation' => [
                                    'required-entry' => true,
                                ],
                            ],
                            'company' => [
                                'validation' => [
                                    'min_text_length' => 0,
                                ],
                            ],
                            'fax' => [
                                'validation' => [
                                    'min_text_length' => 0,
                                ],
                            ],
                            'telephone' => [
                                'config' => [
//                                    'tooltip' => [
//                                        'description' => __('For delivery questions.'),
//                                    ],
                                ],
                            ],
                        ]
                    ),
                ],
            ],
        ];
    }

    /**
     * Convert elements(like prefix and suffix) from inputs to selects when necessary
     *
     * @param array $elements address attributes
     * @param array $attributesToConvert fields and their callbacks
     * @return array
     */
    private function convertElementsToSelect($elements, $attributesToConvert)
    {
        $codes = array_keys($attributesToConvert);
        foreach (array_keys($elements) as $code) {
            if (!in_array($code, $codes)) {
                continue;
            }
            // phpcs:ignore Magento2.Functions.DiscouragedFunction
            $options = call_user_func($attributesToConvert[$code]);
            if (!is_array($options)) {
                continue;
            }
            $elements[$code]['dataType'] = 'select';
            $elements[$code]['formElement'] = 'select';

            foreach ($options as $key => $value) {
                $elements[$code]['options'][] = [
                    'value' => $key,
                    'label' => $value,
                ];
            }
        }

        return $elements;
    }
}
