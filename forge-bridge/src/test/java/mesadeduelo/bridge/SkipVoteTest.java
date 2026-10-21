package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.Set;
import org.junit.Test;

public class SkipVoteTest {
    @Test public void aloneOnlineDecidesAlone() {
        SkipVote v = new SkipVote(1); v.vote(0, true);
        assertEquals(SkipVote.Result.APPROVED, v.result(Set.of(0)));
    }

    @Test public void majorityOfThoseOnline() {
        assertEquals(2, SkipVote.needed(2)); assertEquals(2, SkipVote.needed(3)); assertEquals(3, SkipVote.needed(4));
        SkipVote v = new SkipVote(3); v.vote(0, true);
        assertEquals(SkipVote.Result.OPEN, v.result(Set.of(0, 1, 2)));
        v.vote(1, true);
        assertEquals(SkipVote.Result.APPROVED, v.result(Set.of(0, 1, 2)));
    }

    @Test public void rejectedOnceMajorityIsImpossible() {
        SkipVote v = new SkipVote(3); v.vote(0, true); v.vote(1, false);
        assertEquals(SkipVote.Result.OPEN, v.result(Set.of(0, 1, 2)));
        v.vote(2, false);
        assertEquals(SkipVote.Result.REJECTED, v.result(Set.of(0, 1, 2)));
    }

    @Test public void votersWhoDropStopCounting() {
        SkipVote v = new SkipVote(3); v.vote(0, true); v.vote(1, false);
        // Player 1 also disconnects: player 0 is now the only voter online.
        assertEquals(SkipVote.Result.APPROVED, v.result(Set.of(0)));
        assertEquals(SkipVote.Result.REJECTED, new SkipVote(3).result(Set.of()));
    }

    @Test public void changingTheVote() {
        SkipVote v = new SkipVote(2); v.vote(0, false); v.vote(0, true);
        assertEquals(Set.of(0), v.yes); assertTrue(v.no.isEmpty());
    }
}
