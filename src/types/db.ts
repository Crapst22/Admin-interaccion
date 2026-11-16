export type SessionStatus = "waiting" | "running" | "finished";
export type MatchStatus = "pending" | "voting" | "done";
export type VoteChoice = "high" | "medium" | "low";
export type RiskLevel = VoteChoice;

export type Bracket = { id: string; owner_id: string; name: string; title: string; created_at: string };
export type Item = { id: string; bracket_id: string; name: string; image_url: string; position: number };
export type Session = {
  id: string; bracket_id: string; owner_id: string; status: SessionStatus;
  duration_seconds: number; current_match_id: string | null; created_at: string;
};
export type Match = {
  id: string; session_id: string; round: number; slot: number;
  item_id: string | null;
  votes_high: number; votes_medium: number; votes_low: number;
  status: MatchStatus; voting_ends_at: string | null;
};
export type ClassificationResult = {
  item_id: string; name: string; image_url: string;
  votes_high: number; votes_medium: number; votes_low: number;
  level: RiskLevel; level_votes: number; position: number;
};
