package realtime

import (
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

func saveLobbyRecord(db *gorm.DB, lobby *Lobby) error {
	if db == nil || lobby == nil {
		return nil
	}

	record := models.LobbyRecord{
		ID:         lobby.ID,
		Name:       lobby.Name,
		Game:       lobby.Game,
		Status:     lobby.Status,
		BetCoins:   lobby.BetCoins,
		MaxPlayers: lobby.MaxPlayers,
		CreatedBy:  lobby.CreatedBy,
		CreatedAt:  lobby.CreatedAt,
		UpdatedAt:  lobby.UpdatedAt,
	}

	return db.Save(&record).Error
}

func deleteLobbyRecord(db *gorm.DB, lobbyID string) error {
	if db == nil || lobbyID == "" {
		return nil
	}

	if err := db.Where("lobby_id = ?", lobbyID).Delete(&models.LobbyPlayerRecord{}).Error; err != nil {
		return err
	}

	return db.Delete(&models.LobbyRecord{}, "id = ?", lobbyID).Error
}

func saveLobbyPlayer(db *gorm.DB, lobbyID string, userID uint) error {
	if db == nil || lobbyID == "" || userID == 0 {
		return nil
	}

	var existing models.LobbyPlayerRecord
	err := db.Where("lobby_id = ? AND user_id = ?", lobbyID, userID).First(&existing).Error
	if err == nil {
		return nil
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}

	return db.Create(&models.LobbyPlayerRecord{
		LobbyID: lobbyID,
		UserID:  userID,
	}).Error
}

func deleteLobbyPlayer(db *gorm.DB, lobbyID string, userID uint) error {
	if db == nil || lobbyID == "" || userID == 0 {
		return nil
	}

	return db.Where("lobby_id = ? AND user_id = ?", lobbyID, userID).
		Delete(&models.LobbyPlayerRecord{}).Error
}

func loadActiveLobbies(db *gorm.DB) ([]*Lobby, error) {
	if db == nil {
		return nil, nil
	}

	var records []models.LobbyRecord
	if err := db.Where("status IN ?", []string{LobbyStatusWaiting, LobbyStatusPlaying}).
		Find(&records).Error; err != nil {
		return nil, err
	}

	out := make([]*Lobby, 0, len(records))
	for _, record := range records {
		var playerRecords []models.LobbyPlayerRecord
		if err := db.Where("lobby_id = ?", record.ID).Find(&playerRecords).Error; err != nil {
			return nil, err
		}

		players := make(map[uint]bool, len(playerRecords))
		for _, player := range playerRecords {
			players[player.UserID] = true
		}

		out = append(out, &Lobby{
			ID:         record.ID,
			Name:       record.Name,
			Game:       record.Game,
			Status:     record.Status,
			BetCoins:   record.BetCoins,
			MaxPlayers: record.MaxPlayers,
			Players:    players,
			CreatedBy:  record.CreatedBy,
			CreatedAt:  record.CreatedAt,
			UpdatedAt:  record.UpdatedAt,
		})
	}

	return out, nil
}
