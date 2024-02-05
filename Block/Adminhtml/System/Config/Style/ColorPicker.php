<?php

namespace IWD\Opc\Block\Adminhtml\System\Config\Style;

use Magento\Config\Block\System\Config\Form\Field;

class ColorPicker extends Field
{
    protected function _getElementHtml(\Magento\Framework\Data\Form\Element\AbstractElement $element)
    {
        $html = $element->getElementHtml();
        $value = $element->getData('value');
        $html .= '<script type="text/javascript">
            require(["jquery", "jquery/colorpicker/js/colorpicker"], function ($) {
                $(document).ready(function (e) {
                   var $elementId = $("#' . $element->getHtmlId() . '");
                   $elementId.css("background-color","#' . $value . '");

                   $elementId.ColorPicker({
                        layout:"hex",
                        submit:1,
                        submitText: "OK",
                        colorScheme:"dark",
                        color: "#' . $value . '",
                        onChange:function(hsb,hex,rgb,el,bySetColor) {
                        $(el).css("background-color","#"+hex);
                            if(!bySetColor) $(el).val(hex);
                        },
                        onSubmit:function(hsb,hex,rgb,el) {
                            $(el).css("background-color","#"+hex);
                            $(el).val(hex);
                            $(".colorpicker").hide();
                        }
                    }).keyup(function(){
                        $(this).colpickSetColor(this.value);
                    });
                });
            });
            </script>';
        return $html;
    }
}
