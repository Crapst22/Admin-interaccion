export type SessionStatus = "waiting" | "running" | "finished";
export type MatchStatus = "pending" | "voting" | "done";
export type VoteChoice = "a" | "b";

export type Bracket = { id: string; owner_id: string; name: string; created_at: string };
export type Item = { id: string; bracket_id: string; name: string; image_url: string; position: number };
export type Session = {
  id: string; bracket_id: string; owner_id: string; status: SessionStatus;
  duration_seconds: number; current_match_id: string | null; created_at: string;
};
export type Match = {
  id: string; session_id: string; round: number; slot: number;
  item_a_id: string | null; item_b_id: string | null; winner_id: string | null;
  votes_a: number; votes_b: number; status: MatchStatus; voting_ends_at: string | null;
  next_match_id: string | null; next_slot: "a" | "b" | null;
  is_bye: boolean; tie_broken: boolean;
};
export type Standing = {
  item_id: string; name: string; image_url: string; total_votes: number;
  round_reached: number; matches_played: number; position: number; label: string;
};
