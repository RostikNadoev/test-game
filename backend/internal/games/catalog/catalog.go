package catalog

type PvpGame struct {
	Code        string `json:"code"`
	DisplayName string `json:"display_name"`
}

var PvpGames = []PvpGame{
	{Code: "plinko_pvp", DisplayName: "Plinko PvP"},
	{Code: "descent_duel", DisplayName: "Descent Duel"},
	{Code: "paper_io", DisplayName: "Paper IO"},
	{Code: "tower_stack", DisplayName: "Tower Stack"},
	{Code: "crash_duel", DisplayName: "Crash Duel"},
	{Code: "virus_market", DisplayName: "Virus Market"},
	{Code: "rps_duel", DisplayName: "RPS Duel"},
	{Code: "grid_lock", DisplayName: "Grid Lock"},
	{Code: "blackjack_duel", DisplayName: "Blackjack Duel"},
	{Code: "dice_duel", DisplayName: "Dice Duel"},
	{Code: "neon_matrix", DisplayName: "Neon Matrix"},
	{Code: "street_race", DisplayName: "Street Race"},
	{Code: "air_hockey", DisplayName: "Air Hockey"},
}

func IsKnownPvpGame(code string) bool {
	for _, g := range PvpGames {
		if g.Code == code {
			return true
		}
	}
	return false
}
