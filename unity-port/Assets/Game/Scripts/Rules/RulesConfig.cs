using System;

namespace GridironDynasty.Rules
{
    /// <summary>Règlement de compétition centralisé (port de src/rules/config.ts).</summary>
    [Serializable]
    public class RulesConfig
    {
        public float QuarterMinutes = 3f;
        public int TimeoutsPerHalf = 3;
        public int KickoffSpot = 35;
        public int SafetyFreeKickSpot = 20;
        public int KickoffTouchbackSpot = 25;
        public int PuntTouchbackSpot = 20;
        public int KickoffOutOfBoundsSpot = 40;
        public int ExtraPointSpot = 15;
        public int TwoPointSpot = 2;
        public int RunoffSecondsPer15 = 28;
        public bool OvertimeEnabled = true;
        public bool OvertimeAllowTie = true;
        public float OvertimeLengthRatio = 2f / 3f;
        public bool PenaltiesEnabled = true;

        public int RunoffSeconds => Math.Max(2, (int)Math.Round(RunoffSecondsPer15 * QuarterMinutes / 15f));
        public float QuarterSeconds => (float)Math.Round(QuarterMinutes * 60f);
        public float OvertimeSeconds => (float)Math.Round(QuarterSeconds * OvertimeLengthRatio);

        public RulesConfig PlayoffVariant()
        {
            var c = (RulesConfig)MemberwiseClone();
            c.OvertimeEnabled = true;
            c.OvertimeAllowTie = false;
            return c;
        }
    }
}
