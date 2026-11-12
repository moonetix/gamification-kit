<?php

declare(strict_types=1);

namespace Moonetix\Gamification;

/**
 * Thrown for invalid input. getCode() returns the same string code as the JavaScript
 * GamificationError, for example "invalid_time_zone".
 */
final class GamificationException extends \InvalidArgumentException
{
    public function __construct(string $code, string $message)
    {
        parent::__construct($message);
        $this->code = $code;
    }
}
