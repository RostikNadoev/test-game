package tiltmaze

import (
	"math"
	"sort"
)

const (
	CellSize      = 46.0
	WallSize      = 8.0
	BallRadius    = 17.0
	MazeCols      = 18
	MazeRows      = 18
	mazeLoopRatio = 0.055
)

type direction uint8

const (
	dirNorth direction = iota
	dirEast
	dirSouth
	dirWest
)

type mazeCell struct {
	X       int
	Y       int
	Walls   [4]bool
	Visited bool
}

type exitSpec struct {
	X     float64
	Y     float64
	W     float64
	H     float64
	CellX int
	CellY int
	Side  direction
}

type mazeSpec struct {
	Cells          []mazeCell
	StartX         float64
	StartY         float64
	StartCellX     int
	StartCellY     int
	Exit           exitSpec
	WorldWidth     float64
	WorldHeight    float64
	DistanceToExit []int
}

type rng32 struct {
	state uint32
}

func newRNG(seed uint32) *rng32 {
	return &rng32{state: seed}
}

func (r *rng32) next() float64 {
	r.state += 0x6d2b79f5
	t := r.state
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + (t^(t>>7))*(t|61)
	return float64(t^(t>>14)) / 4294967296.0
}

func indexOf(x, y int) int {
	return y*MazeCols + x
}

func oppositeDirection(dir direction) direction {
	switch dir {
	case dirNorth:
		return dirSouth
	case dirSouth:
		return dirNorth
	case dirEast:
		return dirWest
	default:
		return dirEast
	}
}

func directionDelta(dir direction) (int, int) {
	switch dir {
	case dirNorth:
		return 0, -1
	case dirSouth:
		return 0, 1
	case dirEast:
		return 1, 0
	default:
		return -1, 0
	}
}

func shuffledDirections(rng *rng32) []direction {
	items := []direction{dirNorth, dirEast, dirSouth, dirWest}
	for i := len(items) - 1; i > 0; i-- {
		j := int(math.Floor(rng.next() * float64(i+1)))
		items[i], items[j] = items[j], items[i]
	}
	return items
}

func generateMaze(seed uint32) mazeSpec {
	rng := newRNG(seed)
	cells := make([]mazeCell, 0, MazeCols*MazeRows)
	for y := 0; y < MazeRows; y++ {
		for x := 0; x < MazeCols; x++ {
			cells = append(cells, mazeCell{
				X:     x,
				Y:     y,
				Walls: [4]bool{true, true, true, true},
			})
		}
	}

	corner := int(math.Floor(rng.next() * 4))
	startX, startY := 1, 1
	switch corner {
	case 1:
		startX, startY = MazeCols-2, 1
	case 2:
		startX, startY = MazeCols-2, MazeRows-2
	case 3:
		startX, startY = 1, MazeRows-2
	}

	stack := make([]int, 0, len(cells))
	currentIndex := indexOf(startX, startY)
	cells[currentIndex].Visited = true
	visitedCount := 1

	for visitedCount < len(cells) {
		type candidate struct {
			dir direction
			idx int
		}
		candidates := make([]candidate, 0, 4)
		current := cells[currentIndex]

		for _, dir := range shuffledDirections(rng) {
			dx, dy := directionDelta(dir)
			nx, ny := current.X+dx, current.Y+dy
			if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
				continue
			}
			nextIndex := indexOf(nx, ny)
			if !cells[nextIndex].Visited {
				candidates = append(candidates, candidate{dir: dir, idx: nextIndex})
			}
		}

		if len(candidates) > 0 {
			chosen := candidates[int(math.Floor(rng.next()*float64(len(candidates))))]
			cells[currentIndex].Walls[chosen.dir] = false
			cells[chosen.idx].Walls[oppositeDirection(chosen.dir)] = false
			stack = append(stack, currentIndex)
			currentIndex = chosen.idx
			cells[currentIndex].Visited = true
			visitedCount++
			continue
		}

		if len(stack) == 0 {
			break
		}
		currentIndex = stack[len(stack)-1]
		stack = stack[:len(stack)-1]
	}

	loopTarget := int(math.Floor(float64(len(cells)) * mazeLoopRatio))
	loops := 0
	attempts := 0
	for loops < loopTarget && attempts < loopTarget*30 {
		attempts++
		x := 1 + int(math.Floor(rng.next()*float64(MazeCols-2)))
		y := 1 + int(math.Floor(rng.next()*float64(MazeRows-2)))
		idx := indexOf(x, y)

		for _, dir := range shuffledDirections(rng) {
			if !cells[idx].Walls[dir] {
				continue
			}
			dx, dy := directionDelta(dir)
			nx, ny := x+dx, y+dy
			if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
				continue
			}
			nidx := indexOf(nx, ny)

			openCount := 0
			neighbourOpenCount := 0
			for d := dirNorth; d <= dirWest; d++ {
				if !cells[idx].Walls[d] {
					openCount++
				}
				if !cells[nidx].Walls[d] {
					neighbourOpenCount++
				}
			}
			if openCount >= 3 || neighbourOpenCount >= 3 {
				continue
			}

			cells[idx].Walls[dir] = false
			cells[nidx].Walls[oppositeDirection(dir)] = false
			loops++
			break
		}
	}

	distanceFromStart := make([]int, len(cells))
	for i := range distanceFromStart {
		distanceFromStart[i] = -1
	}
	queue := []int{indexOf(startX, startY)}
	distanceFromStart[queue[0]] = 0

	for q := 0; q < len(queue); q++ {
		idx := queue[q]
		cell := cells[idx]
		for dir := dirNorth; dir <= dirWest; dir++ {
			if cell.Walls[dir] {
				continue
			}
			dx, dy := directionDelta(dir)
			nx, ny := cell.X+dx, cell.Y+dy
			if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
				continue
			}
			nidx := indexOf(nx, ny)
			if distanceFromStart[nidx] != -1 {
				continue
			}
			distanceFromStart[nidx] = distanceFromStart[idx] + 1
			queue = append(queue, nidx)
		}
	}

	boundary := make([]int, 0, MazeCols*2+MazeRows*2)
	for i, cell := range cells {
		if cell.X == 0 || cell.Y == 0 || cell.X == MazeCols-1 || cell.Y == MazeRows-1 {
			boundary = append(boundary, i)
		}
	}
	sort.SliceStable(boundary, func(i, j int) bool {
		return distanceFromStart[boundary[i]] > distanceFromStart[boundary[j]]
	})
	exitIndex := boundary[0]
	exitCell := cells[exitIndex]

	possibleSides := make([]direction, 0, 2)
	if exitCell.X == 0 {
		possibleSides = append(possibleSides, dirWest)
	}
	if exitCell.X == MazeCols-1 {
		possibleSides = append(possibleSides, dirEast)
	}
	if exitCell.Y == 0 {
		possibleSides = append(possibleSides, dirNorth)
	}
	if exitCell.Y == MazeRows-1 {
		possibleSides = append(possibleSides, dirSouth)
	}
	exitSide := possibleSides[int(math.Floor(rng.next()*float64(len(possibleSides))))]
	cells[exitIndex].Walls[exitSide] = false

	worldWidth := float64(MazeCols) * CellSize
	worldHeight := float64(MazeRows) * CellSize
	centerX := float64(exitCell.X)*CellSize + CellSize/2
	centerY := float64(exitCell.Y)*CellSize + CellSize/2
	exitDepth := CellSize * 0.72
	exitWidth := CellSize - WallSize*1.3

	exit := exitSpec{CellX: exitCell.X, CellY: exitCell.Y, Side: exitSide}
	switch exitSide {
	case dirEast:
		exit.X = worldWidth - exitDepth
		exit.Y = centerY - exitWidth/2
		exit.W = exitDepth + 3
		exit.H = exitWidth
	case dirWest:
		exit.X = -3
		exit.Y = centerY - exitWidth/2
		exit.W = exitDepth + 3
		exit.H = exitWidth
	case dirSouth:
		exit.X = centerX - exitWidth/2
		exit.Y = worldHeight - exitDepth
		exit.W = exitWidth
		exit.H = exitDepth + 3
	case dirNorth:
		exit.X = centerX - exitWidth/2
		exit.Y = -3
		exit.W = exitWidth
		exit.H = exitDepth + 3
	}

	distanceToExit := make([]int, len(cells))
	for i := range distanceToExit {
		distanceToExit[i] = -1
	}
	queue = []int{exitIndex}
	distanceToExit[exitIndex] = 0

	for q := 0; q < len(queue); q++ {
		idx := queue[q]
		cell := cells[idx]
		for dir := dirNorth; dir <= dirWest; dir++ {
			if cell.Walls[dir] {
				continue
			}
			dx, dy := directionDelta(dir)
			nx, ny := cell.X+dx, cell.Y+dy
			if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
				continue
			}
			nidx := indexOf(nx, ny)
			if distanceToExit[nidx] != -1 {
				continue
			}
			distanceToExit[nidx] = distanceToExit[idx] + 1
			queue = append(queue, nidx)
		}
	}

	return mazeSpec{
		Cells:          cells,
		StartX:         float64(startX)*CellSize + CellSize/2,
		StartY:         float64(startY)*CellSize + CellSize/2,
		StartCellX:     startX,
		StartCellY:     startY,
		Exit:           exit,
		WorldWidth:     worldWidth,
		WorldHeight:    worldHeight,
		DistanceToExit: distanceToExit,
	}
}

func (m mazeSpec) containsPoint(x, y float64) bool {
	margin := BallRadius * 0.8
	return x >= -margin && y >= -margin && x <= m.WorldWidth+margin && y <= m.WorldHeight+margin
}

func (m mazeSpec) cellForPoint(x, y float64) (int, int) {
	cx := int(math.Floor(clampFloat(x, 0, m.WorldWidth-0.001) / CellSize))
	cy := int(math.Floor(clampFloat(y, 0, m.WorldHeight-0.001) / CellSize))
	if cx < 0 {
		cx = 0
	}
	if cy < 0 {
		cy = 0
	}
	if cx >= MazeCols {
		cx = MazeCols - 1
	}
	if cy >= MazeRows {
		cy = MazeRows - 1
	}
	return cx, cy
}

func (m mazeSpec) graphDistance(ax, ay, bx, by int) int {
	if ax == bx && ay == by {
		return 0
	}
	if ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= MazeCols || bx >= MazeCols || ay >= MazeRows || by >= MazeRows {
		return int(^uint(0) >> 1)
	}

	start := indexOf(ax, ay)
	target := indexOf(bx, by)
	distance := make([]int, len(m.Cells))
	for i := range distance {
		distance[i] = -1
	}
	queue := []int{start}
	distance[start] = 0

	for q := 0; q < len(queue); q++ {
		idx := queue[q]
		cell := m.Cells[idx]
		for dir := dirNorth; dir <= dirWest; dir++ {
			if cell.Walls[dir] {
				continue
			}
			dx, dy := directionDelta(dir)
			nx, ny := cell.X+dx, cell.Y+dy
			if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
				continue
			}
			nidx := indexOf(nx, ny)
			if distance[nidx] != -1 {
				continue
			}
			distance[nidx] = distance[idx] + 1
			if nidx == target {
				return distance[nidx]
			}
			queue = append(queue, nidx)
		}
	}

	return int(^uint(0) >> 1)
}

func (m mazeSpec) remainingDistance(x, y float64) float64 {
	if m.inExit(x, y) {
		return 0
	}

	cx, cy := m.cellForPoint(x, y)
	idx := indexOf(cx, cy)
	cell := m.Cells[idx]

	if cx == m.Exit.CellX && cy == m.Exit.CellY {
		exitCenterX := m.Exit.X + m.Exit.W/2
		exitCenterY := m.Exit.Y + m.Exit.H/2
		return math.Hypot(x-exitCenterX, y-exitCenterY) / CellSize
	}

	best := math.Inf(1)
	for dir := dirNorth; dir <= dirWest; dir++ {
		if cell.Walls[dir] {
			continue
		}
		dx, dy := directionDelta(dir)
		nx, ny := cx+dx, cy+dy
		if nx < 0 || ny < 0 || nx >= MazeCols || ny >= MazeRows {
			continue
		}

		neighbourDistance := m.DistanceToExit[indexOf(nx, ny)]
		if neighbourDistance < 0 {
			continue
		}

		gatewayX := float64(cx)*CellSize + CellSize/2
		gatewayY := float64(cy)*CellSize + CellSize/2
		switch dir {
		case dirNorth:
			gatewayY = float64(cy) * CellSize
		case dirSouth:
			gatewayY = float64(cy+1) * CellSize
		case dirEast:
			gatewayX = float64(cx+1) * CellSize
		case dirWest:
			gatewayX = float64(cx) * CellSize
		}

		toGateway := math.Hypot(x-gatewayX, y-gatewayY) / CellSize
		candidate := toGateway + float64(neighbourDistance) + 1.0
		if candidate < best {
			best = candidate
		}
	}

	if math.IsInf(best, 1) {
		steps := m.DistanceToExit[idx]
		if steps < 0 {
			return float64(MazeCols * MazeRows)
		}
		cellCenterX := float64(cx)*CellSize + CellSize/2
		cellCenterY := float64(cy)*CellSize + CellSize/2
		return float64(steps) + math.Hypot(x-cellCenterX, y-cellCenterY)/CellSize + 0.5
	}

	return best
}

func (m mazeSpec) inExit(x, y float64) bool {
	pad := BallRadius * 0.25
	return x > m.Exit.X-pad && x < m.Exit.X+m.Exit.W+pad && y > m.Exit.Y-pad && y < m.Exit.Y+m.Exit.H+pad
}

func clampFloat(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
