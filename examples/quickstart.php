<?php

require __DIR__ . '/../vendor/autoload.php';

use Moonetix\Gamification\Gamification as G;

$timeZone = 'America/New_York'; // the user's zone, saved on their profile
$at = 1794450600; // 2026-11-11 21:30 in New York; in production time()

// Daily check-in: load the saved state, check in, save the returned state.
$saved = ['lastDate' => '2026-11-09', 'streak' => 4, 'longest' => 9, 'freezes' => 1];
['state' => $state, 'result' => $result] = G::checkIn($saved, ['at' => $at, 'timeZone' => $timeZone]);
echo json_encode(['streak' => $result['streak'], 'usedFreezes' => $result['usedFreezes'], 'lastDate' => $state['lastDate']]), "\n";
// -> {"streak":5,"usedFreezes":1,"lastDate":"2026-11-11"}

// An hour later: today is done, and the streak lasts until Nov 13 starts in New York.
echo json_encode(G::streakStatus($state, ['at' => $at + 3600, 'timeZone' => $timeZone])), "\n";
// -> {"alive":true,"streak":5,"checkedInToday":true,"freezesNeeded":0,"endsAt":1794546000,"cycleDay":5}

// Levels: level L needs 100 x (L - 1)^2 XP.
$curve = G::polynomialCurve(['base' => 100, 'exponent' => 2]);
$level = G::levelForXp($curve, 950);
echo json_encode([$level['level'], $level['xpToNextLevel'], $level['progressBps']]), "\n";
// -> [4,650,714]

// A daily quest that resets at local midnight.
$quest = G::defineQuest(['id' => 'win-3-matches', 'target' => 3, 'reset' => 'daily']);
$q = G::questProgress(null, $quest, ['amount' => 1, 'at' => $at, 'timeZone' => $timeZone]);
echo json_encode($q['result']), "\n";
// -> {"progress":1,"target":3,"completed":false,"justCompleted":false,"periodKey":"day:2026-11-11","resetsAt":1794459600}

// At most 500 XP a day: 450 were already granted today.
$cap = G::applyXpCap(['date' => '2026-11-11', 'granted' => 450], ['amount' => 100, 'at' => $at, 'timeZone' => $timeZone, 'dailyCap' => 500]);
echo json_encode([$cap['granted'], $cap['capped']]), "\n";
// -> [50,50]

// A weekly board with shared ranks for ties.
$board = G::rankEntries([
    ['id' => 'mia', 'score' => 1200],
    ['id' => 'leo', 'score' => 1500],
    ['id' => 'ava', 'score' => 1200],
    ['id' => 'kai', 'score' => 900],
], ['tie' => 'shared']);
echo implode(', ', array_map(fn($e) => "{$e['rank']}. {$e['id']}", $board)), "\n";
// -> 1. leo, 2. ava, 2. mia, 4. kai
