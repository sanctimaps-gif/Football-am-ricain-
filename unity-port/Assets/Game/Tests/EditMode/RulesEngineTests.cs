using GridironDynasty.Rules;
using NUnit.Framework;

namespace GridironDynasty.Tests
{
    /// <summary>Port d'un sous-ensemble de tests/unit/rules.test.ts (Unity Test Framework, EditMode).</summary>
    public class RulesEngineTests
    {
        static readonly RulesConfig R = new RulesConfig { QuarterMinutes = 3 };

        static GameState Scrimmage(int ballOn = 25, int down = 1, int toGo = 10)
        {
            var s = RulesEngine.Create(R);
            s.NextKind = NextKind.Scrimmage; s.Possession = 0; s.BallOn = ballOn; s.Down = down; s.ToGo = toGo;
            return s;
        }

        static PlayResult Run(float end) => new PlayResult { Kind = ResultKind.Scrimmage, Elapsed = 5, FinalPossessor = 0, EndSpot = end };

        [Test] public void GainOf4_Gives2ndAnd6()
        {
            var s = Scrimmage(25); RulesEngine.ResolvePlay(s, Run(29), R);
            Assert.AreEqual(2, s.Down); Assert.AreEqual(6, s.ToGo);
        }

        [Test] public void Touchdown_Is6Points_ThenConversion()
        {
            var s = Scrimmage(80); var tags = RulesEngine.ResolvePlay(s, Run(101), R);
            CollectionAssert.Contains(tags, "TOUCHDOWN"); Assert.AreEqual(6, s.Score[0]); Assert.AreEqual(NextKind.Conversion, s.NextKind);
        }

        [Test] public void FourthDownFailure_TurnoverOnDowns()
        {
            var s = Scrimmage(60, 4, 3); RulesEngine.ResolvePlay(s, Run(61), R);
            Assert.AreEqual(1, s.Possession); Assert.AreEqual(39, s.BallOn);
        }

        [Test] public void Safety_TwoPointsForDefense()
        {
            var s = Scrimmage(3); RulesEngine.ResolvePlay(s, Run(-1), R);
            Assert.AreEqual(2, s.Score[1]); Assert.AreEqual(20, s.BallOn); Assert.AreEqual(NextKind.Kickoff, s.NextKind);
        }

        [Test] public void FieldGoal_ThreePoints()
        {
            var s = Scrimmage(70, 4, 6);
            RulesEngine.ResolvePlay(s, new PlayResult { Kind = ResultKind.FieldGoal, FinalPossessor = 0, EndSpot = 70, KickGood = true }, R);
            Assert.AreEqual(3, s.Score[0]);
        }

        [Test] public void FalseStart_Minus5()
        {
            var s = Scrimmage(30, 2, 6);
            RulesEngine.ResolvePlay(s, new PlayResult { FinalPossessor = 0, EndSpot = 30, PreSnapPenalty = new PenaltyCall { Type = PenaltyType.FalseStart, Against = 0 } }, R);
            Assert.AreEqual(25, s.BallOn); Assert.AreEqual(11, s.ToGo);
        }

        [Test] public void EndOfRegulation_TieGoesToOvertime()
        {
            var s = Scrimmage(30); s.Quarter = 4; s.Clock = 1; s.Score = new[] { 7, 7 };
            var tags = RulesEngine.ResolvePlay(s, Run(33), R);
            CollectionAssert.Contains(tags, "OVERTIME"); Assert.AreEqual(5, s.Quarter); Assert.IsTrue(s.NeedsCoinToss);
        }
    }
}
