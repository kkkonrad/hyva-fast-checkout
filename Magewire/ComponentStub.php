<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Magewire;

/**
 * Minimal stand-in for Magewirephp\Magewire\Component.
 * Fastcheckout no longer depends on Magewire at runtime; domain tests still use Checkout methods.
 */
class ComponentStub
{
    /**
     * @param mixed $value
     * @return void
     */
    public function skipRender($value = true): void
    {
        // no-op
    }

    /**
     * @param string $event
     * @param array $params
     * @return void
     */
    public function emit(string $event, ...$params): void
    {
        // no-op
    }

    /**
     * @param string $event
     * @param array $payload
     * @return void
     */
    public function dispatchBrowserEvent(string $event, array $payload = []): void
    {
        // no-op (was Magewire→browser bridge)
    }
}
