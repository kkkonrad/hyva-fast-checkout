<?php

namespace IWD\Opc\Block\Checkout;

use Magento\Checkout\Block\Checkout\LayoutProcessorInterface;
use Magento\Customer\Model\AttributeMetadataDataProvider;
use Magento\Ui\Component\Form\AttributeMapper;
use Magento\Checkout\Block\Checkout\AttributeMerger;
use Magento\Checkout\Model\Session as CheckoutSession;
use IWD\Opc\Helper\Data as OpcHelper;

/**
 * Class UpdateLayoutProcessor
 * @package IWD\Opc\Block\Checkout
 */
class UpdateLayoutProcessor implements LayoutProcessorInterface
{
    /**
     * @var
     */
    public $jsLayout;

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
     * @var OpcHelper
     */
    public $opcHelper;

    /**
     * @var string
     */
    private $templateNonAutocomplete = 'IWD_Opc/form/element/inputNonAutocomplete';

    /**
     * UpdateLayoutProcessor constructor.
     * @param AttributeMetadataDataProvider $attributeMetadataDataProvider
     * @param AttributeMapper $attributeMapper
     * @param AttributeMerger $merger
     * @param CheckoutSession $checkoutSession
     * @param OpcHelper $opcHelper
     */
    public function __construct(
        AttributeMetadataDataProvider $attributeMetadataDataProvider,
        AttributeMapper $attributeMapper,
        AttributeMerger $merger,
        CheckoutSession $checkoutSession,
        OpcHelper $opcHelper
    ) {
        $this->attributeMetadataDataProvider = $attributeMetadataDataProvider;
        $this->attributeMapper = $attributeMapper;
        $this->merger = $merger;
        $this->checkoutSession = $checkoutSession;
        $this->opcHelper = $opcHelper;
    }

    /**
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
     * Process js Layout of block
     *
     * @param array $jsLayout
     * @return array
     */
    public function process($jsLayout)
    {
        $this->jsLayout = $jsLayout;
        if ($this->opcHelper->isEnable()) {
            if ($this->opcHelper->isCheckoutPage()) {
                $this->updateOnePage();
                $this->updateShipping();
                $this->processAddressFields();
                $this->updatePayment();
                $this->updateLoginButton();
                $this->updatePaymentButtons();
                $this->updateTotals();
                $this->disableAutocomplete();
                $this->updateSaasCheckout();
            }
        }

        return $this->jsLayout;
    }

    /**
     *
     */
    public function processAddressFields()
    {
        $shippingFields = $this->jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']
        ['children']['shippingAddress']['children']['shipping-address-fieldset']['children'];
        $shippingFields = $this->createPlaceholders($shippingFields);
        $shippingFields = $this->updateUiComponents($shippingFields);
        $this->jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']
        ['children']['shippingAddress']['children']['shipping-address-fieldset']['children'] = $shippingFields;
        $this->jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']
        ['children']['shippingAddress']['children']['customer-email']['placeholder'] = __('Email Address') . ' *';
        $this->jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']
        ['children']['shippingAddress']['children']['customer-email']['passwordPlaceholder'] = __('Password');

        $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
        ['children']['payment']['children']['customer-email']['placeholder'] = __('Email Address') . ' *';
        $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
        ['children']['payment']['children']['customer-email']['passwordPlaceholder'] = __('Password');

        if (isset($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
            ['children']['payment']['children']['afterMethods']['children']['billing-address-form'])) {
            $billingFields = $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
            ['children']['payment']['children']['afterMethods']['children']['billing-address-form']['children']
            ['form-fields']['children'];
            $billingFields = $this->addEeCustomAttributes($billingFields);
            $billingFields = $this->createPlaceholders($billingFields);
            $billingFields = $this->updateUiComponents($billingFields);
            $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
            ['children']['payment']['children']['afterMethods']['children']['billing-address-form']['children']
            ['form-fields']['children'] = $billingFields;
        } else {
            foreach ($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                     ['children']['payment']['children']['payments-list']['children'] as $paymentCode => $paymentMethod) {
                if (isset($paymentMethod['children']['form-fields']['children'])) {
                    $billingFields = $paymentMethod['children']['form-fields']['children'];
                    $billingFields = $this->createPlaceholders($billingFields);
                    $billingFields = $this->updateUiComponents($billingFields);
                    $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                    ['children']['payment']['children']['payments-list']['children'][$paymentCode]['children']
                    ['form-fields']['children'] = $billingFields;
                }
            }
        }
    }

    /**
     * @param $fields
     * @return array
     * @throws \Magento\Framework\Exception\LocalizedException
     */
    public function addEeCustomAttributes($fields)
    {
        $attributes = $this->attributeMetadataDataProvider->loadAttributesCollection(
            'customer_address',
            'customer_register_address'
        );
        $addressElements = [];
        foreach ($attributes as $attribute) {
            if (!$attribute->getIsUserDefined()) {
                continue;
            }

            $addressElements[$attribute->getAttributeCode()] = $this->attributeMapper->map($attribute);
        }

        if ($addressElements) {
            $fields = $this->merger->merge(
                $addressElements,
                'checkoutProvider',
                'billingAddressshared.custom_attributes',
                $fields
            );
        }

        return $fields;
    }

    /**
     * @param $fields
     * @return mixed
     */
    public function createPlaceholders($fields)
    {
        foreach ($fields as $key => $data) {
            if ((!isset($data['placeholder']) || !$data['placeholder'])) {
                $placeholder = isset($data['label']) && $data['label']
                    ? $data['label']
                    : $this->getPlaceholderForField($key);

                if ($placeholder) {
                    if (isset($data['type'])
                        && $data['type'] === 'group'
                        && isset($data['children'])
                        && !empty($data['children'])
                    ) {
                        foreach ($data['children'] as $childrenKey => $childrenData) {
                            if (!isset($data['placeholder']) || !$data['placeholder']) {
                                $fields[$key]['children'][$childrenKey] = $this->createPlaceholderForFields(
                                    $fields[$key]['children'][$childrenKey],
                                    $placeholder
                                );
                            }
                        }
                    } else {
                        $fields[$key] = $this->createRequiredLabelForFields($fields[$key], $placeholder);
                    }
                }
            }
        }

        return $fields;
    }

    public function createRequiredLabelForFields($field, $placeholder)
    {
        if (isset($field['validation']['required-entry'])
            && $field['validation']['required-entry']
        ) {
            if (isset($field['options'][0])) {
                $field['options'][0]['label'] .= ' *';
            } else {
                $placeholder .= ' *';
            }
        }

        $field['placeholder'] = $placeholder;

        return $field;
    }

    /**
     * @param $field
     * @param $placeholder
     * @return mixed
     */
    public function createPlaceholderForFields($field, $placeholder)
    {
        $is_required = false;

        if (isset($field['additionalClasses']) &&
            $field['additionalClasses'] === true
        ) {
            $field['additionalClasses'] = 'additional';
        }

        if (isset($field['validation']['required-entry'])
            && $field['validation']['required-entry']
        ) {
            if (isset($field['options'][0])) {
                $field['options'][0]['label'] .= ' *';
            } else {
                $is_required = true;
            }
        }

        $field['placeholder'] = $placeholder . ($is_required ? ' *' : '');

        return $field;
    }

    /**
     * @param $key
     * @return mixed|string
     */
    public function getPlaceholderForField($key)
    {
        $placeholder = '';
        $arrFields = [
            'fax' => __('Fax'),
        ];
        if (isset($arrFields[$key])) {
            $placeholder = $arrFields[$key];
        }

        return $placeholder;
    }

    /**
     * @param $fields
     * @return mixed
     */
    public function updateUiComponents($fields)
    {
        foreach ($fields as $key => $data) {
            if (isset($data['type']) && $data['type'] === 'group'
                && isset($data['children']) && !empty($data['children'])
            ) {
                foreach ($data['children'] as $childrenKey => $childrenData) {
                    if (isset($childrenData['component'])) {
                        $fields[$key]['children'][$childrenKey]['component'] =
                            $this->getReplacedUiComponent($childrenData['component']);
                        if (isset($childrenData['config']['elementTmpl'])) {
                            $fields[$key]['children'][$childrenKey]['config']['elementTmpl'] =
                                $this->getReplacedUiTemplate($childrenData['config']['elementTmpl']);
                        }
                    }
                }
            } else {
                if (isset($data['component'])) {
                    $fields[$key]['component'] = $this->getReplacedUiComponent($data['component']);
                    if (isset($data['config']['elementTmpl'])) {
                        $fields[$key]['config']['elementTmpl'] =
                            $this->getReplacedUiTemplate($data['config']['elementTmpl']);
                    }
                }
            }
        }

        return $fields;
    }

    /**
     * @param $component
     * @return mixed
     */
    public function getReplacedUiComponent($component)
    {
        $arrComponents = [
            'Magento_Ui/js/form/element/region' => 'IWD_Opc/js/form/element/region',
            'Magento_Ui/js/form/element/select' => 'IWD_Opc/js/form/element/select',
            'Magento_Ui/js/form/element/textarea' => 'IWD_Opc/js/form/element/textarea',
            'Magento_Ui/js/form/element/multiselect' => 'IWD_Opc/js/form/element/multiselect',
            'Magento_Ui/js/form/element/post-code' => 'IWD_Opc/js/form/element/post-code',
        ];

        if (isset($arrComponents[$component])) {
            $component = $arrComponents[$component];
        }

        return $component;
    }

    /**
     * @param $template
     * @return mixed
     */
    public function getReplacedUiTemplate($template)
    {
        $arrTemplates = [
            'ui/form/field' => 'IWD_Opc/form/field',
            'ui/form/element/input' => 'IWD_Opc/form/element/input',
            'ui/form/element/select' => 'IWD_Opc/form/element/select',
            'ui/form/element/textarea' => 'IWD_Opc/form/element/textarea',
            'ui/form/element/multiselect' => 'IWD_Opc/form/element/multiselect',
        ];

        if (isset($arrTemplates[$template])) {
            $template = $arrTemplates[$template];
        }

        return $template;
    }

    /**
     * Update shipping
     */
    public function updateShipping()
    {
        $shipping = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'steps' => [
                            'children' => [
                                'shipping-step' => [
                                    'children' => [
                                        'shippingAddress' => [
                                            'component' => 'IWD_Opc/js/view/shipping',
                                            'children' => [
                                                'shipping-address-fieldset' => [
                                                    'children' => [
                                                        'firstname' => [
                                                            'label' => new \Magento\Framework\Phrase('First Name *'),
                                                            'sortOrder' => 10,
                                                            'placeholder' => false,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left'
                                                            ]
                                                        ],
                                                        'lastname' => [
                                                            'label' => new \Magento\Framework\Phrase('Last Name *'),
                                                            'sortOrder' => 20,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-right'
                                                            ]
                                                        ],
                                                        'street' => [
                                                            'sortOrder' => 30,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/group/group',
                                                            ],
                                                            'children' => [
                                                                '0' => [
                                                                    'label' => new \Magento\Framework\Phrase('Street Address *'),
                                                                    'placeholder' => false,
                                                                    'config' => [
                                                                        'template' => 'IWD_Opc/form/field',
                                                                    ]
                                                                ],
                                                                '1' => [
                                                                    'label' => new \Magento\Framework\Phrase('Apartment / Suite / Building'),
                                                                    'placeholder' => false,
                                                                    'config' => [
                                                                        'template' => 'IWD_Opc/form/field',
                                                                        'validation' => [
                                                                            'required-entry' => false
                                                                        ],
                                                                    ]
                                                                ],
                                                            ],

                                                        ],
                                                        'country_id' => [
                                                            'sortOrder' => 40,
                                                            'placeholder' => __('Select Country *'),
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left wd30-66 mr4'
                                                            ]

                                                        ],
                                                        'region' => [
                                                            'label' => new \Magento\Framework\Phrase(''),
                                                            'sortOrder' => 50,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left wd30-66 mr4'
                                                            ]
                                                        ],
                                                        'region_id' => [
                                                            'sortOrder' => 50,
                                                            'placeholder' => __(''),
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field-region',
                                                                'additionalClasses' => 'float-left wd30-66 mr4'
                                                            ]
                                                        ],
                                                        'city' => [
                                                            'label' => new \Magento\Framework\Phrase('Town / City *'),
                                                            'sortOrder' => 60,
                                                            'placeholder' => false,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left wd30-66'
                                                            ]
                                                        ],
                                                        'postcode' => [
                                                            'label' => new \Magento\Framework\Phrase('Postcode / Zip *'),
                                                            'sortOrder' => 70,
                                                            'placeholder' => false,
                                                            'config' => [
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left wd30-66 mr4',
                                                            ]
                                                        ],
                                                        'telephone' => [
                                                            'label' => new \Magento\Framework\Phrase('Phone *'),
                                                            'sortOrder' => 80,
                                                            'placeholder' => false,
                                                            'config' => [
                                                                'tooltip' => false,
                                                                'template' => 'IWD_Opc/form/field',
                                                                'additionalClasses' => 'float-left wd30-66 mr4',
                                                            ]
                                                        ],
                                                        'company' => [
                                                            'visible' => false,
                                                        ]
                                                    ],
                                                ],
                                                'customer-email' => [
                                                    'component' => 'IWD_Opc/js/view/form/element/email',
                                                    'children' => [
                                                        'errors' => [
                                                            'component' => 'IWD_Opc/js/view/form/element/email/errors',
                                                            'displayArea' => 'errors'
                                                        ],
                                                        'additional-login-form-fields' => [
                                                            'children' => [
                                                                'captcha' => [
                                                                    'config' => [
                                                                        'template' => 'IWD_Opc/captcha'
                                                                    ]
                                                                ]
                                                            ]
                                                        ]
                                                    ]
                                                ],
                                                'payment-buttons' => [
                                                    'component' => 'IWD_Opc/js/view/payment-buttons',
                                                    'displayArea' => 'payment-buttons',
                                                    'config' => [
                                                        'template' => 'IWD_Opc/payment-buttons'
                                                    ],
                                                ],
                                                'before-shipping-method-form' => [
                                                    'children' => [
                                                        'shipping_policy' => [
                                                            'component' => 'IWD_Opc/js/view/shipping/shipping-policy',
                                                            'config' => [
                                                                'template' => 'IWD_Opc/shipping/shipping-policy'
                                                            ]
                                                        ]
                                                    ]
                                                ],
                                                'gift-message' => [
                                                    'displayArea' => 'gift-message',
                                                    'component' => 'IWD_Opc/js/view/gift-message',
                                                    'componentDisabled' => $this->getQuote()->isVirtual(),
                                                ]
                                            ]
                                        ]
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];
        $this->setComponent($shipping);
    }

    /**
     * Update payment
     */
    public function updatePayment()
    {
        $payment = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'steps' => [
                            'children' => [
                                'billing-step' => [
                                    'children' => [
                                        'payment' => [
                                            'component' => 'IWD_Opc/js/view/payment',
                                            'children' => [
                                                'customer-email' => [
                                                    'component' => 'IWD_Opc/js/view/form/element/email',
                                                    'children' => [
                                                        'errors' => [
                                                            'component' => 'IWD_Opc/js/view/form/element/email/errors',
                                                            'displayArea' => 'errors'
                                                        ],
                                                        'additional-login-form-fields' => [
                                                            'children' => [
                                                                'captcha' => [
                                                                    'config' => [
                                                                        'template' => 'IWD_Opc/captcha'
                                                                    ]
                                                                ]
                                                            ]
                                                        ]
                                                    ]
                                                ],
                                                'payments-list' => [
                                                    'component' => 'IWD_Opc/js/view/payment/list',
                                                    'children' => [
                                                        'before-place-order' => [
                                                            'children' => [
                                                                'agreements' => [
                                                                    'component' => 'IWD_Opc/js/view/checkout-agreements'
                                                                ],
                                                                'gift-card-information' => [
                                                                    'componentDisabled' => true,
                                                                ]
                                                            ]
                                                        ]
                                                    ]
                                                ],
                                                'additional-payment-validators' => [
                                                    'children' => [
                                                        'shipping-information-validator' => [
                                                            'component' => 'IWD_Opc/js/view/shipping/shipping-information-validation'
                                                        ],
                                                        'payment-method-validator' => [
                                                            'component' => 'IWD_Opc/js/view/payment/payment-method-validation'
                                                        ],
                                                        'billing-address-validator' => [
                                                            'component' => 'IWD_Opc/js/view/billing/address-validation'
                                                        ]
                                                    ]
                                                ],
                                                'discount' => [
                                                    'config' => [
                                                        'componentDisabled' => true,
                                                    ]
                                                ],
                                                'afterMethods' => [
                                                    'children' => [
                                                        'discount' => [
                                                            'config' => [
                                                                'componentDisabled' => true,
                                                            ]
                                                        ],
                                                    ],
                                                ],
                                            ]
                                        ]
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];
        $this->setComponent($payment);

        $afterMethods = $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
        ['children']['payment']['children']['afterMethods']['children'];
        if (isset($afterMethods['discount'])) {
            $afterMethods['discount']['component'] = 'IWD_Opc/js/view/payment/discount';
            $afterMethods['discount']['children']['errors']['component'] = 'IWD_Opc/js/view/payment/discount/errors';
        }

        if (isset($afterMethods['storeCredit'])) {
            $afterMethods['storeCredit']['component'] = 'IWD_Opc/js/view/payment/customer-balance';
        }

        if (isset($afterMethods['giftCardAccount'])) {
            $afterMethods['giftCardAccount']['component'] = 'IWD_Opc/js/view/payment/gift-card-account';
            $afterMethods['giftCardAccount']['children']
            ['errors']['component'] = 'IWD_Opc/js/view/payment/gift-card/errors';
        }

        if (isset($afterMethods['reward'])) {
            $afterMethods['reward']['component'] = 'IWD_Opc/js/view/payment/reward';
        }

        $this->getBillingAddressFormForUpdatePayment($afterMethods);
    }

    public function getBillingAddressFormForUpdatePayment($afterMethods)
    {
        if (isset($afterMethods['billing-address-form'])) {
            $afterMethods['billing-address-form']['component'] = 'IWD_Opc/js/view/billing-address';
            $afterMethods['billing-address-form']['displayArea'] = 'billing-address-form';
            if ($this->getQuote()->isVirtual()) {
                $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step-virtual'] =
                    [
                        'component' => 'IWD_Opc/js/view/billing-step-virtual',
                        'sortOrder' => '1',
                        'children' => [
                            'billing-address-form' => $afterMethods['billing-address-form']
                        ]
                    ];
            } else {
                $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']['children']
                ['payment']['children']['billing-address-form'] = $afterMethods['billing-address-form'];
            }

            unset($afterMethods['billing-address-form']);
        } else {
            if ($this->getQuote()->isVirtual()) {
                foreach ($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                         ['children']['payment']['children']['payments-list']['children'] as $formCode => $billingForm) {
                    if ($billingForm['component'] === 'Magento_Checkout/js/view/billing-address') {
                        if (!isset($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step-virtual'])) {
                            $billingForm['displayArea'] = 'billing-address-form';
                            $billingForm['dataScopePrefix'] = 'billingAddressshared';
                            $billingForm['component'] = 'IWD_Opc/js/view/billing-address';
                            foreach ($billingForm['children']['form-fields']['children'] as $fieldCode => $fieldConfig) {
                                $customScope = null;
                                $customEntry = null;
                                $dataScope = null;
                                $code = '';

                                $fieldConfig = $this->updateFieldConfig($fieldCode,$fieldConfig);

                                if (isset($fieldConfig['config']['customScope'])) {
                                    $code = str_replace('billingAddress', '', $fieldConfig['config']['customScope']);
                                }

                                if (!$code && isset($fieldConfig['config']['customEntry'])) {
                                    $code = str_replace('billingAddress', '', $fieldConfig['config']['customEntry']);
                                    $code = str_replace('.' . $fieldCode, '', $code);
                                }

                                if (!$code && isset($fieldConfig['dataScope'])) {
                                    $code = str_replace('billingAddress', '', $fieldConfig['dataScope']);
                                    $code = str_replace('.' . $fieldCode, '', $code);
                                }

                                if (!$code) {
                                    continue;
                                }

                                if (isset($fieldConfig['config']['customScope'])) {
                                    $customScope = $fieldConfig['config']['customScope'];
                                    if ($customScope) {
                                        $fieldConfig['config']['customScope'] = str_replace($code, 'shared', $customScope);
                                    }
                                }

                                if (isset($fieldConfig['config']['customEntry'])) {
                                    $customEntry = $fieldConfig['config']['customEntry'];
                                    if ($customEntry) {
                                        $fieldConfig['config']['customEntry'] = str_replace($code, 'shared', $customEntry);
                                    }
                                }

                                if (isset($fieldConfig['dataScope'])) {
                                    $dataScope = $fieldConfig['dataScope'];
                                    if ($dataScope) {
                                        $fieldConfig['dataScope'] = str_replace($code, 'shared', $dataScope);
                                    }
                                }

                                if (isset($fieldConfig['type']) && $fieldConfig['type'] === 'group') {
                                    foreach ($fieldConfig['children'] as $childrenKey => $childrenData) {
                                        $customScope = null;
                                        $customEntry = null;
                                        $dataScope = null;
                                        if (isset($childrenData['config']['customScope'])) {
                                            $customScope = $childrenData['config']['customScope'];
                                            if ($customScope) {
                                                $childrenData['config']['customScope'] = str_replace($code, 'shared', $customScope);
                                            }
                                        }

                                        if (isset($childrenData['config']['customEntry'])) {
                                            $customEntry = $childrenData['config']['customEntry'];
                                            if ($customEntry) {
                                                $childrenData['config']['customEntry'] = str_replace($code, 'shared', $customEntry);
                                            }
                                        }

                                        if (isset($childrenData['dataScope'])) {
                                            $dataScope = $childrenData['dataScope'];
                                            if ($dataScope) {
                                                $childrenData['dataScope'] = str_replace($code, 'shared', $dataScope);
                                            }
                                        }

                                        $fieldConfig['children'][$childrenKey] = $childrenData;
                                    }
                                }

                                $billingForm['children']['form-fields']['children'][$fieldCode] = $fieldConfig;
                            }

                            $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step-virtual'] =
                                [
                                    'component' => 'IWD_Opc/js/view/billing-step-virtual',
                                    'sortOrder' => '1',
                                    'children' => [
                                        'billing-address-form' => $billingForm,
                                        'payment-buttons' => [
                                            'component' => 'IWD_Opc/js/view/payment-buttons',
                                            'displayArea' => 'payment-buttons',
                                            'config' => [
                                                'template' => 'IWD_Opc/payment-buttons'
                                            ],
                                        ],
                                    ]
                                ];
                        }

                        unset($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                            ['children']['payment']['children']['payments-list']['children'][$formCode]);
                    }
                }
            } else {
                foreach ($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                         ['children']['payment']['children']['payments-list']['children'] as $paymentCode => $paymentMethod) {
                    if (isset($paymentMethod['children']['form-fields']['children'])) {
                        $paymentMethod['component'] = 'IWD_Opc/js/view/billing-address';
                        $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
                        ['children']['payment']['children']['payments-list']['children'][$paymentCode] = $paymentMethod;
                    }
                }
            }
        }

        if ($this->getQuote()->isVirtual()) {
            $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step-virtual']['children']
            ['customer-email'] = $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
            ['children']['payment']['children']['customer-email'];
        }

        unset($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']
            ['children']['payment']['children']['customer-email']);

        $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']['children']
        ['payment']['children']['afterMethods']['children'] = $afterMethods;

        $this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']['children']
        ['payment']['children']['before-place-order'] = $this->jsLayout['components']['checkout']
        ['children']['steps']['children']['billing-step']['children']['payment']['children']['payments-list']
        ['children']['before-place-order'];

        unset($this->jsLayout['components']['checkout']['children']['steps']['children']['billing-step']['children']
            ['payment']['children']['payments-list']['children']['before-place-order']);
    }

    public function updateFieldConfig($fieldCode,$fieldConfig) {
        if ($fieldCode === 'firstname') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('First Name *');
            $fieldConfig['sortOrder'] = '10';
            $fieldConfig['placeholder'] = false;
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['config']['additionalClasses'] = 'float-left';
        } else if ($fieldCode === 'lastname') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('Last Name *');
            $fieldConfig['sortOrder'] = '20';
            $fieldConfig['placeholder'] = false;
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['config']['additionalClasses'] = 'float-right';
        } else if ($fieldCode === 'street') {
            $fieldConfig['sortOrder'] = '30';
            $fieldConfig['config']['template'] = 'IWD_Opc/group/group';
            $fieldConfig['children'][0]['visible'] = true;
            $fieldConfig['children'][0]['label'] = new \Magento\Framework\Phrase('Street Address *');
            $fieldConfig['children'][0]['placeholder'] = __('Street Address *');
            $fieldConfig['children'][0]['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['children'][0]['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['children'][1]['visible'] = true;
            $fieldConfig['children'][1]['label'] = new \Magento\Framework\Phrase('Apartment / Suite / Building');
            $fieldConfig['children'][1]['placeholder'] = __('Apartment / Suite / Building');
            $fieldConfig['children'][1]['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['children'][1]['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['children'][1]['config']['validation'] = ['required-entry' => false];
            $fieldConfig['children'][2]['visible'] = false;
        } else if ($fieldCode === 'country_id') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('Select Country *');
            $fieldConfig['sortOrder'] = '40';
            $fieldConfig['placeholder'] = __('Select Country *');
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66 mr4';
        } else if ($fieldCode === 'region') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('');
            $fieldConfig['visible'] = false;
            $fieldConfig['sortOrder'] = '50';
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66 mr4';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
        } else if ($fieldCode === 'region_id') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('');
            $fieldConfig['sortOrder'] = '50';
            $fieldConfig['placeholder'] = __('');
            $fieldConfig['component'] = 'Magento_Ui/js/form/element/region';
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['elementTmpl'] = 'ui/form/element/select';
            $fieldConfig['config']['customEntry'] = 'billingAddress.region';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66 mr4';
            $fieldConfig['validation']['required-entry'] = true;
            $fieldConfig['filterBy']['target'] = '${ $.provider }:${ $.parentScope }.country_id';
            $fieldConfig['filterBy']['field'] = 'country_id';
        } else if ($fieldCode === 'city') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('Town / City *');
            $fieldConfig['sortOrder'] = '60';
            $fieldConfig['placeholder'] = __('Town / City *');
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
        } else if ($fieldCode === 'postcode') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('Postcode / Zip *');
            $fieldConfig['sortOrder'] = '70';
            $fieldConfig['placeholder'] = __('Postcode / Zip *');
            $fieldConfig['component'] = 'Magento_Ui/js/form/element/post-code';
            $fieldConfig['validation']['required-entry'] = true;
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66 mr4';
        } else if ($fieldCode === 'telephone') {
            $fieldConfig['label'] = new \Magento\Framework\Phrase('Phone *');
            $fieldConfig['sortOrder'] = '80';
            $fieldConfig['placeholder'] = __('Phone *');
            $fieldConfig['config']['tooltip'] = false;
            $fieldConfig['config']['template'] = 'IWD_Opc/form/field';
            $fieldConfig['config']['elementTmpl'] = 'IWD_Opc/form/element/input';
            $fieldConfig['config']['additionalClasses'] = 'float-left wd30-66 mr4';
        } else if ($fieldCode === 'company') {
            $fieldConfig['visible'] = false;
        } else if ($fieldCode === 'fax') {
            $fieldConfig['visible'] = false;
        }

        return $fieldConfig;
    }

    /**
     * Update onepage
     */
    public function updateOnePage()
    {
        $onePage = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'progressBar' => [
                            'componentDisabled' => true,
                        ],
                        'estimation' => [
                            'componentDisabled' => true,
                        ],
                        'authentication' => [
                            'componentDisabled' => true,
                        ],
                    ]
                ]
            ]
        ];
        $this->setComponent($onePage);
    }

    /**
     * Update login button
     */
    public function updateLoginButton()
    {
        $this->jsLayout['components']['checkout']['children']['login-button'] = [
            'component' => 'IWD_Opc/js/view/login-button',
            'displayArea' => 'login-button',
        ];
    }

    /**
     * Update payment buttons
     */
    public function updatePaymentButtons()
    {
        $this->jsLayout['components']['checkout']['children']['payment-buttons'] = [
            'component' => 'IWD_Opc/js/view/payment-buttons',
            'displayArea' => 'payment-buttons',
            'config' => [
                'template' => 'IWD_Opc/payment-buttons'
            ],
        ];
    }

    /**
     * Update totals
     */
    public function updateTotals()
    {
        $sidebar = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'sidebar' => [
                            'component' => 'uiComponent',
                            'config' => [
                                'template' => 'IWD_Opc/sidebar'
                            ],
                        ]
                    ]
                ]
            ]
        ];
        $this->setComponent($sidebar);
    }

    /**
     * @param $component
     * @return array
     */
    public function setComponent($component)
    {
        $this->jsLayout = $this->arrayMergeRecursiveEx($this->jsLayout, $component);
        return $this->jsLayout;
    }

    /**
     * @param array $array1
     * @param array $array2
     * @return array
     */
    private function arrayMergeRecursiveEx(array & $array1, array & $array2)
    {
        $merged = $array1;
        foreach ($array2 as $key => & $value) {
            if (is_array($value) && isset($merged[$key]) && is_array($merged[$key])) {
                $merged[$key] = $this->arrayMergeRecursiveEx($merged[$key], $value);
            } elseif (is_numeric($key)) {
                if (!in_array($value, $merged)) {
                    $merged[] = $value;
                }
            } else {
                $merged[$key] = $value;
            }
        }

        return $merged;
    }

    /**
     * @return $this
     */
    private function disableAutocomplete()
    {
        if ($this->opcHelper->isGmAutocompleteEnabled()) {
            $steps = &$this->jsLayout['components']['checkout']['children']['steps']['children'];
            $this->setElementTmpl(
                $steps['billing-step-virtual']['children']['billing-address-form']['children']['form-fields']['children']
            );
            $this->setElementTmpl(
                $steps['shipping-step']['children']['shippingAddress']['children']['shipping-address-fieldset']['children']
            );
            $this->setElementTmpl(
                $steps['billing-step']['children']['billing-address-form']['children']['form-fields']['children']
            );
            $paymentSteps = &$steps['billing-step']['children']['payment']['children']['payments-list']['children'];
            foreach ($paymentSteps as &$paymentStep) {
                $this->setElementTmpl($paymentStep['children']['form-fields']['children']);
            }
        }

        return $this;
    }

    /**
     * @param $stepFields
     * @return $this
     */
    private function setElementTmpl(&$stepFields)
    {
        if (empty($stepFields)) {
            return $this;
        }
        foreach ($stepFields as &$field) {
            $this->updateInputTmpl($field);
            if (!empty($field['children'])) {
                foreach ($field['children'] as & $childField) {
                    $this->updateInputTmpl($childField);
                }
            }
        }

        return $this;
    }

    /**
     * @param $field
     * @return $this
     */
    private function updateInputTmpl(&$field)
    {
        if (!empty($field['config']['elementTmpl']) && $field['config']['elementTmpl'] == 'ui/form/element/input') {
            $field['config']['elementTmpl'] = $this->templateNonAutocomplete;
        }

        return $this;
    }

    private function updateSaasCheckout(){
        $this->addDiscountBlock();
        $this->addLinkToShoppingCart();
        $this->addPlaceOrderButtonToSummaryBlock();
        $this->reconstructionOpc();
    }

    private function addDiscountBlock(){
        if($this->opcHelper->isShowDiscount()){
            $discount = [
                'components' => [
                    'checkout' => [
                        'children' => [
                            'sidebar' => [
                                'children' => [
                                    'summary' => [
                                        'children' => [
                                            'discount' => [
                                                'component' => 'IWD_Opc/js/view/payment/discount',
                                                'children' => [
                                                    'errors' => [
                                                        'sortOrder' => 0,
                                                        'component' => 'IWD_Opc/js/view/payment/discount/errors',
                                                        'displayArea' => 'messages',
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ]
                    ]
                ]
            ];
            $this->setComponent($discount);
        }
    }

    private function addLinkToShoppingCart(){
        $placeOrderButton = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'sidebar' => [
                            'children' => [
                                'summary' => [
                                    'children' => [
                                        'edit-cart' => [
                                            'sortOrder' => 10,
                                            'component' => 'IWD_Opc/js/view/summary/edit-cart',
                                            'config' => [
                                                'title' => 'Edit Cart',
                                                'link' => '/checkout/cart/',
                                                'template' => 'IWD_Opc/summary/edit-cart',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]
                ]
            ]
        ];
        $this->setComponent($placeOrderButton);
    }

    public function addPlaceOrderButtonToSummaryBlock(){
        $placeOrderButton = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'sidebar' => [
                            'children' => [
                                'summary' => [
                                    'children' => [
                                        'place-order' => [
                                            'sortOrder' => 999,
                                            'component' => 'IWD_Opc/js/view/summary/place-order',
                                            'config' => [
                                                'template' => 'IWD_Opc/summary/place-order',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]
                ]
            ]
        ];
        $this->setComponent($placeOrderButton);
    }

    private function reconstructionOpc(){
        $movePosition = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'steps' => [
                            'children' => [
                                'info-block' => [
                                    'sortOrder' => 999,
                                    'component' => 'IWD_Opc/js/view/info-block',
                                    'config' => [
                                        'template' => 'IWD_Opc/info-block',
                                    ],
                                ],
                                'billing-step' => [
                                    'children' => [
                                        'payment' => [
                                            'children' => [
                                                'renders' => [
                                                    'children' => [
                                                        'braintree' => [
                                                            'component' => 'IWD_Opc/js/view/payment/braintree'
                                                        ]
                                                    ]
                                                ]
                                            ]
                                        ]
                                    ]
                                ]
                            ],
                        ],
                        'sidebar' => [
                            'children' => [
                                'summary' => [
                                    'component' => 'IWD_Opc/js/view/summary',
                                    'config' => [
                                        'template' => 'IWD_Opc/summary'
                                    ],
                                    'children' => [
                                        'cart_items' => [
                                            'component' => 'IWD_Opc/js/view/summary/cart-items',
                                            'children' => [
                                                'details' => [
                                                    'component' => 'IWD_Opc/js/view/summary/item/details'
                                                ]
                                            ],
                                            'sortOrder' => 970,
                                        ],
                                        'discount' => [
                                            'sortOrder' => 980,
                                        ],
                                        'totals' => [
                                            'children' => [
                                                'subtotal' =>[
                                                    'component' => 'IWD_Opc/js/view/summary/subtotal',
                                                    'config' => [
                                                        'title' => 'Subtotal',
                                                    ],
                                                ],
                                                'discount' => [
                                                    'component' => 'IWD_Opc/js/view/summary/discount',
                                                    'config' => [
                                                        'title' => 'Discount',
                                                    ],
                                                ],
                                                'shipping' => [
                                                    'component' => 'IWD_Opc/js/view/summary/shipping',
                                                    'config' => [
                                                        'title' => 'Shipping',
                                                        'notCalculatedMessage' => 'Not yet calculated'
                                                    ],
                                                ],
                                                'grand-total' => [
                                                    'component' => 'IWD_Opc/js/view/summary/grand-total',
                                                    'config' => [
                                                        'title' => 'Total to pay'
                                                    ],
                                                ],
                                            ],
                                            'sortOrder' => 990,
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]
                ]
            ]
        ];
        $this->setComponent($movePosition);
    }
}
