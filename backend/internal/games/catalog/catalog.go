package catalog

type PvpGame struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
	MinBet      float64 `json:"min_bet,omitempty"`
	MaxBet      float64 `json:"max_bet,omitempty"`
}

const (
	MinPvpBet     = 2.0
	DefaultMaxBet = 500.0
)

var PvpGames = []PvpGame{
	{Code: "plinko_pvp", DisplayName: "Plinko PvP"},
	{Code: "descent_duel", DisplayName: "Descent Duel"},
	{Code: "paper_io", DisplayName: "Paper IO"},
	{Code: "tower_stack", DisplayName: "Tower Stack"},
	{Code: "crash_duel", DisplayName: "Crash Duel"},
	{Code: "grid_lock", DisplayName: "Grid Lock"},
	{Code: "dice_duel", DisplayName: "Dice Duel"},
	{Code: "neon_matrix", DisplayName: "Neon Matrix"},
	{Code: "disc_football", DisplayName: "Disc Football"},
	{Code: "dunk_shot", DisplayName: "Dunk Shot"},
	{Code: "flappy_race", DisplayName: "Flappy Race"},
	{Code: "doodle_jump", DisplayName: "Doodle Jump"},
	{Code: "crossy_pvp", DisplayName: "Crossy PVP"},
	{Code: "coin_chase", DisplayName: "Coin Chase"},
	{Code: "cube_fill", DisplayName: "Cube Fill"},
	{Code: "draw_drop", DisplayName: "Draw & Drop"},
	{Code: "ballz_duel", DisplayName: "Ballz Duel"},
	{Code: "tilt_maze", DisplayName: "Tilt Maze"},
}

func IsKnownPvpGame(code string) bool {
	for _, game := range PvpGames {
		if game.Code == code {
			return true
		}
	}
	return false
}
