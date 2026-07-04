<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Tpay;

class PatchTpayChannelsScript
{
    /**
     * Patch the showChannels javascript to wait defensively for the DOM element to load.
     *
     * @param mixed $subject
     * @param string|null $result
     * @return string|null
     */
    public function afterShowChannels($subject, ?string $result): ?string
    {
        if (empty($result)) {
            return $result;
        }

        $pattern = '/ShowChannelsCombo\(\);\s*checkBlikInput\(\);\s*setBlikInputAction\(\);\s*payButton\.addClass\(\'disabled\'\);/s';
        
        $replacement = "
        (function() {
            var retries = 0;
            function tryInitTpay() {
                var el = document.getElementById('bank-selection-form');
                if (!el && retries < 100) {
                    retries++;
                    setTimeout(tryInitTpay, 50);
                    return;
                }
                ShowChannelsCombo();
                checkBlikInput();
                setBlikInputAction();
                payButton.addClass('disabled');
            }
            tryInitTpay();
        })();
        ";

        $patched = preg_replace($pattern, $replacement, $result);

        return $patched ?? $result;
    }
}
