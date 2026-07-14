<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config;

use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\RequiredFieldPaths;
use Magento\Config\Block\System\Config\Form\Field\FieldArray\AbstractFieldArray;
use Magento\Framework\DataObject;
use Magento\Framework\View\Element\AbstractBlock;

abstract class RequiredFields extends AbstractFieldArray
{
    private ?AbstractBlock $methodRenderer = null;

    private ?RequiredFieldPaths $fieldPathsRenderer = null;

    public function getArrayRows()
    {
        $element = $this->getElement();
        $value = $element ? $element->getValue() : null;

        if (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $value = $decoded;
            }
        }

        if (is_array($value) && !$this->isRowOrientedValue($value)) {
            $element->setValue($this->convertMappingToRows($value));
        } elseif (is_array($value)) {
            $element->setValue($value);
        }

        return parent::getArrayRows();
    }

    protected function _prepareToRender()
    {
        $this->addColumn('method_code', [
            'label' => $this->getMethodColumnLabel(),
            'renderer' => $this->getMethodRenderer(),
        ]);
        $this->addColumn('field_paths', [
            'label' => __('Required Fields'),
            'renderer' => $this->getFieldPathsRenderer(),
        ]);
        $this->addColumn('custom_field_paths', [
            'label' => __('Custom Paths'),
            'class' => 'input-text',
            'style' => 'width: 170px; max-width: 170px',
        ]);
        $this->_addAfter = false;
        $this->_addButtonLabel = $this->getAddRowButtonLabel();
    }

    protected function _prepareArrayRow(DataObject $row)
    {
        $options = [];
        $methodCode = (string)$row->getData('method_code');
        if ($methodCode !== '') {
            $options['option_' . $this->getMethodRenderer()->calcOptionHash($methodCode)] =
                'selected="selected"';
        }

        $fieldPaths = $row->getData('field_paths');
        if (is_array($fieldPaths)) {
            foreach ($fieldPaths as $fieldPath) {
                $options['option_' . $this->getFieldPathsRenderer()->calcOptionHash((string)$fieldPath)] =
                    'selected="selected"';
            }
        }

        $row->setData('option_extra_attrs', $options);
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    abstract protected function getFieldOptions(): array;

    abstract protected function getMethodRendererClass(): string;

    abstract protected function getMethodColumnLabel();

    abstract protected function getAddRowButtonLabel();

    private function getMethodRenderer(): AbstractBlock
    {
        if ($this->methodRenderer === null) {
            $this->methodRenderer = $this->getLayout()->createBlock(
                $this->getMethodRendererClass(),
                '',
                ['data' => ['is_render_to_js_template' => true]]
            );
        }

        return $this->methodRenderer;
    }

    private function getFieldPathsRenderer(): RequiredFieldPaths
    {
        if ($this->fieldPathsRenderer === null) {
            $this->fieldPathsRenderer = $this->getLayout()->createBlock(
                RequiredFieldPaths::class,
                '',
                [
                    'data' => ['is_render_to_js_template' => true],
                    'options' => $this->getFieldOptions(),
                ]
            );
        }

        return $this->fieldPathsRenderer;
    }

    private function isRowOrientedValue(array $value): bool
    {
        if ($value === []) {
            return true;
        }

        foreach ($value as $row) {
            if (is_array($row) && array_key_exists('method_code', $row)) {
                return true;
            }
        }

        return false;
    }

    private function convertMappingToRows(array $mapping): array
    {
        $selectablePaths = array_column($this->getFieldOptions(), 'value');
        $rows = [];

        foreach ($mapping as $methodCode => $fieldPaths) {
            if (!is_array($fieldPaths)) {
                continue;
            }

            $knownPaths = [];
            $customPaths = [];
            foreach ($fieldPaths as $fieldPath) {
                $fieldPath = trim((string)$fieldPath);
                if ($fieldPath === '') {
                    continue;
                }

                if (in_array($fieldPath, $selectablePaths, true)) {
                    $knownPaths[] = $fieldPath;
                } else {
                    $customPaths[] = $fieldPath;
                }
            }

            $rows['row_' . count($rows)] = [
                'method_code' => (string)$methodCode,
                'field_paths' => $knownPaths,
                'custom_field_paths' => implode(', ', $customPaths),
            ];
        }

        return $rows;
    }
}
