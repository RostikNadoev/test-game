-- Raise the product-wide minimum stake for online PvP lobbies to 2 GAME.

UPDATE game_settings
SET min_bet = 2,
    updated_at = NOW()
WHERE kind = 'pvp'
  AND min_bet < 2;
