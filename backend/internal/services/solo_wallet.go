package services

import (
	cryptorand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"tg-lobbies-base/internal/games/solo"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrSoloRoundNotFound      = errors.New("solo round not found")
	ErrSoloSessionNotFound    = errors.New("solo session not found")
	ErrSoloSessionNotActive   = errors.New("solo session is not active")
	ErrSoloActiveSessionExists = errors.New("active solo session already exists")
)

type SoloSpinResult struct {
	RoundID     string         `json:"round_id"`
	Game        string         `json:"game"`
	BetCoins    float64        `json:"bet_coins"`
	PayoutCoins float64        `json:"payout_coins"`
	NetCoins    float64        `json:"net_coins"`
	Outcome     any            `json:"outcome"`
	BalanceGame float64        `json:"-"`
	SoloStats   SoloStatsDTO   `json:"-"`
}

type SoloSessionResult struct {
	SessionID   string       `json:"session_id"`
	Game        string       `json:"game"`
	BetCoins    float64      `json:"bet_coins"`
	Status      string       `json:"status"`
	Multiplier  float64      `json:"multiplier"`
	OpenedSteps int          `json:"opened_steps"`
	PublicState any          `json:"public_state,omitempty"`
	Event       any          `json:"event,omitempty"`
	PayoutCoins float64      `json:"payout_coins,omitempty"`
	BalanceGame float64      `json:"-"`
	SoloStats   SoloStatsDTO `json:"-"`
}

func buildSoloSessionResult(session models.SoloSession, balance float64, stats SoloStatsDTO, event any, payout float64) (SoloSessionResult, error) {
	publicState, err := solo.PublicSessionStateFromJSON(session.Game, session.StateJSON)
	if err != nil {
		return SoloSessionResult{}, err
	}
	return SoloSessionResult{
		SessionID:   session.ID,
		Game:        session.Game,
		BetCoins:    session.BetCoins,
		Status:      session.Status,
		Multiplier:  session.CurrentMultiplier,
		OpenedSteps: session.OpenedSteps,
		PublicState: publicState,
		Event:       event,
		PayoutCoins: payout,
		BalanceGame: balance,
		SoloStats:   stats,
	}, nil
}

func SoloSpin(db *gorm.DB, userID uint, game string, bet float64, idempotencyKey string) (*SoloSpinResult, error) {
	game = solo.NormalizeGame(game)
	if err := solo.ValidateBet(game, bet); err != nil {
		return nil, err
	}
	if !solo.IsInstant(game) {
		return nil, solo.ErrUnsupportedGame
	}

	if idempotencyKey != "" {
		var existing models.SoloRound
		err := db.Where("idempotency_key = ? AND user_id = ?", idempotencyKey, userID).First(&existing).Error
		if err == nil {
			return replaySpinResult(db, existing)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	var result SoloSpinResult
	err := db.Transaction(func(tx *gorm.DB) error {
		if idempotencyKey != "" {
			var existing models.SoloRound
			err := tx.Where("idempotency_key = ? AND user_id = ?", idempotencyKey, userID).First(&existing).Error
			if err == nil {
				replayed, replayErr := replaySpinResult(tx, existing)
				if replayErr != nil {
					return replayErr
				}
				result = *replayed
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		if user.BalanceGame+1e-9 < bet {
			return ErrInsufficientBalance
		}

		outcome, payout, spinErr := solo.SpinInstant(game, bet)
		if spinErr != nil {
			return spinErr
		}

		outcomeJSON, _ := json.Marshal(outcome)
		roundID := newSoloID()
		keyCopy := idempotencyKey
		var keyPtr *string
		if keyCopy != "" {
			keyPtr = &keyCopy
		}

		user.BalanceGame = roundMoney(user.BalanceGame - bet)
		if payout > 0 {
			user.BalanceGame = roundMoney(user.BalanceGame + payout)
		}
		if err := tx.Save(&user).Error; err != nil {
			return err
		}

		if err := recordSoloBetTx(tx, userID, game, roundID, bet); err != nil {
			return err
		}
		if payout > 0 {
			if err := recordSoloPayoutTx(tx, userID, game, roundID, payout); err != nil {
				return err
			}
		}
		if err := ApplySoloResultTx(tx, userID, game, bet, payout); err != nil {
			return err
		}

		round := models.SoloRound{
			ID:             roundID,
			UserID:         userID,
			Game:           game,
			BetCoins:       bet,
			PayoutCoins:    payout,
			NetCoins:       roundMoney(payout - bet),
			OutcomeJSON:    string(outcomeJSON),
			IdempotencyKey: keyPtr,
			Status:         models.SoloRoundStatusSettled,
		}
		if err := tx.Create(&round).Error; err != nil {
			return err
		}

		stats, err := loadSoloStatsTx(tx, userID)
		if err != nil {
			return err
		}

		result = SoloSpinResult{
			RoundID:     roundID,
			Game:        game,
			BetCoins:    bet,
			PayoutCoins: payout,
			NetCoins:    roundMoney(payout - bet),
			Outcome:     outcome,
			BalanceGame: user.BalanceGame,
			SoloStats:   stats,
		}
		return nil
	})
	if err != nil {
		if idempotencyKey != "" && isUniqueViolation(err) {
			var existing models.SoloRound
			findErr := db.Where("idempotency_key = ? AND user_id = ?", idempotencyKey, userID).First(&existing).Error
			if findErr == nil {
				return replaySpinResult(db, existing)
			}
		}
		return nil, err
	}
	return &result, nil
}

func StartSoloSession(db *gorm.DB, userID uint, game string, bet float64) (*SoloSessionResult, error) {
	game = solo.NormalizeGame(game)
	if err := solo.ValidateBet(game, bet); err != nil {
		return nil, err
	}
	if !solo.IsSession(game) {
		return nil, solo.ErrUnsupportedGame
	}

	var active models.SoloSession
	err := db.Where("user_id = ? AND game = ? AND status = ?", userID, game, models.SoloSessionStatusActive).First(&active).Error
	if err == nil {
		return nil, ErrSoloActiveSessionExists
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	rng := solo.NewRNG()
	state, err := solo.StartSessionState(game, rng)
	if err != nil {
		return nil, err
	}
	stateJSON, err := solo.MarshalSessionState(game, state)
	if err != nil {
		return nil, err
	}

	sessionID := newSoloID()
	var result SoloSessionResult

	err = db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		if user.BalanceGame+1e-9 < bet {
			return ErrInsufficientBalance
		}
		user.BalanceGame = roundMoney(user.BalanceGame - bet)
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		if err := recordSoloBetTx(tx, userID, game, sessionID, bet); err != nil {
			return err
		}

		session := models.SoloSession{
			ID:                sessionID,
			UserID:            userID,
			Game:              game,
			BetCoins:          bet,
			Status:            models.SoloSessionStatusActive,
			StateJSON:         stateJSON,
			CurrentMultiplier: 1,
			OpenedSteps:       0,
		}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}

		stats, err := loadSoloStatsTx(tx, userID)
		if err != nil {
			return err
		}

		built, err := buildSoloSessionResult(session, user.BalanceGame, stats, nil, 0)
		if err != nil {
			return err
		}
		result = built
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func SoloSessionStep(db *gorm.DB, userID uint, sessionID, action string, payload map[string]any) (*SoloSessionResult, error) {
	var result SoloSessionResult
	err := db.Transaction(func(tx *gorm.DB) error {
		session, err := lockSoloSessionTx(tx, sessionID, userID)
		if err != nil {
			return err
		}
		if session.Status != models.SoloSessionStatusActive {
			return ErrSoloSessionNotActive
		}

		state, err := solo.UnmarshalSessionState(session.Game, session.StateJSON)
		if err != nil {
			return err
		}

		step, err := solo.SessionStep(session.Game, state, action, payload, session.BetCoins)
		if err != nil {
			return err
		}

		stateJSON, err := solo.MarshalSessionState(session.Game, step.State)
		if err != nil {
			return err
		}

		session.StateJSON = stateJSON
		session.CurrentMultiplier = step.Multiplier
		session.OpenedSteps = openedStepsForGame(session.Game, step.State)

		var user models.User
		if step.Done {
			session.PayoutCoins = step.Payout
			session.SettledAt = ptrTime(time.Now().UTC())
			if step.Payout > 0 {
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
					return err
				}
				user.BalanceGame = roundMoney(user.BalanceGame + step.Payout)
				if err := tx.Save(&user).Error; err != nil {
					return err
				}
				if err := recordSoloPayoutTx(tx, userID, session.Game, session.ID, step.Payout); err != nil {
					return err
				}
			}
			if eventStatus(step.Event) == "bust" {
				session.Status = models.SoloSessionStatusBust
			} else {
				session.Status = models.SoloSessionStatusCompleted
			}
			if err := ApplySoloResultTx(tx, userID, session.Game, session.BetCoins, step.Payout); err != nil {
				return err
			}
		} else {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
				return err
			}
		}

		if err := tx.Save(&session).Error; err != nil {
			return err
		}

		stats, err := loadSoloStatsTx(tx, userID)
		if err != nil {
			return err
		}

		built, err := buildSoloSessionResult(*session, user.BalanceGame, stats, step.Event, session.PayoutCoins)
		if err != nil {
			return err
		}
		result = built
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func CashoutSoloSession(db *gorm.DB, userID uint, sessionID string) (*SoloSessionResult, error) {
	var result SoloSessionResult
	err := db.Transaction(func(tx *gorm.DB) error {
		session, err := lockSoloSessionTx(tx, sessionID, userID)
		if err != nil {
			return err
		}
		if session.Status != models.SoloSessionStatusActive {
			return ErrSoloSessionNotActive
		}

		state, err := solo.UnmarshalSessionState(session.Game, session.StateJSON)
		if err != nil {
			return err
		}

		_, payout, err := solo.SessionCashout(session.Game, state, session.BetCoins)
		if err != nil {
			return err
		}
		if payout <= 0 {
			return errors.New("nothing to cash out")
		}

		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		user.BalanceGame = roundMoney(user.BalanceGame + payout)
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		if err := recordSoloPayoutTx(tx, userID, session.Game, session.ID, payout); err != nil {
			return err
		}
		if err := ApplySoloResultTx(tx, userID, session.Game, session.BetCoins, payout); err != nil {
			return err
		}

		now := time.Now().UTC()
		session.Status = models.SoloSessionStatusCashedOut
		session.PayoutCoins = payout
		session.SettledAt = &now
		if err := tx.Save(&session).Error; err != nil {
			return err
		}

		stats, err := loadSoloStatsTx(tx, userID)
		if err != nil {
			return err
		}

		built, err := buildSoloSessionResult(*session, user.BalanceGame, stats, nil, payout)
		if err != nil {
			return err
		}
		result = built
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func ExpireStaleSoloSessions(db *gorm.DB, maxAge time.Duration) error {
	cutoff := time.Now().UTC().Add(-maxAge)
	var sessions []models.SoloSession
	if err := db.Where("status = ? AND updated_at < ?", models.SoloSessionStatusActive, cutoff).Find(&sessions).Error; err != nil {
		return err
	}

	var expireErrs []error
	for _, session := range sessions {
		if err := db.Transaction(func(tx *gorm.DB) error {
			return refundActiveSoloSessionTx(tx, session.ID)
		}); err != nil {
			expireErrs = append(expireErrs, err)
		}
	}
	return errors.Join(expireErrs...)
}

func GetActiveSoloSession(db *gorm.DB, userID uint, game string) (*SoloSessionResult, error) {
	game = solo.NormalizeGame(game)
	var session models.SoloSession
	err := db.Where("user_id = ? AND game = ? AND status = ?", userID, game, models.SoloSessionStatusActive).
		Order("created_at desc").
		First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSoloSessionNotFound
	}
	if err != nil {
		return nil, err
	}

	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	stats, err := GetUserSoloStats(db, userID)
	if err != nil {
		return nil, err
	}

	built, err := buildSoloSessionResult(session, user.BalanceGame, stats, nil, 0)
	if err != nil {
		return nil, err
	}
	return &built, nil
}

func AbandonSoloSession(db *gorm.DB, userID uint, sessionID string) (*SoloSessionResult, error) {
	var result SoloSessionResult
	err := db.Transaction(func(tx *gorm.DB) error {
		session, err := lockSoloSessionTx(tx, sessionID, userID)
		if err != nil {
			return err
		}
		if session.Status != models.SoloSessionStatusActive {
			return ErrSoloSessionNotActive
		}

		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return err
		}
		user.BalanceGame = roundMoney(user.BalanceGame + session.BetCoins)
		if err := tx.Save(&user).Error; err != nil {
			return err
		}
		if err := recordSoloRefundTx(tx, userID, session.Game, session.ID, session.BetCoins); err != nil {
			return err
		}

		now := time.Now().UTC()
		session.Status = models.SoloSessionStatusExpired
		session.SettledAt = &now
		if err := tx.Save(session).Error; err != nil {
			return err
		}

		stats, err := loadSoloStatsTx(tx, userID)
		if err != nil {
			return err
		}

		built, err := buildSoloSessionResult(*session, user.BalanceGame, stats, nil, 0)
		if err != nil {
			return err
		}
		result = built
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func refundActiveSoloSessionTx(tx *gorm.DB, sessionID string) error {
	var locked models.SoloSession
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, "id = ?", sessionID).Error; err != nil {
		return err
	}
	if locked.Status != models.SoloSessionStatusActive {
		return nil
	}

	var user models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, locked.UserID).Error; err != nil {
		return err
	}
	user.BalanceGame = roundMoney(user.BalanceGame + locked.BetCoins)
	if err := tx.Save(&user).Error; err != nil {
		return err
	}
	if err := recordSoloRefundTx(tx, locked.UserID, locked.Game, locked.ID, locked.BetCoins); err != nil {
		return err
	}

	now := time.Now().UTC()
	locked.Status = models.SoloSessionStatusExpired
	locked.SettledAt = &now
	return tx.Save(&locked).Error
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}

func ListSoloHistory(db *gorm.DB, userID uint, game string, limit int) ([]models.SoloRound, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := db.Where("user_id = ?", userID)
	if game != "" {
		q = q.Where("game = ?", solo.NormalizeGame(game))
	}
	var rounds []models.SoloRound
	err := q.Order("created_at desc").Limit(limit).Find(&rounds).Error
	return rounds, err
}

func replaySpinResult(db *gorm.DB, round models.SoloRound) (*SoloSpinResult, error) {
	var outcome any
	_ = json.Unmarshal([]byte(round.OutcomeJSON), &outcome)
	var user models.User
	if err := db.First(&user, round.UserID).Error; err != nil {
		return nil, err
	}
	stats, err := GetUserSoloStats(db, round.UserID)
	if err != nil {
		return nil, err
	}
	return &SoloSpinResult{
		RoundID:     round.ID,
		Game:        round.Game,
		BetCoins:    round.BetCoins,
		PayoutCoins: round.PayoutCoins,
		NetCoins:    round.NetCoins,
		Outcome:     outcome,
		BalanceGame: user.BalanceGame,
		SoloStats:   stats,
	}, nil
}

func lockSoloSessionTx(tx *gorm.DB, sessionID string, userID uint) (*models.SoloSession, error) {
	var session models.SoloSession
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND user_id = ?", sessionID, userID).
		First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSoloSessionNotFound
	}
	return &session, err
}

func loadSoloStatsTx(tx *gorm.DB, userID uint) (SoloStatsDTO, error) {
	if err := EnsureUserSoloStats(tx, userID); err != nil {
		return SoloStatsDTO{}, err
	}
	var stats models.UserSoloStats
	if err := tx.Where("user_id = ?", userID).First(&stats).Error; err != nil {
		return SoloStatsDTO{}, err
	}
	return soloStatsDTO(stats), nil
}

func recordSoloBetTx(tx *gorm.DB, userID uint, game, ref string, amount float64) error {
	meta, _ := json.Marshal(map[string]any{"game": game, "ref": ref, "action": "bet"})
	return tx.Create(&models.WalletTransaction{
		UserID: userID, Type: "solo_bet", Currency: "game", Amount: -amount, Status: "completed", Meta: string(meta),
	}).Error
}

func recordSoloPayoutTx(tx *gorm.DB, userID uint, game, ref string, amount float64) error {
	meta, _ := json.Marshal(map[string]any{"game": game, "ref": ref, "action": "payout"})
	return tx.Create(&models.WalletTransaction{
		UserID: userID, Type: "solo_payout", Currency: "game", Amount: amount, Status: "completed", Meta: string(meta),
	}).Error
}

func recordSoloRefundTx(tx *gorm.DB, userID uint, game, ref string, amount float64) error {
	meta, _ := json.Marshal(map[string]any{"game": game, "ref": ref, "action": "refund"})
	return tx.Create(&models.WalletTransaction{
		UserID: userID, Type: "solo_refund", Currency: "game", Amount: amount, Status: "completed", Meta: string(meta),
	}).Error
}

func newSoloID() string {
	buf := make([]byte, 12)
	_, _ = cryptorand.Read(buf)
	return hex.EncodeToString(buf)
}

func ptrTime(t time.Time) *time.Time { return &t }

func openedStepsForGame(game string, state any) int {
	switch solo.NormalizeGame(game) {
	case "royal_5x5":
		return state.(solo.RoyalState).OpenedRows
	case "crystal_mines":
		return state.(solo.CrystalState).SafePicks
	case "turbo_tower":
		return state.(solo.TurboState).ClearedFloors
	default:
		return 0
	}
}

func eventStatus(event any) string {
	switch e := event.(type) {
	case solo.RoyalStepEvent:
		return e.Status
	case solo.CrystalStepEvent:
		return e.Status
	case solo.TurboStepEvent:
		return e.Status
	default:
		return ""
	}
}
