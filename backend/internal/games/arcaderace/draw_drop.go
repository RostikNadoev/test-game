package arcaderace

import "errors"

const drawDropRoundLevelCount = 5

type DrawDropPlayerState struct {
	Completed [drawDropRoundLevelCount]bool
	InkUsed   [drawDropRoundLevelCount]int
	Finished  bool
}

func selectDrawDropLevelIndices(seed int64) []int {
	count := len(drawDropParInk)
	indices := make([]int, count)
	for i := range indices {
		indices[i] = i
	}

	state := uint64(seed)
	if state == 0 {
		state = 0x9e3779b97f4a7c15
	}

	next := func() uint64 {
		state = state*6364136223846793005 + 1442695040888963407
		return state
	}

	for i := count - 1; i > 0; i-- {
		j := int(next() % uint64(i+1))
		indices[i], indices[j] = indices[j], indices[i]
	}

	if len(indices) > drawDropRoundLevelCount {
		indices = indices[:drawDropRoundLevelCount]
	}
	return append([]int(nil), indices...)
}

func (s *Session) resetDrawDropLocked() {
	s.drawDropLevelIndices = selectDrawDropLevelIndices(s.seed)
	s.drawDropStates = make(map[uint]*DrawDropPlayerState, len(s.playerOrder))

	for _, userID := range s.playerOrder {
		s.drawDropStates[userID] = &DrawDropPlayerState{}
		s.updateDrawDropScoreLocked(userID)
	}
}

func (s *Session) applyDrawDropEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
) (int, bool, error) {
	if kind != "complete" {
		return 0, false, errors.New("invalid draw drop event")
	}

	player := s.drawDropStates[userID]
	if player == nil {
		return 0, false, nil
	}

	slot := message.Value - 1
	if slot < 0 || slot >= drawDropRoundLevelCount || slot >= len(s.drawDropLevelIndices) {
		return 0, false, errors.New("invalid draw drop level slot")
	}
	if player.Completed[slot] {
		return 0, false, nil
	}

	ink := int(message.ObjectID)
	if ink < 0 || ink > 20000 {
		return 0, false, errors.New("invalid draw drop ink value")
	}

	previousScore := s.scores[userID]
	player.Completed[slot] = true
	player.InkUsed[slot] = ink
	player.Finished = player.completedCount() >= drawDropRoundLevelCount
	s.updateDrawDropScoreLocked(userID)

	return s.scores[userID] - previousScore, true, nil
}

func (p *DrawDropPlayerState) completedCount() int {
	if p == nil {
		return 0
	}
	count := 0
	for _, completed := range p.Completed {
		if completed {
			count++
		}
	}
	return count
}

func (p *DrawDropPlayerState) totalInk() int {
	if p == nil {
		return 0
	}
	total := 0
	for slot, completed := range p.Completed {
		if completed {
			total += p.InkUsed[slot]
		}
	}
	return total
}

// drawDropInkRatioBPLocked returns the average normalized ink cost.
// 10000 means exactly the benchmark (par) ink, 8000 means 20% less ink.
// Lower is better.
func (s *Session) drawDropInkRatioBPLocked(player *DrawDropPlayerState) int {
	if player == nil {
		return 0
	}

	completed := 0
	var total int64
	for slot, done := range player.Completed {
		if !done || slot >= len(s.drawDropLevelIndices) {
			continue
		}
		levelIndex := s.drawDropLevelIndices[slot]
		if levelIndex < 0 || levelIndex >= len(drawDropParInk) {
			continue
		}
		par := drawDropParInk[levelIndex]
		if par <= 0 {
			continue
		}
		ink := player.InkUsed[slot]
		if ink < 1 {
			ink = 1
		}
		ratio := int64(ink) * 10000 / int64(par)
		if ratio > 50000 {
			ratio = 50000
		}
		total += ratio
		completed++
	}
	if completed == 0 {
		return 0
	}
	return int(total / int64(completed))
}

func (s *Session) drawDropEfficiencyBPLocked(player *DrawDropPlayerState) int {
	ratio := s.drawDropInkRatioBPLocked(player)
	if ratio <= 0 {
		return 0
	}
	// 10000 = par efficiency. Less ink gives >10000, capped for display/score.
	efficiency := 100000000 / ratio
	return clampInt(efficiency, 0, 20000)
}

func (s *Session) updateDrawDropScoreLocked(userID uint) {
	player := s.drawDropStates[userID]
	if player == nil {
		s.scores[userID] = 0
		return
	}

	completed := player.completedCount()
	efficiency := s.drawDropEfficiencyBPLocked(player)
	// One completed level always outweighs every possible ink-efficiency difference.
	s.scores[userID] = completed*1_000_000 + efficiency
}

func (s *Session) drawDropAllFinishedLocked() bool {
	if s.gameCode != DrawDropGameCode || len(s.playerOrder) != 2 {
		return false
	}
	for _, userID := range s.playerOrder {
		player := s.drawDropStates[userID]
		if player == nil || !player.Finished {
			return false
		}
	}
	return true
}

func (s *Session) drawDropWinnerLocked() (uint, bool) {
	if len(s.playerOrder) != 2 {
		return 0, true
	}
	firstID := s.playerOrder[0]
	secondID := s.playerOrder[1]
	first := s.drawDropStates[firstID]
	second := s.drawDropStates[secondID]
	if first == nil || second == nil {
		return 0, true
	}

	firstCompleted := first.completedCount()
	secondCompleted := second.completedCount()
	if firstCompleted != secondCompleted {
		if firstCompleted > secondCompleted {
			return firstID, false
		}
		return secondID, false
	}

	if firstCompleted > 0 {
		firstRatio := s.drawDropInkRatioBPLocked(first)
		secondRatio := s.drawDropInkRatioBPLocked(second)
		if firstRatio != secondRatio {
			if firstRatio < secondRatio {
				return firstID, false
			}
			return secondID, false
		}

		firstInk := first.totalInk()
		secondInk := second.totalInk()
		if firstInk != secondInk {
			if firstInk < secondInk {
				return firstID, false
			}
			return secondID, false
		}
	}

	return 0, true
}
