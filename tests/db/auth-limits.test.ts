// Runs against the throwaway test database: npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCaptcha, makeCaptcha } from "../../src/modules/auth/rate-limit";

const answerOf = (q: string) => String(q.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0));

test("check question: the right answer works once, and can't be replayed", async () => {
  const c = makeCaptcha();
  assert.equal(await checkCaptcha(answerOf(c.question), c.token), true);
  assert.equal(await checkCaptcha(answerOf(c.question), c.token), false, "the same question can't be used again");
});

test("check question: one try per question, so guessing every number doesn't work", async () => {
  const c = makeCaptcha();
  const wrong = String(Number(answerOf(c.question)) + 1);
  assert.equal(await checkCaptcha(wrong, c.token), false);
  assert.equal(await checkCaptcha(answerOf(c.question), c.token), false, "after a wrong answer the question is used up");
});

test("check question: a made-up or expired token is refused", async () => {
  assert.equal(await checkCaptcha("5", "not-a-token"), false);
  const old = `${Date.now() - 1000}.abc`;
  assert.equal(await checkCaptcha("5", old), false);
});
