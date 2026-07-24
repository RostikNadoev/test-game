package arcaderace

import (
	"errors"
	"strings"
)

const cubeFillRoundLevelCount = 4

type CubeFillCell struct {
	R int
	C int
}

type CubeFillLevel struct {
	Map     []string
	Start   CubeFillCell
	Optimal int
	Floors  int
}

type CubeFillPlayerState struct {
	LevelSlot    int
	Position     CubeFillCell
	Painted      map[int]bool
	LevelMoves   [cubeFillRoundLevelCount]int
	CurrentMoves int
	TotalMoves   int
	Finished     bool
}

func (p *CubeFillPlayerState) displayLevel() int {
	if p == nil {
		return 1
	}
	if p.LevelSlot >= cubeFillRoundLevelCount {
		return cubeFillRoundLevelCount
	}
	return p.LevelSlot + 1
}

var cubeFillLevels = []CubeFillLevel{
	{
		Map: []string{
			".......",
			".#.....",
			".....##",
			".......",
			"#.##.#.",
			"#......",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 15,
		Floors:  40,
	},
	{
		Map: []string{
			"..#....",
			".....#.",
			".......",
			"......#",
			".......",
			"...#...",
			"...#..#",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 15,
		Floors:  43,
	},
	{
		Map: []string{
			".#.....",
			".......",
			".......",
			"#......",
			"......#",
			".......",
			"#####.#",
		},
		Start:   CubeFillCell{R: 2, C: 6},
		Optimal: 16,
		Floors:  40,
	},
	{
		Map: []string{
			".#....#",
			".....##",
			".....##",
			".......",
			"#...##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 16,
		Floors:  39,
	},
	{
		Map: []string{
			".......",
			".#.....",
			".....##",
			".......",
			"#....#.",
			".....#.",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 4},
		Optimal: 16,
		Floors:  42,
	},
	{
		Map: []string{
			".....#.",
			".......",
			".......",
			"......#",
			"#......",
			".......",
			"....#.#",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 17,
		Floors:  44,
	},
	{
		Map: []string{
			"...#..#",
			".#.....",
			".......",
			".......",
			"#......",
			"......#",
			".##....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 17,
		Floors:  42,
	},
	{
		Map: []string{
			"..#....",
			".#.....",
			".....##",
			".......",
			"....##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 5, C: 6},
		Optimal: 17,
		Floors:  42,
	},
	{
		Map: []string{
			"#......",
			"..#....",
			"......#",
			".......",
			".....#.",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 1, C: 6},
		Optimal: 17,
		Floors:  44,
	},
	{
		Map: []string{
			".......",
			".......",
			"#......",
			"......#",
			"...#...",
			"...#...",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 4},
		Optimal: 17,
		Floors:  44,
	},
	{
		Map: []string{
			"......#",
			"##.....",
			".....#.",
			".......",
			"#....#.",
			".....#.",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 17,
		Floors:  41,
	},
	{
		Map: []string{
			"#.#....",
			".......",
			".......",
			".......",
			".......",
			"...#...",
			"#..#..#",
		},
		Start:   CubeFillCell{R: 1, C: 6},
		Optimal: 17,
		Floors:  43,
	},
	{
		Map: []string{
			"....#..",
			".......",
			"...#...",
			"...#...",
			"#.....#",
			".....##",
			".....##",
		},
		Start:   CubeFillCell{R: 3, C: 6},
		Optimal: 17,
		Floors:  40,
	},
	{
		Map: []string{
			"..##.#.",
			".......",
			".....#.",
			"#......",
			".......",
			".......",
			"...#..#",
		},
		Start:   CubeFillCell{R: 4, C: 0},
		Optimal: 18,
		Floors:  42,
	},
	{
		Map: []string{
			".....##",
			".#.....",
			".......",
			".......",
			"#....#.",
			".......",
			"..#...#",
		},
		Start:   CubeFillCell{R: 2, C: 0},
		Optimal: 18,
		Floors:  42,
	},
	{
		Map: []string{
			"....#..",
			".......",
			"#......",
			".......",
			"......#",
			"#......",
			"##...##",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 18,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			".##....",
			"#.....#",
			".......",
			".......",
			".......",
			"...#..#",
		},
		Start:   CubeFillCell{R: 0, C: 4},
		Optimal: 18,
		Floors:  43,
	},
	{
		Map: []string{
			".#.#..#",
			".#.....",
			".....#.",
			".....#.",
			"#...##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 18,
		Floors:  39,
	},
	{
		Map: []string{
			".#....#",
			".#.....",
			".....##",
			".......",
			"#...##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 2},
		Optimal: 18,
		Floors:  40,
	},
	{
		Map: []string{
			"..#....",
			".......",
			".......",
			"#......",
			"...#...",
			"...#...",
			"...#..#",
		},
		Start:   CubeFillCell{R: 4, C: 0},
		Optimal: 18,
		Floors:  43,
	},
	{
		Map: []string{
			"....#..",
			".#.....",
			".....#.",
			".......",
			"..##.#.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 1},
		Optimal: 18,
		Floors:  42,
	},
	{
		Map: []string{
			"...#...",
			".......",
			"#......",
			".......",
			"......#",
			".......",
			"..#...#",
		},
		Start:   CubeFillCell{R: 3, C: 6},
		Optimal: 18,
		Floors:  44,
	},
	{
		Map: []string{
			".......",
			".#.....",
			".....##",
			".......",
			"#......",
			"......#",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 18,
		Floors:  43,
	},
	{
		Map: []string{
			"#......",
			"..#....",
			"......#",
			".......",
			".......",
			".....#.",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 18,
		Floors:  44,
	},
	{
		Map: []string{
			".##....",
			".......",
			"....#..",
			"...##..",
			"#......",
			"....#.#",
			"......#",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 18,
		Floors:  40,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".#.....",
			".#.#...",
			".......",
			".....#.",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 19,
		Floors:  42,
	},
	{
		Map: []string{
			".......",
			".##....",
			"#.....#",
			".......",
			".......",
			"...#...",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 6},
		Optimal: 19,
		Floors:  43,
	},
	{
		Map: []string{
			"..#...#",
			".#.....",
			".....##",
			".......",
			"#....#.",
			".....#.",
			"..#....",
		},
		Start:   CubeFillCell{R: 2, C: 0},
		Optimal: 19,
		Floors:  40,
	},
	{
		Map: []string{
			".....#.",
			".......",
			".......",
			"#......",
			"...##..",
			".......",
			"....#..",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 19,
		Floors:  44,
	},
	{
		Map: []string{
			"..#....",
			".#.....",
			".....##",
			".....#.",
			"#....#.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 1},
		Optimal: 19,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			".#.....",
			".....##",
			".......",
			"#..#.##",
			"#......",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 4},
		Optimal: 19,
		Floors:  40,
	},
	{
		Map: []string{
			"......#",
			".#.....",
			".....##",
			".......",
			"#....#.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 3, C: 6},
		Optimal: 19,
		Floors:  42,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".......",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 19,
		Floors:  45,
	},
	{
		Map: []string{
			"..#....",
			".#.....",
			".....##",
			"......#",
			"#...#..",
			".......",
			"..#...#",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 19,
		Floors:  40,
	},
	{
		Map: []string{
			"....#..",
			"..#....",
			"......#",
			".......",
			".......",
			"#......",
			"...#...",
		},
		Start:   CubeFillCell{R: 1, C: 6},
		Optimal: 19,
		Floors:  44,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".......",
			".......",
			"#......",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 4},
		Optimal: 19,
		Floors:  44,
	},
	{
		Map: []string{
			"......#",
			".#.....",
			".....##",
			".......",
			"#....#.",
			"......#",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 19,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".......",
			".#.....",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 19,
		Floors:  44,
	},
	{
		Map: []string{
			"..#....",
			".......",
			".....##",
			".#.....",
			"#...##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 1, C: 0},
		Optimal: 20,
		Floors:  41,
	},
	{
		Map: []string{
			".#....#",
			"...#...",
			".......",
			"..#....",
			"#......",
			"....##.",
			".....#.",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 20,
		Floors:  41,
	},
	{
		Map: []string{
			"......#",
			".#.#...",
			".....##",
			"...#...",
			"#......",
			".......",
			".##....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 20,
		Floors:  40,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			"....#.#",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 20,
		Floors:  43,
	},
	{
		Map: []string{
			"#......",
			"...#...",
			"......#",
			".....#.",
			"....##.",
			"..#....",
			"#.....#",
		},
		Start:   CubeFillCell{R: 0, C: 4},
		Optimal: 20,
		Floors:  40,
	},
	{
		Map: []string{
			"..#....",
			".#.....",
			"......#",
			"....#..",
			"....##.",
			".......",
			"..#.#..",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 20,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			".##....",
			"#.....#",
			".......",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 2},
		Optimal: 20,
		Floors:  44,
	},
	{
		Map: []string{
			"..#..#.",
			".......",
			".....#.",
			"#......",
			".......",
			"...#...",
			"...#..#",
		},
		Start:   CubeFillCell{R: 4, C: 0},
		Optimal: 20,
		Floors:  42,
	},
	{
		Map: []string{
			"....#..",
			".....#.",
			"#......",
			".......",
			".......",
			".#.....",
			".#.##..",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 20,
		Floors:  42,
	},
	{
		Map: []string{
			"..#....",
			"..#....",
			"#......",
			".......",
			".......",
			"...#...",
			"...#..#",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 20,
		Floors:  43,
	},
	{
		Map: []string{
			"..#..#.",
			".......",
			".......",
			".......",
			"#.....#",
			"......#",
			"...#...",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 20,
		Floors:  43,
	},
	{
		Map: []string{
			"...#..#",
			".#.....",
			".....#.",
			".......",
			"#......",
			"......#",
			".##....",
		},
		Start:   CubeFillCell{R: 5, C: 0},
		Optimal: 20,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".......",
			".......",
			"......#",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 1},
		Optimal: 20,
		Floors:  44,
	},
	{
		Map: []string{
			"...#...",
			".......",
			".....#.",
			"..#....",
			"...#...",
			"#...#..",
			"#...#..",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 21,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#...#.#",
			".#..#..",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 4},
		Optimal: 21,
		Floors:  42,
	},
	{
		Map: []string{
			"#..#...",
			".#.....",
			"....##.",
			".......",
			".......",
			"......#",
			"..#....",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 21,
		Floors:  42,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".#.....",
			".#.....",
			".......",
			".....#.",
		},
		Start:   CubeFillCell{R: 6, C: 2},
		Optimal: 21,
		Floors:  43,
	},
	{
		Map: []string{
			".....#.",
			"..#....",
			"#.....#",
			".......",
			".#.....",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 2},
		Optimal: 21,
		Floors:  43,
	},
	{
		Map: []string{
			".......",
			"#.#....",
			"#.....#",
			".......",
			".......",
			".....#.",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 4},
		Optimal: 21,
		Floors:  43,
	},
	{
		Map: []string{
			".......",
			".##....",
			"#.....#",
			"......#",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 21,
		Floors:  43,
	},
	{
		Map: []string{
			".....#.",
			"..#....",
			"#.....#",
			".......",
			".#.....",
			".#.....",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 1},
		Optimal: 20,
		Floors:  42,
	},
	{
		Map: []string{
			"...#..#",
			".#.....",
			".....#.",
			"...#...",
			"#......",
			"......#",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 22,
		Floors:  41,
	},
	{
		Map: []string{
			".....#.",
			"..#....",
			"#.....#",
			".#.....",
			".#.....",
			".......",
			".....#.",
		},
		Start:   CubeFillCell{R: 5, C: 6},
		Optimal: 22,
		Floors:  42,
	},
	{
		Map: []string{
			"..#....",
			"...##..",
			"#......",
			".......",
			"......#",
			".#.....",
			"....##.",
		},
		Start:   CubeFillCell{R: 6, C: 3},
		Optimal: 23,
		Floors:  41,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".....#.",
			".......",
			"......#",
			"...#...",
		},
		Start:   CubeFillCell{R: 6, C: 4},
		Optimal: 22,
		Floors:  43,
	},
	{
		Map: []string{
			"..#....",
			".......",
			"#.##.#.",
			"..#....",
			"......#",
			".......",
			".#...#.",
		},
		Start:   CubeFillCell{R: 3, C: 0},
		Optimal: 23,
		Floors:  40,
	},
	{
		Map: []string{
			".#.....",
			"..#....",
			"#...#.#",
			"....#..",
			".......",
			".......",
			"...#...",
		},
		Start:   CubeFillCell{R: 5, C: 0},
		Optimal: 23,
		Floors:  42,
	},
	{
		Map: []string{
			".....#.",
			"..#....",
			"#.....#",
			".#.....",
			".#..#..",
			".......",
			".....#.",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 23,
		Floors:  41,
	},
	{
		Map: []string{
			".....#.",
			".##....",
			"#.....#",
			"...#.#.",
			".......",
			".......",
			"....#..",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 24,
		Floors:  41,
	},
	{
		Map: []string{
			".#.....",
			"..#....",
			"#....##",
			"....#..",
			".#.....",
			".......",
			".....#.",
		},
		Start:   CubeFillCell{R: 0, C: 2},
		Optimal: 24,
		Floors:  41,
	},
	{
		Map: []string{
			"..#..#.",
			"....#..",
			"......#",
			".#.....",
			"#...##.",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 6, C: 0},
		Optimal: 24,
		Floors:  40,
	},
	{
		Map: []string{
			"....#..",
			"#......",
			"...##.#",
			".#..#..",
			"#......",
			".......",
			"..#....",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 26,
		Floors:  40,
	},
	{
		Map: []string{
			".....#.",
			".##....",
			"#.....#",
			".....#.",
			".....#.",
			".#.....",
			"...##..",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 25,
		Floors:  39,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"##....#",
			".#.....",
			".#.#...",
			"...#...",
			"..#..#.",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 26,
		Floors:  39,
	},
	{
		Map: []string{
			".#...#.",
			"..#....",
			"#.....#",
			"....#..",
			".......",
			".##....",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 2},
		Optimal: 27,
		Floors:  40,
	},
	{
		Map: []string{
			".....#.",
			"..#....",
			"##....#",
			"...#...",
			".#.#...",
			".......",
			"..#..#.",
		},
		Start:   CubeFillCell{R: 0, C: 3},
		Optimal: 28,
		Floors:  39,
	},
	{
		Map: []string{
			".......",
			"..#....",
			"#.....#",
			".#...#.",
			".......",
			"......#",
			"...#...",
		},
		Start:   CubeFillCell{R: 0, C: 1},
		Optimal: 29,
		Floors:  42,
	},
}

func selectCubeFillLevelIndices(seed int64) []int {
	count := len(cubeFillLevels)
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

	return append([]int(nil), indices[:cubeFillRoundLevelCount]...)
}

func (s *Session) resetCubeFillLocked() {
	s.cubeLevelIndices = selectCubeFillLevelIndices(s.seed)
	s.cubeStates = make(map[uint]*CubeFillPlayerState, len(s.playerOrder))

	for _, userID := range s.playerOrder {
		state := &CubeFillPlayerState{}
		s.initCubeFillLevelLocked(state, 0)
		s.cubeStates[userID] = state
		s.updateCubeFillScoreLocked(userID)
	}
}

func (s *Session) initCubeFillLevelLocked(player *CubeFillPlayerState, slot int) {
	if player == nil || slot < 0 || slot >= cubeFillRoundLevelCount || slot >= len(s.cubeLevelIndices) {
		return
	}

	levelIndex := s.cubeLevelIndices[slot]
	if levelIndex < 0 || levelIndex >= len(cubeFillLevels) {
		return
	}

	level := cubeFillLevels[levelIndex]
	player.LevelSlot = slot
	player.Position = level.Start
	player.Painted = map[int]bool{cubeFillCellKey(level.Start): true}
	player.CurrentMoves = 0
}

func (s *Session) applyCubeFillEventLocked(
	userID uint,
	message ClientMessage,
	kind string,
) (int, bool, error) {
	if kind != "swipe" {
		return 0, false, errors.New("invalid cube fill event")
	}

	player := s.cubeStates[userID]
	if player == nil || player.Finished {
		return 0, false, nil
	}
	if player.LevelSlot < 0 || player.LevelSlot >= cubeFillRoundLevelCount {
		return 0, false, nil
	}
	if message.Value > 0 && message.Value != player.LevelSlot+1 {
		return 0, false, nil
	}

	direction := strings.TrimSpace(strings.ToLower(message.Grade))
	dr, dc := 0, 0
	switch direction {
	case "up":
		dr = -1
	case "down":
		dr = 1
	case "left":
		dc = -1
	case "right":
		dc = 1
	default:
		return 0, false, errors.New("invalid cube fill direction")
	}

	levelIndex := s.cubeLevelIndices[player.LevelSlot]
	level := cubeFillLevels[levelIndex]
	path := cubeFillSlidePath(level, player.Position, dr, dc)
	if len(path) == 0 {
		return 0, false, nil
	}

	previousScore := s.scores[userID]
	player.TotalMoves++
	player.CurrentMoves++

	for _, cell := range path {
		player.Painted[cubeFillCellKey(cell)] = true
	}
	player.Position = path[len(path)-1]

	if len(player.Painted) >= level.Floors {
		player.LevelMoves[player.LevelSlot] = player.CurrentMoves
		player.LevelSlot++

		if player.LevelSlot >= cubeFillRoundLevelCount {
			player.Finished = true
			player.LevelSlot = cubeFillRoundLevelCount
			player.CurrentMoves = 0
		} else {
			s.initCubeFillLevelLocked(player, player.LevelSlot)
		}
	}

	s.updateCubeFillScoreLocked(userID)
	return s.scores[userID] - previousScore, true, nil
}

func cubeFillSlidePath(level CubeFillLevel, from CubeFillCell, dr int, dc int) []CubeFillCell {
	result := make([]CubeFillCell, 0, 7)
	r, c := from.R, from.C

	for {
		nr := r + dr
		nc := c + dc
		if cubeFillBlocked(level, nr, nc) {
			break
		}
		r, c = nr, nc
		result = append(result, CubeFillCell{R: r, C: c})
	}

	return result
}

func cubeFillBlocked(level CubeFillLevel, r int, c int) bool {
	return r < 0 || c < 0 || r >= len(level.Map) || c >= len(level.Map[0]) || level.Map[r][c] == '#'
}

func cubeFillCellKey(cell CubeFillCell) int {
	return cell.R*16 + cell.C
}

func (s *Session) cubeFillCurrentLevelProgressLocked(player *CubeFillPlayerState) int {
	if player == nil {
		return 0
	}
	if player.Finished || player.LevelSlot >= cubeFillRoundLevelCount {
		return 100
	}

	levelIndex := s.cubeLevelIndices[player.LevelSlot]
	level := cubeFillLevels[levelIndex]
	if level.Floors <= 0 {
		return 0
	}
	return clampInt(len(player.Painted)*100/level.Floors, 0, 100)
}

func (s *Session) cubeFillProgressBPLocked(player *CubeFillPlayerState) int {
	if player == nil {
		return 0
	}
	if player.Finished || player.LevelSlot >= cubeFillRoundLevelCount {
		return 10000
	}

	base := player.LevelSlot * 2500
	levelIndex := s.cubeLevelIndices[player.LevelSlot]
	level := cubeFillLevels[levelIndex]
	if level.Floors <= 0 {
		return clampInt(base, 0, 10000)
	}

	current := len(player.Painted) * 2500 / level.Floors
	return clampInt(base+current, 0, 10000)
}

func (s *Session) cubeFillEfficiencyLocked(player *CubeFillPlayerState) int {
	if player == nil {
		return 0
	}

	total := 0
	completed := player.LevelSlot
	if player.Finished {
		completed = cubeFillRoundLevelCount
	}
	if completed > cubeFillRoundLevelCount {
		completed = cubeFillRoundLevelCount
	}

	for slot := 0; slot < completed; slot++ {
		moves := player.LevelMoves[slot]
		if moves <= 0 || slot >= len(s.cubeLevelIndices) {
			continue
		}
		levelIndex := s.cubeLevelIndices[slot]
		optimal := cubeFillLevels[levelIndex].Optimal
		if optimal <= 0 {
			continue
		}
		if moves < optimal {
			moves = optimal
		}
		bonus := (optimal*1000 + moves/2) / moves
		total += clampInt(bonus, 0, 1000)
	}

	return total
}

func (s *Session) updateCubeFillScoreLocked(userID uint) {
	player := s.cubeStates[userID]
	if player == nil {
		s.scores[userID] = 0
		return
	}

	progress := s.cubeFillProgressBPLocked(player)
	efficiency := s.cubeFillEfficiencyLocked(player)
	s.scores[userID] = progress + efficiency
}

func (s *Session) cubeFillAllFinishedLocked() bool {
	if s.gameCode != CubeFillGameCode || len(s.playerOrder) != 2 {
		return false
	}
	for _, userID := range s.playerOrder {
		player := s.cubeStates[userID]
		if player == nil || !player.Finished {
			return false
		}
	}
	return true
}

func clampInt(value int, minValue int, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
