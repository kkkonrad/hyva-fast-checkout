<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Checkout;

use Kkkonrad\Fastcheckout\Helper\Data;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\View\Asset\Repository;
use Magento\Framework\View\Asset\GroupedCollection;
use Magento\Framework\View\Helper\SecureHtmlRenderer;
use Magento\Framework\View\Page\Config\Renderer;

class RequireJsBaseConfig
{
    public function __construct(
        private Data $helper,
        private RequestInterface $request,
        private Repository $assets,
        private SecureHtmlRenderer $secureRenderer
    ) {
    }

    public function afterGetGroups(GroupedCollection $subject, array $groups): array
    {
        if ($this->request->getFullActionName() !== 'checkout_index_index'
            || !$this->helper->canUseHyvaNativeCheckout()
        ) {
            return $groups;
        }

        // CSP gives each script its own SRI group. Group creation order otherwise
        // loses the ordering established by Magento's RequireJS Config block.
        $positions = array_flip(array_keys($subject->getAll()));
        $scripts = array_values(array_filter($groups, static function ($group) {
            return $group->getProperty('content_type') === 'js';
        }));
        usort($scripts, static function ($left, $right) use ($positions) {
            return ($positions[array_key_first($left->getAll())] ?? PHP_INT_MAX)
                <=> ($positions[array_key_first($right->getAll())] ?? PHP_INT_MAX);
        });
        foreach ($groups as &$group) {
            if ($group->getProperty('content_type') === 'js') {
                $group = array_shift($scripts);
            }
        }

        return $groups;
    }

    public function afterRenderHeadContent(Renderer $subject, string $result): string
    {
        if ($this->request->getFullActionName() !== 'checkout_index_index'
            || !$this->helper->canUseHyvaNativeCheckout()
        ) {
            return $result;
        }

        $context = $this->assets->getStaticViewFileContext();
        $config = json_encode(
            ['baseUrl' => rtrim($context->getBaseUrl() . $context->getPath(), '/') . '/'],
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR
        );

        // Hyva's root template does not output Magento's require.js block.
        return $result . $this->secureRenderer->renderTag(
            'script',
            [],
            'window.require = Object.assign({}, window.require || {}, ' . $config . ');',
            false
        );
    }
}
