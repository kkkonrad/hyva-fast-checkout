<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Tpay;

use Psr\Log\LoggerInterface;

class PatchTpayChannelsScript
{
    /** @var LoggerInterface */
    private $logger;

    public function __construct(LoggerInterface $logger)
    {
        $this->logger = $logger;
    }

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

        if ($patched === null || $patched === $result) {
            $this->logger->warning(
                'Kkkonrad Fastcheckout: PatchTpayChannelsScript pattern did not match Tpay showChannels script; '
                . 'the defensive DOM-wait patch was not applied. The vendor script may have changed.'
            );

            return $result;
        }

        return $patched;
    }
}
