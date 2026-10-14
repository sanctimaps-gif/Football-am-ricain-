using System;
using System.Collections.Generic;

namespace GridironDynasty.Rules
{
    /// <summary>
    /// Moteur de règles pur (port C# de src/rules/engine.ts). Aucune dépendance à UnityEngine :
    /// testable en EditMode et réutilisable côté serveur.
    /// </summary>
    public static class RulesEngine
    {
        public static int Other(int side) => side == 0 ? 1 : 0;

        public static GameState Create(RulesConfig r, int openingKicker = 0)
        {
            return new GameState
            {
                Clock = r.QuarterSeconds,
                Possession = openingKicker,
                BallOn = r.KickoffSpot,
                Timeouts = new[] { r.TimeoutsPerHalf, r.TimeoutsPerHalf },
                OpeningKicker = openingKicker,
            };
        }

        public static void ApplyCoinToss(GameState s, int receiver, RulesConfig r)
        {
            int kicker = Other(receiver);
            if (s.Quarter >= 5) { s.Ot = new OvertimeState { FirstPossessor = receiver }; s.NeedsCoinToss = false; }
            else s.OpeningKicker = kicker;
            SetKickoff(s, kicker, r.KickoffSpot);
        }

        static void SetKickoff(GameState s, int kicker, int spot)
        {
            s.NextKind = NextKind.Kickoff; s.Possession = kicker; s.BallOn = spot; s.Down = 1; s.ToGo = 10; s.ClockRunning = false;
        }

        static int Clamp(float v) => Math.Max(1, Math.Min(99, (int)Math.Round(v)));

        static void SetFirstDown(GameState s, int team, float ballOn)
        {
            s.Possession = team; s.BallOn = Clamp(ballOn); s.Down = 1; s.ToGo = Math.Min(10, 100 - s.BallOn); s.NextKind = NextKind.Scrimmage;
        }

        public static int? Leader(GameState s) => s.Score[0] > s.Score[1] ? 0 : s.Score[1] > s.Score[0] ? 1 : (int?)null;

        static int Owner(GameState s) => s.NextKind == NextKind.Kickoff ? Other(s.Possession) : s.Possession;

        public static float ApplyRunoff(GameState s, RulesConfig r)
        {
            if (!s.ClockRunning || s.NextKind != NextKind.Scrimmage) return 0;
            float before = s.Clock;
            s.Clock = Math.Max(Math.Min(s.Clock, 1f), s.Clock - r.RunoffSeconds);
            s.TeamStats[s.Possession].TimeOfPossession += before - s.Clock;
            return before - s.Clock;
        }

        public static bool CallTimeout(GameState s, int team)
        {
            if (s.Timeouts[team] <= 0 || s.Finished) return false;
            s.Timeouts[team]--; s.ClockRunning = false; return true;
        }

        public static void SetConversionType(GameState s, bool kick, RulesConfig r)
        {
            s.BallOn = 100 - (kick ? r.ExtraPointSpot : r.TwoPointSpot); s.Down = 1; s.ToGo = 100 - s.BallOn;
        }

        static int PenaltyYards(PenaltyType t) => t == PenaltyType.FalseStart || t == PenaltyType.Offside ? 5 : t == PenaltyType.Holding ? 10 : t == PenaltyType.Facemask ? 15 : 0;

        public static float StateValue(GameState s, int team)
        {
            float v = s.Score[team] - s.Score[Other(team)];
            int pos = s.NextKind == NextKind.Kickoff ? Other(s.Possession) : s.Possession;
            float field = s.NextKind == NextKind.Kickoff ? 0.8f : s.NextKind == NextKind.Conversion ? 0.9f
                : (s.BallOn - 25) / 14f - (s.Down - 1) * 0.45f - Math.Min(s.ToGo, 25) * 0.05f + (s.Down == 4 ? -1.2f : 0f);
            return v + (pos == team ? field : -field);
        }

        /// <summary>Applique le résultat d'une action. Unique point d'entrée de l'évolution du match.</summary>
        public static List<string> ResolvePlay(GameState s, PlayResult res, RulesConfig r)
        {
            var tags = new List<string>();
            if (s.Finished) { tags.Add("IGNORED_FINISHED"); return tags; }
            int ownerBefore = Owner(s);
            int s0 = s.Score[0], s1 = s.Score[1];
            bool wasConv = s.NextKind == NextKind.Conversion;
            s.PlayNumber++;
            if (!wasConv) { s.TeamStats[s.Possession].TimeOfPossession += Math.Min(res.Elapsed, s.Clock); s.Clock = Math.Max(0, s.Clock - res.Elapsed); }

            if (res.PreSnapPenalty != null && r.PenaltiesEnabled) EnforcePreSnap(s, res.PreSnapPenalty, tags);
            else
            {
                var pens = r.PenaltiesEnabled ? res.Penalties : new List<PenaltyCall>();
                bool both = pens.Exists(p => p.Against == 0) && pens.Exists(p => p.Against == 1);
                if (both) { tags.Add("PENALTY:offsetting"); s.ClockRunning = false; foreach (var p in pens) s.TeamStats[p.Against].Penalties++; }
                else if (pens.Count > 0)
                {
                    var pen = pens[0];
                    int victim = Other(pen.Against);
                    var declined = s.Clone(); var dTags = ApplyOutcome(declined, res, r);
                    var accepted = s.Clone(); var aTags = EnforceLive(accepted, res, pen, r);
                    var chosen = StateValue(accepted, victim) >= StateValue(declined, victim) ? accepted : declined;
                    tags.AddRange(chosen == accepted ? aTags : dTags);
                    tags.Add($"PENALTY:{pen.Type}:{(chosen == accepted ? "accepted" : "declined")}");
                    CopyInto(chosen, s);
                    s.TeamStats[pen.Against].Penalties++;
                }
                else tags.AddRange(ApplyOutcome(s, res, r));
            }

            if (s.Ot != null && !s.Finished)
            {
                int ownerAfter = Owner(s);
                bool scored = s.Score[0] != s0 || s.Score[1] != s1;
                int completedBefore = s.Ot.PossessionsCompleted;
                if (ownerAfter != ownerBefore) s.Ot.PossessionsCompleted++;
                if (scored)
                {
                    if (!tags.Contains("FG_GOOD")) Finish(s, tags);
                    else if ((completedBefore > 0 || ownerBefore != s.Ot.FirstPossessor) && Leader(s) != null) Finish(s, tags);
                }
                else if (s.Ot.PossessionsCompleted >= 2 && Leader(s) != null) Finish(s, tags);
            }
            if (!s.Finished && s.Clock <= 0 && s.NextKind != NextKind.Conversion) EndPeriod(s, r, tags);
            return tags;
        }

        static void CopyInto(GameState src, GameState dst)
        {
            dst.Quarter = src.Quarter; dst.Clock = src.Clock; dst.Score = src.Score; dst.Possession = src.Possession; dst.BallOn = src.BallOn;
            dst.Down = src.Down; dst.ToGo = src.ToGo; dst.Timeouts = src.Timeouts; dst.NextKind = src.NextKind; dst.ClockRunning = src.ClockRunning;
            dst.Ot = src.Ot; dst.NeedsCoinToss = src.NeedsCoinToss; dst.Finished = src.Finished; dst.Winner = src.Winner; dst.TeamStats = src.TeamStats;
        }

        static void Finish(GameState s, List<string> tags) { s.Finished = true; s.Winner = Leader(s); s.ClockRunning = false; tags.Add("GAME_OVER"); }

        static void EndPeriod(GameState s, RulesConfig r, List<string> tags)
        {
            int q = s.Quarter;
            if (q == 1 || q == 3) { s.Quarter++; s.Clock = r.QuarterSeconds; s.ClockRunning = false; tags.Add("END_QUARTER"); }
            else if (q == 2)
            {
                s.Quarter = 3; s.Clock = r.QuarterSeconds; s.Timeouts = new[] { r.TimeoutsPerHalf, r.TimeoutsPerHalf };
                tags.Add("HALFTIME"); SetKickoff(s, Other(s.OpeningKicker), r.KickoffSpot);
            }
            else
            {
                if (Leader(s) != null) { Finish(s, tags); return; }
                bool canOt = r.OvertimeEnabled && (q == 4 || !r.OvertimeAllowTie);
                if (!canOt) { Finish(s, tags); return; }
                s.Quarter = q + 1; s.Clock = r.OvertimeSeconds; s.ClockRunning = false; s.Timeouts = new[] { 2, 2 }; tags.Add("OVERTIME");
                if (q == 4) { s.NeedsCoinToss = true; SetKickoff(s, 0, r.KickoffSpot); }
            }
        }

        static void ScoreTouchdown(GameState s, int team, RulesConfig r, List<string> tags)
        {
            s.Score[team] += 6; tags.Add("TOUCHDOWN"); s.ClockRunning = false; s.Possession = team;
            s.NextKind = NextKind.Conversion; s.BallOn = 100 - r.ExtraPointSpot; s.Down = 1; s.ToGo = r.ExtraPointSpot;
        }

        static void ScoreSafety(GameState s, int conceding, RulesConfig r, List<string> tags)
        {
            s.Score[Other(conceding)] += 2; tags.Add("SAFETY"); SetKickoff(s, conceding, r.SafetyFreeKickSpot);
        }

        static void EnforcePreSnap(GameState s, PenaltyCall pen, List<string> tags)
        {
            int yards = PenaltyYards(pen.Type);
            s.TeamStats[pen.Against].Penalties++;
            if (pen.Against == s.Possession)
            {
                int d = Math.Min(yards, s.BallOn / 2); s.BallOn -= d; s.ToGo += d; s.TeamStats[pen.Against].PenaltyYds += d;
            }
            else
            {
                int d = Math.Min(yards, (100 - s.BallOn) / 2); s.BallOn += d; s.ToGo -= d; s.TeamStats[pen.Against].PenaltyYds += d;
                if (s.ToGo <= 0) { s.Down = 1; s.ToGo = Math.Min(10, 100 - s.BallOn); tags.Add("FIRST_DOWN"); }
            }
            s.BallOn = Clamp(s.BallOn); s.ClockRunning = false; tags.Add($"PENALTY:{pen.Type}");
        }

        static List<string> EnforceLive(GameState s, PlayResult res, PenaltyCall pen, RulesConfig r)
        {
            var tags = new List<string>();
            int off = s.Possession;
            s.ClockRunning = false;
            if (pen.Type == PenaltyType.Holding && pen.Against == off)
            {
                int d = Math.Min(10, s.BallOn / 2); s.BallOn = Clamp(s.BallOn - d); s.ToGo += d; s.TeamStats[off].PenaltyYds += d; return tags;
            }
            if (pen.Type == PenaltyType.PassInterference && pen.Against != off)
            {
                float spot = Math.Min(99, pen.Spot ?? s.BallOn + 5);
                s.TeamStats[pen.Against].PenaltyYds += (int)Math.Max(1, spot - s.BallOn);
                if (s.NextKind == NextKind.Conversion) { s.BallOn = 99; s.ToGo = 1; return tags; }
                s.TeamStats[off].FirstDowns++; SetFirstDown(s, off, Math.Max(s.BallOn + 1, spot)); tags.Add("FIRST_DOWN"); return tags;
            }
            if (pen.Type == PenaltyType.Facemask && pen.Against != off)
            {
                tags.AddRange(ApplyOutcome(s, res, r));
                if (s.Possession == off && s.NextKind == NextKind.Scrimmage)
                {
                    int d = Math.Min(15, (100 - s.BallOn) / 2); s.TeamStats[pen.Against].PenaltyYds += d; SetFirstDown(s, off, s.BallOn + d);
                    if (!tags.Contains("FIRST_DOWN")) tags.Add("FIRST_DOWN");
                }
                s.ClockRunning = false; return tags;
            }
            return ApplyOutcome(s, res, r);
        }

        static List<string> ApplyOutcome(GameState s, PlayResult res, RulesConfig r)
        {
            var tags = new List<string>();
            int off = s.Possession, def = Other(off), los = s.BallOn, P = res.FinalPossessor;
            float spotP = P == off ? res.EndSpot : 100 - res.EndSpot;
            if (res.Kind == ResultKind.Kneel) { AdvanceDowns(s, Math.Max(1, los - 1), tags); s.ClockRunning = true; return tags; }
            if (s.NextKind == NextKind.Conversion)
            {
                var ts = s.TeamStats[off];
                if (res.Kind == ResultKind.ExtraPoint) { ts.XpAtt++; if (res.KickGood) { ts.XpMade++; s.Score[off] += 1; tags.Add("XP_GOOD"); } else tags.Add("XP_NO_GOOD"); }
                else
                {
                    ts.TwoPtAtt++;
                    if (P == off && spotP >= 100 && !res.Incomplete) { ts.TwoPtMade++; s.Score[off] += 2; tags.Add("TWO_PT_GOOD"); }
                    else if (P == def && spotP >= 100) { s.Score[def] += 2; tags.Add("DEFENSIVE_TWO_PT"); }
                    else tags.Add("TWO_PT_FAILED");
                }
                SetKickoff(s, off, r.KickoffSpot); return tags;
            }
            if (res.Kind == ResultKind.FieldGoal)
            {
                s.TeamStats[off].FgAtt++;
                if (res.KickGood) { s.TeamStats[off].FgMade++; s.Score[off] += 3; tags.Add("FG_GOOD"); SetKickoff(s, off, r.KickoffSpot); }
                else { tags.Add("FG_NO_GOOD"); SetFirstDown(s, def, Math.Max(20, 100 - (los - 7))); s.ClockRunning = false; }
                return tags;
            }
            if (res.Kind == ResultKind.Kickoff || res.Kind == ResultKind.Punt)
            {
                int kicker = off, receiver = def;
                if (res.Kind == ResultKind.Punt) s.TeamStats[kicker].Punts++;
                s.ClockRunning = false;
                if (res.KickOutOfBounds && P == receiver) { SetFirstDown(s, receiver, res.Kind == ResultKind.Kickoff ? r.KickoffOutOfBoundsSpot : Math.Max(1, 100 - res.EndSpot)); tags.Add("KICK_OUT_OF_BOUNDS"); return tags; }
                if (res.KickTouchback) { SetFirstDown(s, receiver, res.Kind == ResultKind.Kickoff ? r.KickoffTouchbackSpot : r.PuntTouchbackSpot); tags.Add("TOUCHBACK"); return tags; }
                if (P == receiver)
                {
                    if (spotP >= 100) { ScoreTouchdown(s, receiver, r, tags); tags.Add("RETURN_TD"); }
                    else if (spotP <= 0)
                    {
                        if (res.PossessionChangedInEndZone) { SetFirstDown(s, receiver, res.Kind == ResultKind.Kickoff ? r.KickoffTouchbackSpot : r.PuntTouchbackSpot); tags.Add("TOUCHBACK"); }
                        else ScoreSafety(s, receiver, r, tags);
                    }
                    else { SetFirstDown(s, receiver, spotP); if (res.FairCatch) tags.Add("FAIR_CATCH"); }
                }
                else { tags.Add("KICK_RECOVERED"); if (spotP >= 100) ScoreTouchdown(s, kicker, r, tags); else SetFirstDown(s, kicker, spotP); }
                return tags;
            }
            if (P == off)
            {
                if (res.Incomplete) { tags.Add("INCOMPLETE"); s.ClockRunning = false; AdvanceDowns(s, los, tags); return tags; }
                if (spotP >= 100) { ScoreTouchdown(s, off, r, tags); return tags; }
                if (spotP <= 0) { ScoreSafety(s, off, r, tags); return tags; }
                s.ClockRunning = !res.OutOfBounds;
                AdvanceDowns(s, Math.Min(99, (int)Math.Round(spotP)), tags);
                return tags;
            }
            tags.Add(res.Turnover == Turnover.Interception ? "INTERCEPTION" : "FUMBLE_LOST");
            s.ClockRunning = false;
            if (spotP >= 100) { ScoreTouchdown(s, def, r, tags); tags.Add("DEFENSIVE_TD"); }
            else if (spotP <= 0) { if (res.PossessionChangedInEndZone) { SetFirstDown(s, def, 20); tags.Add("TOUCHBACK"); } else ScoreSafety(s, def, r, tags); }
            else SetFirstDown(s, def, spotP);
            return tags;
        }

        static bool AdvanceDowns(GameState s, int newSpot, List<string> tags)
        {
            int off = s.Possession;
            int line = s.BallOn + s.ToGo;
            bool third = s.Down == 3;
            if (third) s.TeamStats[off].ThirdDownAtt++;
            if (newSpot >= line)
            {
                if (third) { tags.Add("THIRD_DOWN_CONV"); s.TeamStats[off].ThirdDownConv++; }
                s.TeamStats[off].FirstDowns++; SetFirstDown(s, off, newSpot); tags.Add("FIRST_DOWN"); return true;
            }
            s.Down++; s.BallOn = Clamp(newSpot); s.ToGo = Math.Max(1, line - s.BallOn);
            if (s.Down > 4) { tags.Add("TURNOVER_ON_DOWNS"); SetFirstDown(s, Other(off), 100 - s.BallOn); s.ClockRunning = false; }
            return false;
        }

        /// <summary>Direction d'attaque (+1 vers x croissant) d'une équipe selon le quart-temps.</summary>
        public static int AttackDir(int team, int quarter)
        {
            int home = quarter % 2 == 1 ? 1 : -1;
            return team == 0 ? home : -home;
        }
    }
}
