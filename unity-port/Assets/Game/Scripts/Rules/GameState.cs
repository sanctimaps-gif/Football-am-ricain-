using System;
using System.Collections.Generic;

namespace GridironDynasty.Rules
{
    public enum NextKind { Kickoff, Scrimmage, Conversion }
    public enum ResultKind { Scrimmage, Kickoff, Punt, FieldGoal, ExtraPoint, Kneel }
    public enum PenaltyType { FalseStart, Offside, Holding, PassInterference, Facemask }
    public enum Turnover { None, Interception, Fumble }

    [Serializable]
    public class PenaltyCall
    {
        public PenaltyType Type;
        public int Against; // 0 domicile, 1 extérieur
        public float? Spot;
    }

    [Serializable]
    public class TeamStats
    {
        public int FirstDowns, TotalYards, PassAtt, PassComp, PassYds, PassTD, RushAtt, RushYds, RushTD;
        public int Sacks, InterceptionsThrown, FumblesLost, Penalties, PenaltyYds, Punts;
        public int FgMade, FgAtt, XpMade, XpAtt, TwoPtMade, TwoPtAtt, ThirdDownAtt, ThirdDownConv;
        public float TimeOfPossession;

        public TeamStats Clone() => (TeamStats)MemberwiseClone();
    }

    /// <summary>Faits physiques d'une action, rapportés par la simulation (port de PlayResult).</summary>
    [Serializable]
    public class PlayResult
    {
        public ResultKind Kind = ResultKind.Scrimmage;
        public float Elapsed;
        public int FinalPossessor;
        /// <summary>Yards depuis la ligne de but de l'équipe qui avait le ballon au snap.</summary>
        public float EndSpot;
        public bool Incomplete, OutOfBounds, PossessionChangedInEndZone, KickTouchback, KickOutOfBounds, FairCatch, KickGood;
        public Turnover Turnover = Turnover.None;
        public PenaltyCall PreSnapPenalty;
        public List<PenaltyCall> Penalties = new List<PenaltyCall>();
    }

    [Serializable]
    public class OvertimeState
    {
        public int FirstPossessor;
        public int PossessionsCompleted;
    }

    [Serializable]
    public class GameState
    {
        public int Quarter = 1;
        public float Clock;
        public int[] Score = new int[2];
        public int Possession;
        public int BallOn;
        public int Down = 1;
        public int ToGo = 10;
        public int[] Timeouts = new int[2];
        public NextKind NextKind = NextKind.Kickoff;
        public bool ClockRunning;
        public int OpeningKicker;
        public OvertimeState Ot;
        public bool NeedsCoinToss;
        public bool Finished;
        public int? Winner;
        public TeamStats[] TeamStats = { new TeamStats(), new TeamStats() };
        public int PlayNumber;

        public GameState Clone()
        {
            // copie profonde simple (les tableaux et statistiques sont dupliqués)
            var c = (GameState)MemberwiseClone();
            c.Score = (int[])Score.Clone();
            c.Timeouts = (int[])Timeouts.Clone();
            c.TeamStats = new[] { TeamStats[0].Clone(), TeamStats[1].Clone() };
            if (Ot != null) c.Ot = new OvertimeState { FirstPossessor = Ot.FirstPossessor, PossessionsCompleted = Ot.PossessionsCompleted };
            return c;
        }
    }
}
