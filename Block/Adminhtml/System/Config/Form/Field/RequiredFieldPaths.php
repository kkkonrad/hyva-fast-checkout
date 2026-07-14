<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Framework\View\Element\Html\Select;

class RequiredFieldPaths extends Select
{
    /**
     * @param array<int, array{value: string, label: string}> $options
     */
    public function __construct(
        Context $context,
        private readonly array $options = [],
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function setInputName($value)
    {
        return $this->setName($value . '[]');
    }

    public function setInputId($value)
    {
        return $this->setId($value);
    }

    protected function _toHtml()
    {
        if (!$this->getOptions()) {
            foreach ($this->options as $option) {
                $this->addOption($option['value'], $option['label']);
            }
        }

        $this->setData(
            'extra_params',
            'multiple="multiple" size="4" style="min-width: 280px; width: 100%"'
        );

        return parent::_toHtml();
    }
}
