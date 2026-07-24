package arcaderace

import (
	"errors"
	"math"
	mathrand "math/rand"
	"time"
)

const (
	ballzStageCount         = 2
	ballzCols               = 7
	ballzBoardRows          = 9
	ballzBrickRows          = 6
	ballzStartBalls         = 25
	ballzBallRadius         = 0.11
	ballzBallSpeed          = 10.90
	ballzFixedStep          = 1.0 / 120.0
	ballzLaunchInterval     = 0.044
	ballzSameBrickCooldown  = 0.034
	ballzCannonY            = 8.28
	ballzBallStartY         = 7.98
	ballzReturnY            = 8.92
	ballzBrickPadding       = 0.075
	ballzMaxShotSeconds     = 18.0
	ballzEfficiencyBallCost = 3
)

type BallzBrickLayout struct {
	ID  int `json:"id"`
	Col int `json:"col"`
	Row int `json:"row"`
	HP  int `json:"hp"`
}

type BallzPickupLayout struct {
	ID  int `json:"id"`
	Col int `json:"col"`
	Row int `json:"row"`
}

type BallzStageLayout struct {
	Bricks  []BallzBrickLayout  `json:"bricks"`
	Pickups []BallzPickupLayout `json:"pickups"`
}

type BallzPlayerState struct {
	Stage          int
	BrickHP        [][]int
	PickupAlive    [][]bool
	AvailableBalls int
	BallsUsed      int
	Shots          int
	LaunchX        float64
	Finished       bool
	ShotEndsAt     time.Time
}

type ballzSimBall struct {
	X              float64
	Y              float64
	VX             float64
	VY             float64
	Active         bool
	Launched       bool
	Returned       bool
	LastBrickID    int
	LastBrickHitAt float64
}

func (p *BallzPlayerState) displayStage() int {
	if p == nil {
		return 1
	}
	if p.Finished || p.Stage >= ballzStageCount {
		return ballzStageCount
	}
	return p.Stage + 1
}

func (s *Session) resetBallzLocked() {
	s.ballzStages = make([]BallzStageLayout, ballzStageCount)

	for stage := 0; stage < ballzStageCount; stage++ {
		seed := s.seed ^ int64((stage+1)*1_000_003)
		s.ballzStages[stage] = generateBallzStage(seed, stage)
	}

	s.ballzStates = make(map[uint]*BallzPlayerState, len(s.playerOrder))

	for _, userID := range s.playerOrder {
		state := &BallzPlayerState{
			Stage:          0,
			BrickHP:        make([][]int, ballzStageCount),
			PickupAlive:    make([][]bool, ballzStageCount),
			AvailableBalls: ballzStartBalls,
			LaunchX:        0.5,
		}

		for stage := 0; stage < ballzStageCount; stage++ {
			layout := s.ballzStages[stage]

			state.BrickHP[stage] = make([]int, len(layout.Bricks))
			for index, brick := range layout.Bricks {
				state.BrickHP[stage][index] = brick.HP
			}

			state.PickupAlive[stage] = make([]bool, len(layout.Pickups))
			for index := range layout.Pickups {
				state.PickupAlive[stage][index] = true
			}
		}

		s.ballzStates[userID] = state
		s.scores[userID] = s.ballzScoreLocked(state)
	}
}

func generateBallzStage(seed int64, stage int) BallzStageLayout {
	random := mathrand.New(mathrand.NewSource(seed))

	baseHP := 5
	hpSpread := 12
	targetBrickCount := 22
	baseDensity := 0.49
	heavyChance := 0.14

	if stage == 1 {
		baseHP = 9
		hpSpread = 18
		targetBrickCount = 25
		baseDensity = 0.56
		heavyChance = 0.195
	}

	bricks := make([]BallzBrickLayout, 0, targetBrickCount)
	occupied := make(map[[2]int]bool, targetBrickCount)
	nextID := stage*10_000 + 1

	for row := 0; row < ballzBrickRows; row++ {
		density := baseDensity + float64(row)*0.015
		guaranteedFree := random.Intn(ballzCols)
		secondFree := -1
		if random.Float64() < 0.42 {
			secondFree = random.Intn(ballzCols)
		}

		for col := 0; col < ballzCols; col++ {
			if col == guaranteedFree || col == secondFree {
				continue
			}
			if random.Float64() > density {
				continue
			}

			hp := baseHP + random.Intn(hpSpread) + row*(stage+1)
			if random.Float64() < heavyChance {
				hp += 4 + random.Intn(9)
			}

			key := [2]int{row, col}
			occupied[key] = true

			bricks = append(bricks, BallzBrickLayout{
				ID:  nextID,
				Col: col,
				Row: row,
				HP:  hp,
			})
			nextID++
		}
	}

	for attempts := 0; len(bricks) < targetBrickCount && attempts < 180; attempts++ {
		row := random.Intn(ballzBrickRows)
		col := random.Intn(ballzCols)
		key := [2]int{row, col}
		if occupied[key] {
			continue
		}

		occupied[key] = true
		hp := baseHP + random.Intn(hpSpread) + row*(stage+1)
		if random.Float64() < 0.16 {
			hp += 4 + random.Intn(8)
		}

		bricks = append(bricks, BallzBrickLayout{
			ID:  nextID,
			Col: col,
			Row: row,
			HP:  hp,
		})
		nextID++
	}

	free := make([][2]int, 0, ballzBrickRows*ballzCols-len(occupied))
	for row := 0; row < ballzBrickRows; row++ {
		for col := 0; col < ballzCols; col++ {
			key := [2]int{row, col}
			if !occupied[key] {
				free = append(free, key)
			}
		}
	}

	pickupCount := 3
	if stage == 1 {
		pickupCount = 4
	}

	pickups := make([]BallzPickupLayout, 0, pickupCount)
	for index := 0; index < pickupCount && len(free) > 0; index++ {
		pickIndex := random.Intn(len(free))
		cell := free[pickIndex]
		free[pickIndex] = free[len(free)-1]
		free = free[:len(free)-1]

		pickups = append(pickups, BallzPickupLayout{
			ID:  nextID,
			Col: cell[1],
			Row: cell[0],
		})
		nextID++
	}

	return BallzStageLayout{
		Bricks:  bricks,
		Pickups: pickups,
	}
}

func (s *Session) applyBallzEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
	now time.Time,
) (int, bool, error) {
	if kind != "shot" {
		return 0, false, errors.New("invalid ballz event")
	}

	player := s.ballzStates[userID]
	if player == nil || player.Finished {
		return 0, false, nil
	}

	if message.Value != player.displayStage() {
		return 0, false, errors.New("ballz stage is stale")
	}

	if message.Balls < 1 || message.Balls > player.AvailableBalls {
		return 0, false, errors.New("invalid ball count")
	}

	if math.IsNaN(message.Angle) || math.IsInf(message.Angle, 0) {
		return 0, false, errors.New("invalid shot angle")
	}
	if message.Angle < -math.Pi+0.16 || message.Angle > -0.16 {
		return 0, false, errors.New("shot angle is outside allowed range")
	}

	previousScore := s.scores[userID]

	player.BallsUsed += message.Balls
	player.Shots++

	duration := s.simulateBallzShotLocked(player, message.Angle, message.Balls)
	player.ShotEndsAt = now.Add(time.Duration(duration * float64(time.Second)))

	if s.ballzStageClearedLocked(player, player.Stage) {
		if player.Stage >= ballzStageCount-1 {
			player.Finished = true
			player.Stage = ballzStageCount
		} else {
			player.Stage++
			player.LaunchX = 0.5
		}
	}

	newScore := s.ballzScoreLocked(player)
	s.scores[userID] = newScore

	return newScore - previousScore, true, nil
}

func (s *Session) simulateBallzShotLocked(
	player *BallzPlayerState,
	angle float64,
	count int,
) float64 {
	stage := player.Stage
	if stage < 0 || stage >= len(s.ballzStages) {
		return 0
	}

	layout := s.ballzStages[stage]
	hp := player.BrickHP[stage]
	pickups := player.PickupAlive[stage]

	balls := make([]ballzSimBall, count)
	for index := range balls {
		balls[index] = ballzSimBall{
			X: player.LaunchX * ballzCols,
			Y: ballzBallStartY,
		}
	}

	launchIndex := 0
	activeCount := 0
	nextLaunch := 0.0
	firstReturnX := math.NaN()
	elapsed := 0.0

	for elapsed <= ballzMaxShotSeconds {
		for launchIndex < count && elapsed+1e-9 >= nextLaunch {
			ball := &balls[launchIndex]
			ball.Launched = true
			ball.Active = true
			ball.VX = math.Cos(angle) * ballzBallSpeed
			ball.VY = math.Sin(angle) * ballzBallSpeed
			activeCount++
			launchIndex++
			nextLaunch += ballzLaunchInterval
		}

		for ballIndex := range balls {
			ball := &balls[ballIndex]
			if !ball.Active {
				continue
			}

			ball.X += ball.VX * ballzFixedStep
			ball.Y += ball.VY * ballzFixedStep

			if ball.X-ballzBallRadius <= 0 {
				ball.X = ballzBallRadius
				ball.VX = math.Abs(ball.VX)
				ball.LastBrickID = 0
			} else if ball.X+ballzBallRadius >= ballzCols {
				ball.X = ballzCols - ballzBallRadius
				ball.VX = -math.Abs(ball.VX)
				ball.LastBrickID = 0
			}

			if ball.Y-ballzBallRadius <= 0 {
				ball.Y = ballzBallRadius
				ball.VY = math.Abs(ball.VY)
				ball.LastBrickID = 0
			}

			collided := false
			for brickIndex, brick := range layout.Bricks {
				if brickIndex >= len(hp) || hp[brickIndex] <= 0 {
					continue
				}
				if ball.LastBrickID == brick.ID &&
					elapsed-ball.LastBrickHitAt < ballzSameBrickCooldown {
					continue
				}

				x := float64(brick.Col) + ballzBrickPadding
				y := float64(brick.Row) + ballzBrickPadding
				w := 1.0 - ballzBrickPadding*2
				h := 1.0 - ballzBrickPadding*2

				closestX := clampFloat(ball.X, x, x+w)
				closestY := clampFloat(ball.Y, y, y+h)
				dx := ball.X - closestX
				dy := ball.Y - closestY

				if dx*dx+dy*dy > ballzBallRadius*ballzBallRadius {
					continue
				}

				overlapLeft := math.Abs(ball.X + ballzBallRadius - x)
				overlapRight := math.Abs(x + w - (ball.X - ballzBallRadius))
				overlapTop := math.Abs(ball.Y + ballzBallRadius - y)
				overlapBottom := math.Abs(y + h - (ball.Y - ballzBallRadius))
				minOverlap := math.Min(
					math.Min(overlapLeft, overlapRight),
					math.Min(overlapTop, overlapBottom),
				)

				if minOverlap == overlapLeft || minOverlap == overlapRight {
					ball.VX *= -1
					if ball.VX > 0 {
						ball.X += 0.022
					} else {
						ball.X -= 0.022
					}
				} else {
					ball.VY *= -1
					if ball.VY > 0 {
						ball.Y += 0.022
					} else {
						ball.Y -= 0.022
					}
				}

				ball.LastBrickID = brick.ID
				ball.LastBrickHitAt = elapsed

				hp[brickIndex]--
				if hp[brickIndex] < 0 {
					hp[brickIndex] = 0
				}

				collided = true
				break
			}

			if !collided {
				ball.LastBrickID = 0
			}

			for pickupIndex, pickup := range layout.Pickups {
				if pickupIndex >= len(pickups) || !pickups[pickupIndex] {
					continue
				}

				cx := float64(pickup.Col) + 0.5
				cy := float64(pickup.Row) + 0.5
				radius := 0.19
				dx := ball.X - cx
				dy := ball.Y - cy
				totalRadius := ballzBallRadius + radius

				if dx*dx+dy*dy <= totalRadius*totalRadius {
					pickups[pickupIndex] = false
					player.AvailableBalls++
				}
			}

			if ball.Y+ballzBallRadius >= ballzReturnY && ball.VY > 0 {
				ball.Active = false
				ball.Returned = true
				activeCount--

				if math.IsNaN(firstReturnX) {
					firstReturnX = clampFloat(
						ball.X,
						ballzBallRadius*2,
						ballzCols-ballzBallRadius*2,
					)
				}
			}
		}

		allLaunched := launchIndex >= count
		if allLaunched && activeCount <= 0 {
			break
		}

		elapsed += ballzFixedStep
	}

	if !math.IsNaN(firstReturnX) {
		player.LaunchX = clampFloat(firstReturnX/ballzCols, 0.035, 0.965)
	}

	return elapsed
}

func (s *Session) ballzStageClearedLocked(
	player *BallzPlayerState,
	stage int,
) bool {
	if player == nil || stage < 0 || stage >= len(player.BrickHP) {
		return false
	}

	for _, hp := range player.BrickHP[stage] {
		if hp > 0 {
			return false
		}
	}
	return true
}

func (s *Session) ballzTotalInitialHPLocked() int {
	total := 0
	for _, stage := range s.ballzStages {
		for _, brick := range stage.Bricks {
			total += brick.HP
		}
	}
	return total
}

func (s *Session) ballzRemainingHPLocked(player *BallzPlayerState) int {
	if player == nil {
		return s.ballzTotalInitialHPLocked()
	}

	total := 0
	for _, stageHP := range player.BrickHP {
		for _, hp := range stageHP {
			if hp > 0 {
				total += hp
			}
		}
	}
	return total
}

func (s *Session) ballzDestroyedHPLocked(player *BallzPlayerState) int {
	total := s.ballzTotalInitialHPLocked()
	return maxInt(0, total-s.ballzRemainingHPLocked(player))
}

func (s *Session) ballzProgressBPLocked(player *BallzPlayerState) int {
	total := s.ballzTotalInitialHPLocked()
	if total <= 0 {
		return 0
	}
	if player != nil && player.Finished {
		return 10_000
	}

	destroyed := s.ballzDestroyedHPLocked(player)
	return ballzClampInt((destroyed*10_000+total/2)/total, 0, 10_000)
}

func (s *Session) ballzEfficiencyBPLocked(player *BallzPlayerState) int {
	if player == nil || player.BallsUsed <= 0 {
		return 0
	}

	destroyed := s.ballzDestroyedHPLocked(player)
	if destroyed <= 0 {
		return 0
	}

	denominator := destroyed + player.BallsUsed*ballzEfficiencyBallCost
	if denominator <= 0 {
		return 0
	}

	return ballzClampInt((destroyed*10_000+denominator/2)/denominator, 0, 10_000)
}

func (s *Session) ballzScoreLocked(player *BallzPlayerState) int {
	progress := s.ballzProgressBPLocked(player)
	efficiency := s.ballzEfficiencyBPLocked(player)

	// 60% progress, 40% ball-use efficiency.
	return ballzClampInt((progress*60+efficiency*40+50)/100, 0, 10_000)
}

func (s *Session) ballzAllFinishedLocked() bool {
	if s.gameCode != BallzDuelGameCode || len(s.playerOrder) != 2 {
		return false
	}

	for _, userID := range s.playerOrder {
		player := s.ballzStates[userID]
		if player == nil || !player.Finished {
			return false
		}
	}

	return true
}

func (s *Session) ballzWinnerLocked() (uint, bool) {
	if len(s.playerOrder) != 2 {
		return 0, true
	}

	firstID := s.playerOrder[0]
	secondID := s.playerOrder[1]
	first := s.ballzStates[firstID]
	second := s.ballzStates[secondID]

	firstScore := s.ballzScoreLocked(first)
	secondScore := s.ballzScoreLocked(second)

	if firstScore != secondScore {
		if firstScore > secondScore {
			return firstID, false
		}
		return secondID, false
	}

	firstProgress := s.ballzProgressBPLocked(first)
	secondProgress := s.ballzProgressBPLocked(second)
	if firstProgress != secondProgress {
		if firstProgress > secondProgress {
			return firstID, false
		}
		return secondID, false
	}

	firstUsed := 0
	secondUsed := 0
	if first != nil {
		firstUsed = first.BallsUsed
	}
	if second != nil {
		secondUsed = second.BallsUsed
	}

	if firstUsed != secondUsed {
		if firstUsed < secondUsed {
			return firstID, false
		}
		return secondID, false
	}

	return 0, true
}

func (s *Session) ballzFinishDelayLocked(now time.Time) time.Duration {
	latest := now
	for _, userID := range s.playerOrder {
		player := s.ballzStates[userID]
		if player != nil && player.ShotEndsAt.After(latest) {
			latest = player.ShotEndsAt
		}
	}

	delay := latest.Sub(now)
	if !s.matchEndsAt.IsZero() {
		remaining := s.matchEndsAt.Sub(now)
		if remaining < delay {
			delay = remaining
		}
	}
	if delay < 0 {
		return 0
	}
	return delay
}

func ballzClampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
