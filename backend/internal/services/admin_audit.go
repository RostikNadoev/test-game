package services

import (
	"encoding/json"
	"tg-lobbies-base/internal/models"

	"gorm.io/gorm"
)

func RecordAdminAction(db *gorm.DB, adminUsername, action, targetType, targetID, reason, ip string, before, after any) error {
	if db == nil {
		return nil
	}
	beforeJSON, _ := json.Marshal(before)
	afterJSON, _ := json.Marshal(after)
	return db.Create(&models.AdminAuditLog{
		AdminUsername: adminUsername,
		Action:        action,
		TargetType:    targetType,
		TargetID:      targetID,
		Reason:        reason,
		BeforeJSON:    string(beforeJSON),
		AfterJSON:     string(afterJSON),
		IP:            ip,
	}).Error
}

func ListAdminAuditLogs(db *gorm.DB, action string, limit, offset int) ([]models.AdminAuditLog, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := db.Model(&models.AdminAuditLog{})
	if action != "" {
		q = q.Where("action = ?", action)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []models.AdminAuditLog
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}
